"use server";

import { redirect } from "next/navigation";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { formatVoucherNo, voucherTypeFor } from "@/lib/voucher-math";
import { financialYearLabel } from "@/lib/financial-year";

/** Makes the voucher for a paid expense payment the first time, then opens it. The number never changes. */
export async function openVoucherAction(form: FormData) {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const paymentId = Number(form.get("payment_id"));
  const expenseId = Number(form.get("expense_id"));
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !Number.isSafeInteger(expenseId) || expenseId <= 0) {
    redirect("/accounting/expenses");
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [pay] = await conn.execute<RowDataPacket[]>(
      `SELECT id, expense_id, payment_source, payment_method, status, DATE_FORMAT(payment_date, '%Y-%m-%d') AS d
         FROM acct_expense_payments WHERE legal_business_id = ? AND id = ? AND expense_id = ?`,
      [businessId, paymentId, expenseId]
    );
    const p = pay[0];
    const type = p ? voucherTypeFor(String(p.payment_source), String(p.payment_method)) : null;
    if (!p || p.status !== "RECORDED" || !type) {
      await conn.rollback();
      redirect(`/accounting/expenses/${expenseId}?result=${encodeURIComponent("No voucher for that payment")}`);
    }
    const [have] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM acct_vouchers WHERE legal_business_id = ? AND expense_payment_id = ?", [businessId, paymentId]);
    if (have.length === 0) {
      // One person at a time takes the next number.
      await conn.execute("SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE", [businessId]);
      const fy = financialYearLabel(String(p.d));
      const [top] = await conn.execute<RowDataPacket[]>(
        "SELECT COALESCE(MAX(seq), 0) AS top FROM acct_vouchers WHERE legal_business_id = ? AND voucher_type = ? AND financial_year = ?",
        [businessId, type, fy]
      );
      const seq = Number(top[0].top) + 1;
      await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_vouchers (legal_business_id, voucher_no, voucher_type, financial_year, seq, expense_payment_id, issued_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [businessId, formatVoucherNo(type, String(p.d), seq), type, fy, seq, paymentId, user.id]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (typeof (error as { digest?: unknown })?.digest === "string") throw error;
    console.error("Voucher failed:", error);
    redirect(`/accounting/expenses/${expenseId}?result=${encodeURIComponent("Voucher could not be made")}`);
  } finally {
    conn.release();
  }
  redirect(`/accounting/expenses/${expenseId}/print?payment=${paymentId}`);
}
