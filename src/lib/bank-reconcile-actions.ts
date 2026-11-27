"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { inr, isDate, parseRupees } from "@/lib/reports/money";
import { rupeesText } from "@/lib/sale-payments";
import { loadReconBanks, loadReconLines } from "@/lib/bank-reconcile-data";
import { reconDifference, reconView } from "@/lib/bank-reconcile";

const PAGE = "/accounting/bank-reconcile";
const signed = (p: bigint) => (p < 0n ? "-" : "") + rupeesText(p < 0n ? -p : p);

/**
 * Saves the ticks for the entries on the screen and, when asked, records that the ticked entries add up to
 * the bank's balance on the check date ("matched up to"). Nothing in the ledger changes.
 */
export async function saveBankTicksAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const bankId = Number(form.get("bank"));
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") ?? "");
  const back = `${PAGE}?bank=${bankId}&from=${from}&to=${to}`;
  let shown: number[] = [], ticked: number[] = [];
  try {
    shown = (JSON.parse(String(form.get("shown_json") ?? "[]")) as unknown[]).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 5000);
    const t = new Set((JSON.parse(String(form.get("ticked_json") ?? "[]")) as unknown[]).map(Number));
    ticked = shown.filter((id) => t.has(id));
  } catch {
    redirect(`${back}&error=${encodeURIComponent("The ticks could not be read. Nothing was changed.")}`);
  }
  const finish = form.get("finish") === "1";
  const bankBalanceText = String(form.get("bank_balance") ?? "").trim();
  const bankBalance = bankBalanceText ? parseRupees(bankBalanceText) : null;
  if (!isDate(from) || !isDate(to) || from > to) redirect(`${back}&error=${encodeURIComponent("Choose proper dates.")}`);
  if (bankBalanceText && bankBalance === null) redirect(`${back}&error=${encodeURIComponent("Type the bank's balance as a number, for example 125000.50 (use - if overdrawn).")}`);

  let message = "Ticks saved.";
  const conn = await db.getConnection();
  try {
    const bank = (await loadReconBanks(conn, businessId)).find((b) => b.id === bankId);
    if (!bank || !bank.glAccountId) throw new Error("bank");
    await conn.beginTransaction();
    if (shown.length) {
      // Only entries that really are on this bank's ledger account can be ticked.
      const marks = shown.map(() => "?").join(",");
      const [valid] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM acct_journal_lines WHERE legal_business_id = ? AND account_id = ? AND id IN (${marks})`,
        [businessId, bank.glAccountId, ...shown]
      );
      const ok = new Set(valid.map((r) => Number(r.id)));
      const showOk = shown.filter((id) => ok.has(id));
      if (showOk.length) {
        await conn.query(
          `DELETE FROM acct_bank_reconcile_ticks WHERE legal_business_id = ? AND bank_account_id = ? AND journal_line_id IN (${showOk.map(() => "?").join(",")})`,
          [businessId, bankId, ...showOk]
        );
      }
      const tickOk = ticked.filter((id) => ok.has(id));
      if (tickOk.length) {
        await conn.query(
          `INSERT INTO acct_bank_reconcile_ticks (legal_business_id, bank_account_id, journal_line_id, ticked_by) VALUES ${tickOk.map(() => "(?, ?, ?, ?)").join(",")}`,
          tickOk.flatMap((id) => [businessId, bankId, id, user.id])
        );
      }
    }
    if (finish) {
      if (bankBalance === null) throw new Error("need-balance");
      const data = await loadReconLines(conn, businessId, bank);
      const v = reconView(data.lines, from, to);
      const diff = reconDifference(bankBalance, v.tickedBalance);
      if (diff !== 0n) {
        await conn.commit();
        conn.release();
        redirect(`${back}&bal=${encodeURIComponent(bankBalanceText)}&error=${encodeURIComponent(`Ticks saved, but not matched yet: ${inr(diff < 0n ? -diff : diff)} is still different from the bank's balance.`)}`);
      }
      await conn.execute(
        `INSERT INTO acct_bank_reconcile_checks (legal_business_id, bank_account_id, statement_date, statement_balance, books_balance, ticked_balance, done_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [businessId, bankId, to, signed(bankBalance), signed(v.booksBalance), signed(v.tickedBalance), user.id]
      );
      message = `Matched with the bank up to ${to}.`;
    }
    await conn.commit();
  } catch (e) {
    unstable_rethrow(e);
    await conn.rollback().catch(() => {});
    const m = (e as Error).message ?? "";
    const text = m === "bank" ? "That bank account has no ledger account yet."
      : m === "need-balance" ? "Type the bank's balance from the statement first."
      : (e as { code?: string }).code === "ER_NO_SUCH_TABLE" ? "Run the new database step (100_bank_reconcile) in phpMyAdmin first."
      : "It could not be saved. Nothing was changed.";
    conn.release();
    redirect(`${back}${bankBalanceText ? `&bal=${encodeURIComponent(bankBalanceText)}` : ""}&error=${encodeURIComponent(text)}`);
  }
  conn.release();
  revalidatePath(PAGE);
  redirect(`${back}${bankBalanceText && !finish ? `&bal=${encodeURIComponent(bankBalanceText)}` : ""}&saved=${encodeURIComponent(message)}`);
}
