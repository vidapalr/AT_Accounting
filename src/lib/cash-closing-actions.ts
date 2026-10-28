"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canRedoCashClosing } from "@/lib/access";
import { dayBefore, loadCashMovements, previousClosing } from "@/lib/cash-closing";
import { denominationTotal, parseDenominations } from "@/lib/cash-denominations";
import { cashDifference, expectedCash, paiseText, parseRupees } from "@/lib/cash-math";

const PAGE = "/accounting/cash-closing";
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function go(account: number, date: string, kind: "saved" | "error", message: string): never {
  redirect(`${PAGE}?account=${account}&date=${date}&${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

export async function closeCashDayAction(formData: FormData) {
  const user = await requireAccess("cash_closing");
  const businessId = user.legal_business_id;
  const text = (n: string) => String(formData.get(n) ?? "").trim();
  const accountId = Number(text("cash_account_id"));
  const date = text("closing_date");
  const note = text("note").slice(0, 300);

  if (!Number.isInteger(accountId) || accountId <= 0) redirect(PAGE);
  if (!validDate(date) || date > todayIso()) go(accountId, todayIso(), "error", "Choose a valid day, not in the future.");

  let counted: bigint, takenOut: bigint, openingTyped: bigint | null = null;
  try {
    counted = parseRupees(text("counted"));
    takenOut = text("taken_out") === "" ? 0n : parseRupees(text("taken_out"));
    if (text("opening") !== "") openingTyped = parseRupees(text("opening"));
  } catch {
    go(accountId, date, "error", "Enter the amounts in rupees, for example 12500 or 12500.50.");
  }

  // Where the cash taken away went: nothing, the owner, or one of the business bank accounts.
  const toRaw = text("taken_to");
  let takenTo: "BANK" | "OWNER" | null = null;
  let takenBankId: number | null = null;
  if (takenOut > 0n) {
    const m = /^BANK:([1-9]\d*)$/.exec(toRaw);
    if (toRaw === "OWNER") takenTo = "OWNER";
    else if (m) { takenTo = "BANK"; takenBankId = Number(m[1]); }
    else go(accountId, date, "error", "Say where the cash taken away went: a bank account, or the owner.");
    if (takenBankId !== null) {
      const [b] = await db.execute<RowDataPacket[]>(
        `SELECT id FROM acct_bank_accounts WHERE id = ? AND legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE'`,
        [takenBankId, businessId]
      );
      if (b.length !== 1) go(accountId, date, "error", "That bank account cannot be used.");
    }
  }

  let denomJson: string | null = null;
  try {
    const d = parseDenominations(text("denominations"));
    if (d) {
      if (denominationTotal(d.notes, d.coins) !== counted) {
        go(accountId, date, "error", "The notes do not add up to the amount counted. Please count again.");
      }
      denomJson = JSON.stringify({ notes: d.notes, coins: Number(d.coins) });
    }
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    go(accountId, date, "error", "The note counts are not valid. Please count again.");
  }

  const [accounts] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_cash_accounts WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
    [accountId, businessId]
  );
  if (accounts.length !== 1) go(accountId, date, "error", "That cash drawer is not available.");

  const [existing] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_cash_closings WHERE legal_business_id = ? AND cash_account_id = ? AND closing_date = ?`,
    [businessId, accountId, date]
  );
  if (existing.length > 0 && !canRedoCashClosing(user.role)) {
    go(accountId, date, "error", "This day is already closed. Ask the owner or accountant to change it.");
  }

  if (existing.length > 0) {
    // Once the cash taken away is in the books, changing it would make the books and this record disagree.
    const [old] = await db.execute<RowDataPacket[]>(`SELECT taken_out, taken_to, taken_bank_id FROM acct_cash_closings WHERE id = ?`, [existing[0].id]);
    const [posted] = await db.execute<RowDataPacket[]>(
      `SELECT j.id FROM acct_journal_entries j
        WHERE j.legal_business_id = ? AND j.source_type = 'CASH_TAKEN' AND j.source_id = ? AND j.status = 'POSTED'
          AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r WHERE r.legal_business_id = j.legal_business_id AND r.original_journal_id = j.id) LIMIT 1`,
      [businessId, existing[0].id]
    );
    const o = old[0];
    const changed = paiseText(takenOut) !== paiseText(BigInt(Math.round(Number(o?.taken_out ?? 0) * 100))) || (o?.taken_to ?? null) !== takenTo || (o?.taken_bank_id ? Number(o.taken_bank_id) : null) !== takenBankId;
    if (posted.length > 0 && changed) {
      go(accountId, date, "error", "The cash taken away on this day is already in the books, so it cannot be changed here. Ask for it to be reversed first.");
    }
  }

  const prev = await previousClosing(db, businessId, accountId, date);
  const opening = prev ? prev.counted : (openingTyped ?? 0n);
  const lines = await loadCashMovements(db, businessId, accountId, prev ? prev.date : dayBefore(date), date);
  const cashIn = lines.filter((l) => l.direction === "IN").reduce((s, l) => s + l.amount, 0n);
  const cashOut = lines.filter((l) => l.direction === "OUT").reduce((s, l) => s + l.amount, 0n);
  const expected = expectedCash({ opening, cashIn, cashOut, takenOut });
  const diff = cashDifference(expected, counted);
  if (diff !== 0n && note.length < 3) {
    go(accountId, date, "error", "The count does not match. Write a short reason, for example: gave change, will check tomorrow.");
  }

  const values = [
    paiseText(opening), paiseText(cashIn), paiseText(cashOut), paiseText(takenOut),
    paiseText(expected), paiseText(counted), paiseText(diff), note || null, denomJson, takenTo, takenBankId,
  ];
  if (existing.length > 0) {
    await db.execute(
      `UPDATE acct_cash_closings
          SET opening_amount = ?, cash_in = ?, cash_out = ?, taken_out = ?, expected_amount = ?,
              counted_amount = ?, difference = ?, note = ?, denominations_json = ?, taken_to = ?, taken_bank_id = ?, redone_by = ?, redone_at = NOW()
        WHERE id = ? AND legal_business_id = ?`,
      [...values, user.id, existing[0].id, businessId]
    );
  } else {
    await db.execute(
      `INSERT INTO acct_cash_closings
         (legal_business_id, cash_account_id, closing_date, opening_amount, cash_in, cash_out, taken_out,
          expected_amount, counted_amount, difference, note, denominations_json, taken_to, taken_bank_id, closed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, accountId, date, ...values, user.id]
    );
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, ?, 'CASH_CLOSING', ?, ?)`,
    [businessId, user.id, existing.length > 0 ? "CASH_CLOSING_REDONE" : "CASH_CLOSED", accountId,
     JSON.stringify({ date, expected: paiseText(expected), counted: paiseText(counted), difference: paiseText(diff), note, denominations: denomJson ? JSON.parse(denomJson) : null })]
  );
  revalidatePath(PAGE);
  go(accountId, date, "saved",
    diff === 0n ? "Day closed. The cash matches exactly." : `Day closed. Cash is ${diff < 0n ? "short" : "extra"} by ₹${paiseText(diff < 0n ? -diff : diff)}.`);
}
