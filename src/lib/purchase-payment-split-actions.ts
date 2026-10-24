"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { parseRupees, paiseText } from "@/lib/cash-math";

/**
 * A supplier payment was entered as paid from one account, but part of it was
 * really paid from an investor's bank. This moves that part to a second payment
 * in one step: the first payment gets smaller, a linked payment from the
 * investor's bank is added, and the bill's total paid stays the same.
 */
export async function splitPurchasePaymentAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const purchaseId = Number(form.get("purchase_id"));
  const paymentId = Number(form.get("payment_id"));
  const bankId = Number(form.get("investor_bank_id"));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);

  const back = (result: string): never =>
    redirect(
      Number.isSafeInteger(purchaseId) && purchaseId > 0
        ? `/accounting/purchases/${purchaseId}/payments?result=${result}`
        : "/accounting/purchases"
    );

  let part: bigint;
  try {
    part = parseRupees(String(form.get("amount") ?? ""));
  } catch {
    return back("split-invalid");
  }
  if (part <= 0n || !Number.isSafeInteger(paymentId) || paymentId <= 0 || !Number.isSafeInteger(bankId) || bankId <= 0) {
    return back("split-invalid");
  }

  const conn = await db.getConnection();
  let outcome = "split-failed";
  try {
    await conn.beginTransaction();
    await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);

    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT *, ROUND(amount * 100) AS paise,
              DATE_FORMAT(payment_date, '%Y-%m-%d') AS d
         FROM acct_purchase_payments
        WHERE id = ? AND purchase_id = ? AND legal_business_id = ? AND status IN ('DRAFT', 'VERIFIED') FOR UPDATE`,
      [paymentId, purchaseId, businessId]
    );
    const p = rows[0];
    const [banks] = await conn.execute<RowDataPacket[]>(
      `SELECT id, funding_party_id FROM acct_bank_accounts
        WHERE id = ? AND legal_business_id = ? AND ownership_type = 'INVESTOR' AND status = 'ACTIVE'`,
      [bankId, businessId]
    );
    const bank = banks[0];

    if (!p || !bank || bank.funding_party_id === null) {
      outcome = "split-invalid";
    } else if (part >= BigInt(p.paise)) {
      outcome = "split-too-big";
    } else {
      const rest = BigInt(p.paise) - part;
      await conn.execute(
        `UPDATE acct_purchase_payments SET amount = ? WHERE id = ? AND legal_business_id = ?`,
        [paiseText(rest), paymentId, businessId]
      );
      const newNo = "ATX-PAY-" + randomBytes(8).toString("hex").toUpperCase();
      const [added] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_purchase_payments (
           legal_business_id, division_id, purchase_id, payment_no, payment_date, amount,
           payment_method, payment_source, funding_treatment, source_bank_account_id,
           funding_party_id, payer_name, payment_reference, remarks,
           cutover_treatment, status, created_by, verified_by, verified_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INVESTOR_BANK', 'TEMPORARY_ADVANCE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, p.division_id, purchaseId, newNo, p.d, paiseText(part),
          p.payment_method === "CASH" ? "BANK_TRANSFER" : p.payment_method, bankId, bank.funding_party_id,
          p.payer_name, p.payment_reference, `Part of ${p.payment_no}, paid from the investor's bank. ${reason}`.slice(0, 500),
          p.cutover_treatment, p.status, user.id,
          p.status === "VERIFIED" ? user.id : null,
          p.status === "VERIFIED" ? new Date() : null,
        ]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'PURCHASE_PAYMENT_SPLIT', 'PURCHASE_PAYMENT', ?, ?)`,
        [businessId, user.id, paymentId, JSON.stringify({
          purchase_id: purchaseId, original: paiseText(BigInt(p.paise)), kept: paiseText(rest),
          moved: paiseText(part), new_payment_id: added.insertId, new_payment_no: newNo, investor_bank_id: bankId, reason,
        })]
      );
      outcome = "split-done";
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Split purchase payment failed:", error);
    outcome = "split-failed";
  } finally {
    conn.release();
  }
  revalidatePath(`/accounting/purchases/${purchaseId}/payments`);
  revalidatePath("/accounting/purchase-management");
  back(outcome);
}
