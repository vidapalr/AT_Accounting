"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { verifyPurchasePaymentCore } from "@/lib/purchase-payment-verify-core";
import { paySupplierCore, SupplierPayOutcome, field, paiseOf } from "@/lib/supplier-pay-create";
import { loadLimits } from "@/lib/approval-requests";
import { firstStatus, needsApproval } from "@/lib/approval-rules";
import { isMissingTable } from "@/lib/db-errors";

const BASE = "/accounting/pay-supplier";

/** Records one payment to a supplier. Above the limit it is not recorded: it waits for a check and a final approval. */
export async function paySupplierAction(form: FormData): Promise<void> {
  const user = await requireAccess("purchases");
  const activeDivisionId = await getActiveDivisionId(user);

  const amount = paiseOf(field(form, "amount"));
  if (amount !== null && amount > 0n) {
    const limits = await loadLimits(db, user.legal_business_id);
    if (needsApproval(user.role, limits.SUPPLIER_PAYMENT, amount)) {
      const payload: Record<string, string> = { __activeDivision: String(activeDivisionId) };
      for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) payload[k] = v;
      let supplierName = "";
      const sid = Number(field(form, "supplier_id"));
      if (Number.isSafeInteger(sid) && sid > 0) {
        const [r] = await db.execute<RowDataPacket[]>(
          `SELECT supplier_name FROM acct_suppliers WHERE id = ? AND legal_business_id = ?`, [sid, user.legal_business_id]);
        supplierName = String(r[0]?.supplier_name ?? "");
      }
      const summary = `Pay ${supplierName || "supplier"} · ${field(form, "payment_method")} · ${field(form, "payment_date")}`.slice(0, 300);
      try {
        await db.execute(
          `INSERT INTO acct_approval_requests
             (legal_business_id, kind, amount, summary, payload_json, requested_by, requested_role, status)
           VALUES (?, 'SUPPLIER_PAYMENT', ?, ?, ?, ?, ?, ?)`,
          [user.legal_business_id, amount.toString(), summary, JSON.stringify(payload), user.id, user.role, firstStatus(user.role)]
        );
      } catch (e) {
        if (isMissingTable(e)) redirect(`${BASE}?result=approval-setup`);
        throw e;
      }
      redirect(`${BASE}?result=sent-for-approval`);
    }
  }

  try {
    await paySupplierCore(user, form, { activeDivisionId });
  } catch (e) {
    if (e instanceof SupplierPayOutcome) redirect(e.url);
    throw e;
  }
}

/** Confirms every draft part of one supplier payment. Group owner only. */
export async function verifySupplierBatchAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const batchNo = field(form, "batch_no");
  if (!/^ATX-BATCH-[0-9A-F]{12}$/.test(batchNo) || form.get("confirm") !== "VERIFY_BATCH") {
    redirect(`${BASE}?result=invalid`);
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, purchase_id FROM acct_purchase_payments
     WHERE legal_business_id = ? AND batch_no = ? AND status = 'DRAFT' ORDER BY id`,
    [user.legal_business_id, batchNo]
  );
  let ok = 0;
  let lastProblem = "";
  for (const r of rows) {
    const outcome = await verifyPurchasePaymentCore(user, Number(r.purchase_id), Number(r.id));
    if (outcome === "verified") ok += 1;
    else lastProblem = outcome;
  }
  revalidatePath(`${BASE}/${batchNo}`);
  revalidatePath("/accounting/purchases");
  const code = rows.length > 0 && ok === rows.length ? "verified" : `partly-${ok}-of-${rows.length}-${lastProblem}`;
  redirect(`${BASE}/${batchNo}?result=${encodeURIComponent(code)}`);
}
