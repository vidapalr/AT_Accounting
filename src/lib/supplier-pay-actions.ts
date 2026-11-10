"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { billCreditSql } from "@/lib/supplier-ledger";
import { verifyPurchasePaymentCore } from "@/lib/purchase-payment-verify-core";
import {
  allocateOldestFirst,
  checkManualParts,
  type Allocation,
  type OpenBill,
} from "@/lib/supplier-pay-math";

const BASE = "/accounting/pay-supplier";
const METHODS = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "OTHER"];
const SOURCES = ["BUSINESS_BANK", "BUSINESS_CASH", "INVESTOR_BANK", "INVESTOR_CASH", "OWNER_PERSONAL"];

function field(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
function id(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}
function paiseOf(value: string): bigint | null {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(value)) return null;
  const [w, f = ""] = value.split(".");
  return BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
}
function toMoney(p: bigint): string {
  return `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
}
function validDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

/** Records one payment to a supplier and spreads it over the bills. Saved as drafts, shown together. */
export async function paySupplierAction(form: FormData): Promise<void> {
  const user = await requireAccess("purchases");
  const divisionId = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const supplierId = id(field(form, "supplier_id"));
  const back = (code: string) =>
    redirect(`${BASE}?${supplierId ? `supplier=${supplierId}&` : ""}result=${code}`);

  const date = field(form, "payment_date");
  const amount = paiseOf(field(form, "amount"));
  const method = field(form, "payment_method");
  const source = field(form, "payment_source");
  const bankId = id(field(form, "source_bank_account_id"));
  const cashId = id(field(form, "source_cash_account_id"));
  const partyId = id(field(form, "funding_party_id"));
  const agreementId = id(field(form, "funding_agreement_id"));
  const payerName = field(form, "payer_name");
  const ownerAccountId = id(field(form, "owner_account_id"));
  const reference = field(form, "payment_reference");
  const evidence = field(form, "evidence_reference");
  const remarks = field(form, "remarks");

  let treatment = "NONE";
  if (source === "INVESTOR_BANK" || source === "INVESTOR_CASH") {
    treatment = agreementId === null ? "TEMPORARY_ADVANCE" : "AGREEMENT";
  } else if (source === "OWNER_PERSONAL") {
    treatment = "OWNER_REIMBURSEMENT";
  }

  const sourceShapeOk =
    source === "BUSINESS_BANK" ? bankId !== null && cashId === null && partyId === null && agreementId === null
    : source === "BUSINESS_CASH" ? cashId !== null && bankId === null && partyId === null && agreementId === null
    : source === "INVESTOR_BANK" ? bankId !== null && cashId === null && partyId !== null
    : source === "INVESTOR_CASH" ? bankId === null && cashId === null && partyId !== null
    : source === "OWNER_PERSONAL" ? bankId === null && cashId === null && partyId === null && agreementId === null && payerName.length >= 2
    : false;

  if (
    supplierId === null || !validDate(date) || amount === null || amount <= 0n ||
    !METHODS.includes(method) || !SOURCES.includes(source) || !sourceShapeOk ||
    payerName.length > 160 || reference.length > 120 || evidence.length > 255 || remarks.length > 500
  ) {
    back("invalid");
  }

  // Parts typed by hand, if any: fields named part_<billId>.
  const typed: Allocation[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("part_") || typeof value !== "string" || value.trim() === "") continue;
    const billId = id(key.slice(5));
    const p = paiseOf(value.trim());
    if (billId === null || p === null) back("invalid");
    typed.push({ id: billId!, amount: p! });
  }

  const conn = await db.getConnection();
  let outcome = "failed";
  let batchNo = "";

  try {
    await conn.beginTransaction();
    await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);

    const [headers] = await conn.execute<RowDataPacket[]>(
      `SELECT h.id,
              CAST(COALESCE((SELECT SUM(l.line_amount) FROM acct_purchase_lines l
                              WHERE l.legal_business_id = h.legal_business_id
                                AND l.division_id = h.division_id AND l.purchase_id = h.id), 0)
                   - ${billCreditSql("h")} AS CHAR) AS total,
              CAST(COALESCE((SELECT SUM(p.amount) FROM acct_purchase_payments p
                              WHERE p.legal_business_id = h.legal_business_id
                                AND p.division_id = h.division_id AND p.purchase_id = h.id
                                AND p.status IN ('DRAFT','VERIFIED')), 0) AS CHAR) AS paid
       FROM acct_purchase_headers h
       WHERE h.legal_business_id = ? AND h.division_id = ? AND h.supplier_id = ? AND h.status = 'POSTED'
       ORDER BY COALESCE(h.received_date, h.invoice_date), h.id
       FOR UPDATE`,
      [businessId, divisionId, supplierId]
    );

    const bills: OpenBill[] = [];
    for (const h of headers) {
      const total = paiseOf(String(h.total));
      const paid = paiseOf(String(h.paid));
      if (total === null || paid === null) continue;
      if (total > paid) bills.push({ id: Number(h.id), due: total - paid });
    }
    const owed = bills.reduce((s, b) => s + b.due, 0n);

    let sourceValid = false;
    if (ownerAccountId !== null && source !== "OWNER_PERSONAL") {
      sourceValid = false;
    } else if (source === "BUSINESS_BANK" || source === "INVESTOR_BANK") {
      const [banks] = await conn.execute<RowDataPacket[]>(
        `SELECT ownership_type, funding_party_id, status FROM acct_bank_accounts
         WHERE legal_business_id = ? AND id = ?`,
        [businessId, bankId]
      );
      const b = banks[0];
      sourceValid = Boolean(
        b && b.status === "ACTIVE" &&
        b.ownership_type === (source === "BUSINESS_BANK" ? "BUSINESS" : "INVESTOR") &&
        (source === "BUSINESS_BANK" || Number(b.funding_party_id) === partyId)
      );
    } else if (source === "BUSINESS_CASH") {
      const [c] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
        [businessId, cashId]
      );
      sourceValid = c.length === 1;
    } else {
      sourceValid = true;
      if (ownerAccountId !== null) {
        const [oa] = await conn.execute<RowDataPacket[]>(
          `SELECT id FROM acct_owner_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
          [businessId, ownerAccountId]
        );
        sourceValid = oa.length === 1;
      }
    }
    if (sourceValid && partyId !== null) {
      const [p] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_funding_parties WHERE legal_business_id = ? AND id = ?`,
        [businessId, partyId]
      );
      sourceValid = p.length === 1;
    }
    if (sourceValid && agreementId !== null) {
      const [a] = await conn.execute<RowDataPacket[]>(
        `SELECT party_id, division_id, branch_id, status,
                DATE_FORMAT(effective_from, '%Y-%m-%d') AS starts_on,
                DATE_FORMAT(effective_to, '%Y-%m-%d') AS ends_on
         FROM acct_funding_agreements WHERE legal_business_id = ? AND id = ?`,
        [businessId, agreementId]
      );
      const ag = a[0];
      sourceValid = Boolean(
        ag && ag.status === "ACTIVE" && Number(ag.party_id) === partyId &&
        (ag.division_id === null || Number(ag.division_id) === divisionId) &&
        ag.branch_id === null && ag.starts_on <= date &&
        (ag.ends_on === null || ag.ends_on >= date)
      );
    }

    let parts: Allocation[] = [];
    if (!sourceValid) {
      outcome = "source-invalid";
    } else if (amount! > owed) {
      outcome = "more-than-owed";
    } else if (typed.length > 0) {
      const check = checkManualParts(bills, typed, amount!);
      if (check === "ok") parts = typed;
      else outcome = check === "total-differs" ? "parts-differ" : "part-too-big";
    } else {
      parts = allocateOldestFirst(bills, amount!).allocations;
    }

    if (parts.length > 0) {
      let duplicate = false;
      if (reference) {
        const [d] = await conn.execute<RowDataPacket[]>(
          `SELECT p.id FROM acct_purchase_payments p
           JOIN acct_purchase_headers h ON h.id = p.purchase_id AND h.legal_business_id = p.legal_business_id
           WHERE p.legal_business_id = ? AND h.supplier_id = ? AND p.payment_source = ?
             AND p.payment_reference = ? AND p.status <> 'VOID' LIMIT 1`,
          [businessId, supplierId, source, reference]
        );
        duplicate = d.length > 0;
      }
      if (duplicate) {
        outcome = "duplicate-reference";
      } else {
        batchNo = "ATX-BATCH-" + randomBytes(6).toString("hex").toUpperCase();
        for (const part of parts) {
          const paymentNo = "ATX-PAY-" + randomBytes(8).toString("hex").toUpperCase();
          await conn.execute(
            `INSERT INTO acct_purchase_payments (
               legal_business_id, division_id, purchase_id, payment_no, payment_date, amount,
               payment_method, payment_source, funding_treatment, source_bank_account_id,
               source_cash_account_id, funding_party_id, funding_agreement_id, payer_name,
               payment_reference, evidence_reference, remarks, cutover_treatment, status,
               created_by, batch_no
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UNREVIEWED', 'DRAFT', ?, ?)`,
            [
              businessId, divisionId, part.id, paymentNo, date, toMoney(part.amount),
              method, source, treatment, bankId, cashId, partyId, agreementId,
              payerName || null, reference || null, evidence || null, remarks || null,
              user.id, batchNo,
            ]
          );
        }
        if (ownerAccountId !== null) {
          await conn.execute(
            `UPDATE acct_purchase_payments SET owner_account_id = ? WHERE legal_business_id = ? AND batch_no = ?`,
            [ownerAccountId, businessId, batchNo]
          );
        }
        await conn.execute(
          `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
           VALUES (?, ?, 'SUPPLIER_PAYMENT_BATCH_CREATED', 'SUPPLIER', ?, ?)`,
          [businessId, user.id, supplierId, JSON.stringify({
            batch_no: batchNo, amount: toMoney(amount!), bills: parts.length, payment_source: source,
          })]
        );
        await conn.commit();
        outcome = "created";
      }
    }
    if (outcome !== "created") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Supplier payment failed", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath("/accounting/purchases");
    redirect(`${BASE}/${batchNo}?result=created`);
  }
  back(outcome);
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
