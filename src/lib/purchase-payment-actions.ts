
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { billCreditSql } from "@/lib/supplier-ledger";

const PAGE = "/accounting/purchases";
const MAX_PAISE = 999999999999999999n;

const METHODS = [
  "BANK_TRANSFER",
  "UPI",
  "CASH",
  "CHEQUE",
  "OTHER",
] as const;

const SOURCES = [
  "BUSINESS_BANK",
  "BUSINESS_CASH",
  "INVESTOR_BANK",
  "INVESTOR_CASH",
  "OWNER_PERSONAL",
] as const;

type Source = (typeof SOURCES)[number];

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function id(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

function moneyPaise(value: unknown): bigint | null {
  const s = String(value ?? "");
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(s)) {
    return null;
  }

  const [whole, fraction = ""] = s.split(".");
  const amount =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  return amount <= MAX_PAISE ? amount : null;
}

function moneyString(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  );
}

function destination(
  purchaseId: number | null,
  code: string,
  returnTo?: string
): string {
  if (returnTo === "purchase-management") {
    return `/accounting/purchase-management?result=${encodeURIComponent(code)}`;
  }

  if (purchaseId === null) {
    return "/accounting/purchases";
  }

  return `${PAGE}/${purchaseId}/payments?result=${encodeURIComponent(code)}`;
}

export async function createPurchasePaymentDraftAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("purchases");
  const DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const purchaseId = id(field(form, "purchase_id"));
  const returnTo = field(form, "return_to");
  const paymentDate = field(form, "payment_date");
  const amount = moneyPaise(field(form, "amount"));
  const method = field(form, "payment_method");
  const source = field(form, "payment_source") as Source;

  const bankId = id(field(form, "source_bank_account_id"));
  const cashId = id(field(form, "source_cash_account_id"));
  const partyId = id(field(form, "funding_party_id"));
  const agreementId = id(field(form, "funding_agreement_id"));

  const payerName = field(form, "payer_name");
  const reference = field(form, "payment_reference");
  const evidence = field(form, "evidence_reference");
  const remarks = field(form, "remarks");

  let treatment = "NONE";

  if (source === "INVESTOR_BANK" || source === "INVESTOR_CASH") {
    treatment = agreementId === null
      ? "TEMPORARY_ADVANCE"
      : "AGREEMENT";
  } else if (source === "OWNER_PERSONAL") {
    treatment = "OWNER_REIMBURSEMENT";
  }

  const basicValid =
    purchaseId !== null &&
    validDate(paymentDate) &&
    amount !== null &&
    amount > 0n &&
    METHODS.some((x) => x === method) &&
    SOURCES.some((x) => x === source) &&
    payerName.length <= 160 &&
    reference.length <= 120 &&
    evidence.length <= 255 &&
    remarks.length <= 500 &&
    (
      source === "BUSINESS_BANK"
        ? bankId !== null &&
          cashId === null &&
          partyId === null &&
          agreementId === null
        : source === "BUSINESS_CASH"
          ? cashId !== null &&
            bankId === null &&
            partyId === null &&
            agreementId === null
          : source === "INVESTOR_BANK"
            ? bankId !== null &&
              cashId === null &&
              partyId !== null
            : source === "INVESTOR_CASH"
              ? bankId === null &&
                cashId === null &&
                partyId !== null
              : source === "OWNER_PERSONAL"
                ? bankId === null &&
                  cashId === null &&
                  partyId === null &&
                  agreementId === null &&
                  payerName.length >= 2
                : false
    );

  if (!basicValid) {
    redirect(destination(purchaseId, "invalid", returnTo));
  }

  // The purchase can be paid in instalments.
  // Only create drafts here. Verification will
  // be implemented as a separate controlled action.
  const conn = await db.getConnection();

  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [purchases] = await conn.execute<RowDataPacket[]>(
      `SELECT
         h.id,
         h.status,
         h.receiving_location_id,
         DATE_FORMAT(h.invoice_date, '%Y-%m-%d') AS invoice_date
       FROM acct_purchase_headers h
       WHERE h.legal_business_id = ?
         AND h.division_id = ?
         AND h.id = ?
       FOR UPDATE`,
      [businessId, DIVISION_ID, purchaseId]
    );

    const purchase = purchases[0];

    if (business.length !== 1 || !purchase) {
      outcome = "purchase-not-found";
    } else if (purchase.status !== "POSTED") {
      outcome = "purchase-not-posted";
    } else {
      let sourceValid = false;

      if (
        source === "BUSINESS_BANK" ||
        source === "INVESTOR_BANK"
      ) {
        const [banks] = await conn.execute<RowDataPacket[]>(
          `SELECT id, ownership_type, funding_party_id, status
           FROM acct_bank_accounts
           WHERE legal_business_id = ?
             AND id = ?`,
          [businessId, bankId]
        );

        const bank = banks[0];

        sourceValid = Boolean(
          bank &&
          bank.status === "ACTIVE" &&
          bank.ownership_type === (
            source === "BUSINESS_BANK" ? "BUSINESS" : "INVESTOR"
          ) &&
          (
            source === "BUSINESS_BANK" ||
            Number(bank.funding_party_id) === partyId
          )
        );
      } else if (source === "BUSINESS_CASH") {
        const [accounts] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_cash_accounts
           WHERE legal_business_id = ?
             AND id = ?
             AND status = 'ACTIVE'`,
          [businessId, cashId]
        );

        sourceValid = accounts.length === 1;
      } else {
        sourceValid = source === "INVESTOR_CASH" ||
                      source === "OWNER_PERSONAL";
      }

      if (
        sourceValid &&
        (source === "INVESTOR_BANK" ||
         source === "INVESTOR_CASH")
      ) {
        const [parties] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_funding_parties
           WHERE legal_business_id = ? AND id = ?`,
          [businessId, partyId]
        );

        sourceValid = parties.length === 1;
      }

      if (sourceValid && agreementId !== null) {
        const [agreements] =
          await conn.execute<RowDataPacket[]>(
            `SELECT
               id, party_id, division_id, branch_id,
               status,
               DATE_FORMAT(effective_from, '%Y-%m-%d') AS starts_on,
               DATE_FORMAT(effective_to, '%Y-%m-%d') AS ends_on
             FROM acct_funding_agreements
             WHERE legal_business_id = ?
               AND id = ?`,
            [businessId, agreementId]
          );

        const agreement = agreements[0];

        // Purchase receipts enter central warehouse.
        // Branch-specific investor funding cannot be
        // automatically assigned to warehouse purchases.
        sourceValid = Boolean(
          agreement &&
          agreement.status === "ACTIVE" &&
          Number(agreement.party_id) === partyId &&
          (
            agreement.division_id === null ||
            Number(agreement.division_id) === DIVISION_ID
          ) &&
          agreement.branch_id === null &&
          agreement.starts_on <= paymentDate &&
          (
            agreement.ends_on === null ||
            agreement.ends_on >= paymentDate
          )
        );
      }

      if (!sourceValid) {
        outcome = "source-invalid";
      } else {
        const [purchaseTotalRows] =
          await conn.execute<RowDataPacket[]>(
            `SELECT CAST(COALESCE(SUM(l.line_amount), 0) - ${billCreditSql("h")} AS CHAR)
               AS total
             FROM acct_purchase_headers h
             LEFT JOIN acct_purchase_lines l
               ON l.legal_business_id = h.legal_business_id
              AND l.division_id = h.division_id
              AND l.purchase_id = h.id
             WHERE h.legal_business_id = ?
               AND h.division_id = ?
               AND h.id = ?
             GROUP BY h.id, h.legal_business_id`,
            [businessId, DIVISION_ID, purchaseId]
          );

        const [paymentRows] =
          await conn.execute<RowDataPacket[]>(
            `SELECT
               CAST(COALESCE(SUM(amount), 0) AS CHAR)
                 AS allocated
             FROM acct_purchase_payments
             WHERE legal_business_id = ?
               AND division_id = ?
               AND purchase_id = ?
               AND status IN ('DRAFT', 'VERIFIED')`,
            [businessId, DIVISION_ID, purchaseId]
          );

        const total = moneyPaise(purchaseTotalRows[0]?.total);
        const allocated = moneyPaise(paymentRows[0]?.allocated);

        if (
          total === null ||
          allocated === null ||
          total <= 0n ||
          allocated + amount! > total
        ) {
          outcome = "amount-exceeds-balance";
        } else {
          // Optional reference-based duplicate check.
          // Manual review will still be needed for
          // cash payments without a transaction reference.
          let duplicate = false;

          if (reference) {
            const [existing] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_purchase_payments
                 WHERE legal_business_id = ?
                   AND purchase_id = ?
                   AND payment_source = ?
                   AND payment_reference = ?
                   AND status <> 'VOID'
                 LIMIT 1`,
                [businessId, purchaseId, source, reference]
              );

            duplicate = existing.length > 0;
          }

          if (duplicate) {
            outcome = "duplicate-reference";
          } else {
            const paymentNo =
              "ATX-PAY-" +
              randomBytes(8).toString("hex").toUpperCase();

            const [saved] =
              await conn.execute<ResultSetHeader>(
                `INSERT INTO acct_purchase_payments (
                   legal_business_id,
                   division_id,
                   purchase_id,
                   payment_no,
                   payment_date,
                   amount,
                   payment_method,
                   payment_source,
                   funding_treatment,
                   source_bank_account_id,
                   source_cash_account_id,
                   funding_party_id,
                   funding_agreement_id,
                   payer_name,
                   payment_reference,
                   evidence_reference,
                   remarks,
                   cutover_treatment,
                   status,
                   created_by
                 ) VALUES (
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                   ?, ?, ?, ?, ?, ?, ?,
                   'UNREVIEWED', 'DRAFT', ?
                 )`,
                [
                  businessId,
                  DIVISION_ID,
                  purchaseId,
                  paymentNo,
                  paymentDate,
                  moneyString(amount!),
                  method,
                  source,
                  treatment,
                  bankId,
                  cashId,
                  partyId,
                  agreementId,
                  payerName || null,
                  reference || null,
                  evidence || null,
                  remarks || null,
                  user.id,
                ]
              );

            await conn.execute(
              `INSERT INTO acct_audit_events (
                 legal_business_id,
                 actor_user_id,
                 action,
                 subject_type,
                 subject_id,
                 details_json
               ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                businessId,
                user.id,
                "PURCHASE_PAYMENT_DRAFT_CREATED",
                "PURCHASE_PAYMENT",
                saved.insertId,
                JSON.stringify({
                  payment_no: paymentNo,
                  purchase_id: purchaseId,
                  amount: moneyString(amount!),
                  payment_source: source,
                  funding_treatment: treatment,
                  funding_party_id: partyId,
                  funding_agreement_id: agreementId,
                }),
              ]
            );

            await conn.commit();
            outcome = "created";
          }
        }
      }
    }

    if (outcome !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Purchase payment draft failed", error);
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(`${PAGE}/${purchaseId}`);
    revalidatePath(`${PAGE}/${purchaseId}/payments`);
  }

  redirect(destination(purchaseId, outcome, returnTo));
}
