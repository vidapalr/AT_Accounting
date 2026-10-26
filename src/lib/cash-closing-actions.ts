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
    paiseText(expected), paiseText(counted), paiseText(diff), note || null, denomJson,
  ];
  if (existing.length > 0) {
    await db.execute(
      `UPDATE acct_cash_closings
          SET opening_amount = ?, cash_in = ?, cash_out = ?, taken_out = ?, expected_amount = ?,
              counted_amount = ?, difference = ?, note = ?, denominations_json = ?, redone_by = ?, redone_at = NOW()
        WHERE id = ? AND legal_business_id = ?`,
      [...values, user.id, existing[0].id, businessId]
    );
  } else {
    await db.execute(
      `INSERT INTO acct_cash_closings
         (legal_business_id, cash_account_id, closing_date, opening_amount, cash_in, cash_out, taken_out,
          expected_amount, counted_amount, difference, note, denominations_json, closed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
