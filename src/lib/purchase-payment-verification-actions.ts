
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const BASE = "/accounting/purchases";

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function amountPaise(value: unknown): bigint | null {
  const s = String(value ?? "");
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const n = BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  return n <= 999999999999999999n ? n : null;
}

function nullableId(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function resultUrl(
  purchaseId: number | null,
  result: string,
  returnTo?: string
): string {
  if (returnTo === "purchase-management") {
    return `/accounting/purchase-management?result=${encodeURIComponent(result)}`;
  }

  return purchaseId
    ? `${BASE}/${purchaseId}/payments?result=${encodeURIComponent(result)}`
    : "/accounting/purchases";
}

interface Payment extends RowDataPacket {
  id: number;
  purchase_id: number;
  payment_date: string;
  amount: string;
  payment_method: string;
  payment_source: string;
  funding_treatment: string;
  source_bank_account_id: number | null;
  source_cash_account_id: number | null;
  funding_party_id: number | null;
  funding_agreement_id: number | null;
  payer_name: string | null;
  payment_reference: string | null;
  evidence_reference: string | null;
  status: string;
  purchase_status: string;
  invoice_date: string;
  purchase_total: string;
}

export async function verifyPurchasePaymentAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const purchaseId = parseId(form.get("purchase_id"));
  const returnTo =
    form.get("return_to") === "purchase-management"
      ? "purchase-management"
      : undefined;
  const paymentId = parseId(form.get("payment_id"));
  const confirmed =
    form.get("confirm") === "VERIFY_PAYMENT";

  if (!purchaseId || !paymentId || !confirmed) {
    redirect(resultUrl(purchaseId, "verification-invalid", returnTo));
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    // Consistent locking order across accounting services.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      outcome = "business-not-found";
    } else {
      const [rows] = await conn.execute<Payment[]>(
        `SELECT
           pp.id,
           pp.purchase_id,
           DATE_FORMAT(pp.payment_date, '%Y-%m-%d')
             AS payment_date,
           CAST(pp.amount AS CHAR) AS amount,
           pp.payment_method,
           pp.payment_source,
           pp.funding_treatment,
           pp.source_bank_account_id,
           pp.source_cash_account_id,
           pp.funding_party_id,
           pp.funding_agreement_id,
           pp.payer_name,
           pp.payment_reference,
           pp.evidence_reference,
           pp.status,
           h.status AS purchase_status,
           DATE_FORMAT(h.invoice_date, '%Y-%m-%d')
             AS invoice_date,
           CAST(COALESCE((
             SELECT SUM(l.line_amount)
             FROM acct_purchase_lines l
             WHERE l.legal_business_id = h.legal_business_id
               AND l.division_id = h.division_id
               AND l.purchase_id = h.id
           ), 0) AS CHAR) AS purchase_total
         FROM acct_purchase_payments pp
         JOIN acct_purchase_headers h
           ON h.id = pp.purchase_id
          AND h.legal_business_id = pp.legal_business_id
          AND h.division_id = pp.division_id
         WHERE pp.id = ?
           AND pp.purchase_id = ?
           AND pp.legal_business_id = ?
           AND pp.division_id = 1
         FOR UPDATE`,
        [paymentId, purchaseId, businessId]
      );

      const payment = rows[0];

      if (!payment) {
        outcome = "payment-not-found";
      } else if (payment.status !== "DRAFT") {
        outcome = "payment-not-draft";
      } else if (payment.purchase_status !== "POSTED") {
        outcome = "purchase-not-posted";
      } else {
        const [cutovers] = await conn.execute<RowDataPacket[]>(
          `SELECT DATE_FORMAT(opening_date, '%Y-%m-%d')
                    AS opening_date
           FROM acct_opening_balance_batches
           WHERE legal_business_id = ?
           FOR UPDATE`,
          [businessId]
        );

        const cutoverDate: string | undefined =
          cutovers[0]?.opening_date;

        if (!cutoverDate) {
          outcome = "cutover-required";
        } else {
          const treatment =
            payment.payment_date <= cutoverDate
              ? "PRE_CUTOVER"
              : "POST_CUTOVER";

          const amount = amountPaise(payment.amount);
          const invoiceTotal = amountPaise(payment.purchase_total);

          const [totals] = await conn.execute<RowDataPacket[]>(
            `SELECT CAST(COALESCE(SUM(amount), 0) AS CHAR)
                     AS other_payments
             FROM acct_purchase_payments
             WHERE legal_business_id = ?
               AND division_id = 1
               AND purchase_id = ?
               AND id <> ?
               AND status IN ('DRAFT', 'VERIFIED')`,
            [businessId, purchaseId, paymentId]
          );

          const otherPayments =
            amountPaise(totals[0]?.other_payments);

          if (
            amount === null ||
            amount <= 0n ||
            invoiceTotal === null ||
            otherPayments === null ||
            amount + otherPayments > invoiceTotal
          ) {
            outcome = "amount-invalid";
          } else {
            // Evidence and transaction references are optional.
            // Confirmation still validates the purchase, amount,
            // source account, investor and funding agreement.
            let sourceValid = false;

            const bankId = nullableId(
              payment.source_bank_account_id
            );
            const cashId = nullableId(
              payment.source_cash_account_id
            );
            const partyId = nullableId(
              payment.funding_party_id
            );
            const agreementId = nullableId(
              payment.funding_agreement_id
            );

            if (
              payment.payment_source === "BUSINESS_BANK" ||
              payment.payment_source === "INVESTOR_BANK"
            ) {
              const [banks] = await conn.execute<RowDataPacket[]>(
                `SELECT
                   id, ownership_type, funding_party_id,
                   status, verification_status
                 FROM acct_bank_accounts
                 WHERE legal_business_id = ?
                   AND id = ?`,
                [businessId, bankId]
              );

              const bank = banks[0];
              sourceValid = Boolean(
                bank &&
                bank.status === "ACTIVE" &&
                bank.verification_status === "VERIFIED" &&
                bank.ownership_type === (
                  payment.payment_source === "BUSINESS_BANK"
                    ? "BUSINESS"
                    : "INVESTOR"
                ) &&
                (
                  payment.payment_source === "BUSINESS_BANK"
                    ? bank.funding_party_id === null &&
                      partyId === null &&
                      agreementId === null &&
                      cashId === null &&
                      payment.funding_treatment === "NONE"
                    : Number(bank.funding_party_id) === partyId &&
                      cashId === null
                )
              );
            } else if (
              payment.payment_source === "BUSINESS_CASH"
            ) {
              const [cash] = await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_cash_accounts
                 WHERE id = ?
                   AND legal_business_id = ?
                   AND status = 'ACTIVE'`,
                [cashId, businessId]
              );

              sourceValid =
                cash.length === 1 &&
                bankId === null &&
                partyId === null &&
                agreementId === null &&
                payment.funding_treatment === "NONE";
            } else if (
              payment.payment_source === "INVESTOR_CASH" ||
              payment.payment_source === "OWNER_PERSONAL"
            ) {
              sourceValid =
                bankId === null &&
                cashId === null &&
                (
                  payment.payment_source === "INVESTOR_CASH"
                    ? partyId !== null
                    : partyId === null &&
                      agreementId === null &&
                      payment.funding_treatment ===
                        "OWNER_REIMBURSEMENT" &&
                      Boolean(payment.payer_name?.trim())
                );
            }

            if (
              sourceValid &&
              ["INVESTOR_BANK", "INVESTOR_CASH"].includes(
                payment.payment_source
              )
            ) {
              const [parties] = await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_funding_parties
                 WHERE legal_business_id = ?
                   AND id = ?`,
                [businessId, partyId]
              );

              sourceValid =
                parties.length === 1 &&
                (
                  agreementId === null
                    ? payment.funding_treatment ===
                      "TEMPORARY_ADVANCE"
                    : payment.funding_treatment === "AGREEMENT"
                );
            }

            if (sourceValid && agreementId !== null) {
              const [agreements] = await conn.execute<RowDataPacket[]>(
                `SELECT
                   party_id, division_id, branch_id,
                   status,
                   DATE_FORMAT(effective_from, '%Y-%m-%d')
                     AS effective_from,
                   DATE_FORMAT(effective_to, '%Y-%m-%d')
                     AS effective_to
                 FROM acct_funding_agreements
                 WHERE id = ?
                   AND legal_business_id = ?`,
                [agreementId, businessId]
              );

              const agreement = agreements[0];

              sourceValid = Boolean(
                agreement &&
                agreement.status === "ACTIVE" &&
                Number(agreement.party_id) === partyId &&
                (
                  agreement.division_id === null ||
                  Number(agreement.division_id) === 1
                ) &&
                agreement.branch_id === null &&
                agreement.effective_from <= payment.payment_date &&
                (
                  agreement.effective_to === null ||
                  agreement.effective_to >= payment.payment_date
                )
              );
            }

            if (!sourceValid) {
              outcome = "source-invalid";
            } else {
              const [updated] =
                await conn.execute<ResultSetHeader>(
                  `UPDATE acct_purchase_payments
                   SET
                     status = 'VERIFIED',
                     cutover_treatment = ?,
                     verified_by = ?,
                     verified_at = CURRENT_TIMESTAMP
                   WHERE id = ?
                     AND purchase_id = ?
                     AND legal_business_id = ?
                     AND status = 'DRAFT'`,
                  [
                    treatment,
                    user.id,
                    paymentId,
                    purchaseId,
                    businessId,
                  ]
                );

              if (updated.affectedRows !== 1) {
                outcome = "verification-conflict";
              } else {
                await conn.execute(
                  `INSERT INTO acct_audit_events
                   (
                     legal_business_id,
                     actor_user_id,
                     action,
                     subject_type,
                     subject_id,
                     details_json
                   )
                   VALUES (?, ?, ?, ?, ?, ?)`,
                  [
                    businessId,
                    user.id,
                    "PURCHASE_PAYMENT_VERIFIED",
                    "PURCHASE_PAYMENT",
                    paymentId,
                    JSON.stringify({
                      purchase_id: purchaseId,
                      amount: payment.amount,
                      payment_date: payment.payment_date,
                      source: payment.payment_source,
                      funding_treatment: payment.funding_treatment,
                      cutover_treatment: treatment,
                      source_bank_account_id: bankId,
                      source_cash_account_id: cashId,
                      funding_party_id: partyId,
                      funding_agreement_id: agreementId,
                      journal_posted: false,
                      evidence_reference:
                        payment.evidence_reference,
                    }),
                  ]
                );

                await conn.commit();
                outcome = "verified";
              }
            }
          }
        }
      }
    }

    if (outcome !== "verified") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Purchase payment verification failed", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "verified") {
    revalidatePath(`${BASE}/${purchaseId}/payments`);
    revalidatePath(`${BASE}/${purchaseId}`);
  }

  redirect(resultUrl(purchaseId, outcome, returnTo));
}
