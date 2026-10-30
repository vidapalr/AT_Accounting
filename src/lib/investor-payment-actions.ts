"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { requireGroupOwner } from "@/lib/auth";

const BACK = "/funding/transactions";
const read = (f: FormData, k: string) => (typeof f.get(k) === "string" ? String(f.get(k)).trim() : "");
const toPaise = (v: string): bigint | null => {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(v)) return null;
  const [w, d = ""] = v.split(".");
  return BigInt(w) * 100n + BigInt(d.padEnd(2, "0"));
};

/**
 * Owner records money paid out to an investor: their principal given back, or a return on it.
 * A return is marked "share of profit" or "cost" (the accountant's choice). Saved as a Draft;
 * the owner confirms it against the bank statement, then it posts by itself.
 */
export async function createInvestorPaymentAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const kind = read(form, "kind"); // PRINCIPAL_REPAID | RETURN_PAID
  const treatment = read(form, "treatment");
  const date = read(form, "transaction_date");
  const amount = toPaise(read(form, "amount"));
  const method = read(form, "payment_method");
  const account = read(form, "account");
  const reference = read(form, "payment_reference");
  const remarks = read(form, "remarks");
  const agreementId = Number(read(form, "agreement_id"));
  const bank = /^BANK:([1-9]\d*)$/.exec(account);
  const cash = /^CASH:([1-9]\d*)$/.exec(account);

  if (
    !Number.isSafeInteger(agreementId) || agreementId <= 0 ||
    !["PRINCIPAL_REPAID", "RETURN_PAID"].includes(kind) ||
    (kind === "RETURN_PAID" && !["PROFIT_SHARE", "COST"].includes(treatment)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ||
    amount === null || amount <= 0n ||
    !["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER"].includes(method) ||
    (!bank && !cash) || (method === "CASH" ? !cash : !bank) ||
    reference.length > 120 || remarks.length > 500
  ) redirect(`${BACK}?result=pay-invalid`);

  const conn = await db.getConnection();
  let outcome = "pay-failed";
  try {
    await conn.beginTransaction();
    const [ag] = await conn.execute<RowDataPacket[]>(
      `SELECT a.id, a.status FROM acct_funding_agreements a WHERE a.id = ? AND a.legal_business_id = ? FOR UPDATE`, [agreementId, businessId]);
    const [acc] = bank
      ? await conn.execute<RowDataPacket[]>(`SELECT id FROM acct_bank_accounts WHERE id = ? AND legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE' AND verification_status = 'VERIFIED'`, [Number(bank[1]), businessId])
      : await conn.execute<RowDataPacket[]>(`SELECT id FROM acct_cash_accounts WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`, [Number(cash![1]), businessId]);
    if (!ag[0] || ag[0].status !== "ACTIVE") outcome = "not-active";
    else if (!acc[0]) outcome = "pay-account";
    else {
      if (kind === "PRINCIPAL_REPAID") {
        const [bal] = await conn.execute<RowDataPacket[]>(
          `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'FUNDING_RECEIVED' AND status = 'VERIFIED' THEN ROUND(amount * 100)
                                    WHEN transaction_type = 'PRINCIPAL_REPAID' AND status IN ('VERIFIED','DRAFT') THEN -ROUND(amount * 100) ELSE 0 END), 0) AS p
             FROM acct_funding_transactions WHERE legal_business_id = ? AND agreement_id = ?`, [businessId, agreementId]);
        if (amount > BigInt(String(bal[0].p))) outcome = "pay-too-much";
      }
      if (outcome === "pay-failed") {
        const no = await nextCode(conn, { table: "acct_funding_transactions", column: "transaction_no", prefix: "FTX-", width: 4, where: "legal_business_id = ?", params: [businessId] });
        await conn.execute(
          `INSERT INTO acct_funding_transactions
             (legal_business_id, agreement_id, transaction_no, transaction_date, transaction_type, amount, payment_method,
              bank_account_id, cash_account_id, payment_reference, remarks, status, created_by, return_treatment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
          [businessId, agreementId, no, date, kind, `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`, method,
           bank ? Number(bank[1]) : null, cash ? Number(cash[1]) : null, reference || null, remarks || null, user.id,
           kind === "RETURN_PAID" ? treatment : null]
        );
        await conn.execute(
          `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
           VALUES (?, ?, 'INVESTOR_PAYMENT_DRAFTED', 'FUNDING_TRANSACTION', 0, ?)`,
          [businessId, user.id, JSON.stringify({ no, kind, treatment: kind === "RETURN_PAID" ? treatment : null })]
        );
        outcome = "pay-created";
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Investor payment failed:", error);
    outcome = "pay-failed";
  } finally {
    conn.release();
  }
  revalidatePath(BACK);
  redirect(`${BACK}?result=${outcome}`);
}
