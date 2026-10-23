
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { requireGroupOwner } from "@/lib/auth";

type AgreementRow = RowDataPacket & {
  id: number;
  status: string;
  committed_amount: string;
  funding_type: string;
  party_status: string;
  division_status: string | null;
  branch_status: string | null;
  division_id: number | null;
  branch_id: number | null;
};

type PolicyRow = RowDataPacket & {
  version_id: number;
  funding_model: string;
  policy_status: string;
  maximum_outstanding: string | null;
  additional_funding_allowed: number;
};

type BalanceRow = RowDataPacket & {
  verified_amount: string;
  draft_amount: string;
};

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string"
    ? value.trim()
    : "";
}

function validId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function toPaise(value: string): bigint | null {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [whole, decimals = ""] = value.split(".");

  return BigInt(whole) * BigInt(100) +
    BigInt(decimals.padEnd(2, "0"));
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export async function createFundingReceiptAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const agreementText = read(form, "agreement_id");
  const transactionNo = await nextCode(db, { table: "acct_funding_transactions", column: "transaction_no", prefix: "FTX-", width: 4, where: "legal_business_id = ?", params: [businessId] });

  const transactionDate = read(
    form,
    "transaction_date"
  );

  const amount = read(form, "amount");
  const paymentMethod = read(form, "payment_method");
  const account = read(form, "account");
  const bankMatch = /^BANK:([1-9]\d*)$/.exec(account);
  const cashMatch = /^CASH:([1-9]\d*)$/.exec(account);
  const bankId = bankMatch ? Number(bankMatch[1]) : null;
  const cashId = cashMatch ? Number(cashMatch[1]) : null;
  const paymentReference = read(
    form,
    "payment_reference"
  );
  const remarks = read(form, "remarks");

  const amountPaise = toPaise(amount);

  if (
    !validId(agreementText) ||
    !/^[A-Z0-9][A-Z0-9/_-]{2,39}$/.test(transactionNo) ||
    !validDate(transactionDate) ||
    amountPaise === null ||
    amountPaise <= BigInt(0) ||
    ![
      "BANK_TRANSFER",
      "UPI",
      "CASH",
      "CHEQUE",
      "OTHER",
    ].includes(paymentMethod) ||
    (!bankId && !cashId) ||
    (bankId !== null && !Number.isSafeInteger(bankId)) ||
    (cashId !== null && !Number.isSafeInteger(cashId)) ||
    (paymentMethod === "CASH"
      ? cashId === null
      : bankId === null) ||
    paymentReference.length > 120 ||
    remarks.length > 500
  ) {
    redirect("/funding/transactions?result=invalid");
  }

  const agreementId = Number(agreementText);

  let outcome = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [accountRows] = bankId !== null
      ? await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_bank_accounts
           WHERE legal_business_id = ?
             AND id = ?
             AND ownership_type = 'BUSINESS'
             AND status = 'ACTIVE'
             AND verification_status = 'VERIFIED'
             AND can_receive = 1
           FOR UPDATE`,
          [businessId, bankId]
        )
      : await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_cash_accounts
           WHERE legal_business_id = ?
             AND id = ?
             AND status = 'ACTIVE'
           FOR UPDATE`,
          [businessId, cashId]
        );
    const accountValid = accountRows.length === 1;

    // Lock the agreement so concurrent receipt creation
    // for this agreement cannot bypass outstanding limits.
    const [agreements] =
      await connection.execute<AgreementRow[]>(
        `SELECT
           a.id,
           a.status,
           a.funding_type,
           a.committed_amount,
           a.division_id,
           a.branch_id,
           p.status AS party_status,
           d.status AS division_status,
           b.status AS branch_status
         FROM acct_funding_agreements a
         JOIN acct_funding_parties p
           ON p.id = a.party_id
          AND p.legal_business_id = a.legal_business_id
         LEFT JOIN acct_divisions d
           ON d.id = a.division_id
          AND d.legal_business_id = a.legal_business_id
         LEFT JOIN acct_branches b
           ON b.id = a.branch_id
          AND b.division_id = a.division_id
          AND b.legal_business_id = a.legal_business_id
         WHERE a.id = ?
           AND a.legal_business_id = ?
         FOR UPDATE`,
        [agreementId, businessId]
      );

    const agreement = agreements[0];

    if (!accountValid) {
      outcome = "invalid-account";
    } else if (!agreement || agreement.status !== "ACTIVE") {
      outcome = "not-active";
    } else if (
      agreement.party_status !== "ACTIVE" ||
      (agreement.division_id !== null &&
        agreement.division_status !== "ACTIVE") ||
      (agreement.branch_id !== null &&
        agreement.branch_status !== "ACTIVE")
    ) {
      outcome = "inactive-scope";
    } else {
      const [versions] =
        await connection.execute<PolicyRow[]>(
          `SELECT
             v.id AS version_id,
             fp.funding_model,
             fp.policy_status,
             fp.maximum_outstanding,
             fp.additional_funding_allowed
           FROM acct_agreement_versions v
           JOIN acct_agreement_funding_policies fp
             ON fp.agreement_version_id = v.id
            AND fp.agreement_id = v.agreement_id
            AND fp.legal_business_id = v.legal_business_id
           WHERE v.agreement_id = ?
             AND v.legal_business_id = ?
             -- Current approved version; amendments supersede v1.
             AND v.version_status = 'APPROVED'
             AND fp.policy_status = 'CONFIRMED'
           LIMIT 1`,
          [agreementId, businessId]
        );

      const policy = versions[0];

      const [pending] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_agreement_amendments
           WHERE agreement_id = ?
             AND legal_business_id = ?
             AND status = 'PENDING'
           LIMIT 1`,
          [agreementId, businessId]
        );

      if (!policy || pending.length > 0) {
        outcome = "policy-not-ready";
      } else {
        const [balances] =
          await connection.execute<BalanceRow[]>(
            `SELECT
               COALESCE(SUM(
                 CASE
                   WHEN status = 'VERIFIED'
                    AND transaction_type = 'FUNDING_RECEIVED'
                     THEN amount
                   WHEN status = 'VERIFIED'
                    AND transaction_type = 'PRINCIPAL_REPAID'
                     THEN -amount
                   ELSE 0
                 END
               ), 0) AS verified_amount,

               COALESCE(SUM(
                 CASE
                   WHEN status = 'DRAFT'
                    AND transaction_type = 'FUNDING_RECEIVED'
                     THEN amount
                   ELSE 0
                 END
               ), 0) AS draft_amount
             FROM acct_funding_transactions
             WHERE legal_business_id = ?
               AND agreement_id = ?`,
            [businessId, agreementId]
          );

        const verifiedPaise =
          toPaise(balances[0].verified_amount);

        const draftPaise =
          toPaise(balances[0].draft_amount);

        if (
          verifiedPaise === null ||
          draftPaise === null
        ) {
          throw new Error("Invalid existing funding balance.");
        }

        const model = policy.funding_model;

        const commitmentPaise =
          toPaise(agreement.committed_amount);

        const maximumPaise =
          policy.maximum_outstanding === null
            ? null
            : toPaise(policy.maximum_outstanding);

        // The current foundation assumes a FIXED model uses
        // its committed amount as the receipt ceiling.
        // REVOLVING uses maximum outstanding.
        // Other models may have no numeric ceiling unless
        // an explicit maximum was configured.
        const limitPaise =
          model === "FIXED"
            ? commitmentPaise
            : maximumPaise;

        const projected =
          verifiedPaise + draftPaise + amountPaise;

        const firstFunding =
          verifiedPaise === BigInt(0) &&
          draftPaise === BigInt(0);

        const additionalAllowed =
          Number(policy.additional_funding_allowed) === 1;

        if (
          !firstFunding &&
          !additionalAllowed &&
          model !== "REVOLVING"
        ) {
          outcome = "additional-not-allowed";
        } else if (
          limitPaise !== null &&
          projected > limitPaise
        ) {
          outcome = "limit-exceeded";
        } else {
          const [existing] =
            await connection.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_funding_transactions
               WHERE legal_business_id = ?
                 AND transaction_no = ?
               LIMIT 1`,
              [businessId, transactionNo]
            );

          if (existing.length) {
            outcome = "duplicate";
          } else {
            const [result] =
              await connection.execute<ResultSetHeader>(
                `INSERT INTO acct_funding_transactions
                 (
                   legal_business_id,
                   agreement_id,
                   agreement_version_id,
                   transaction_no,
                   transaction_date,
                   transaction_type,
                   amount,
                   payment_method,
                   bank_account_id,
                   cash_account_id,
                   payment_reference,
                   remarks,
                   status,
                   created_by
                 )
                 VALUES (
                   ?, ?, ?, ?, ?,
                   'FUNDING_RECEIVED',
                   ?, ?, ?, ?, ?,
                   'DRAFT', ?
                 )`,
                [
                  businessId,
                  agreementId,
                  policy.version_id,
                  transactionNo,
                  transactionDate,
                  amount,
                  paymentMethod,
                  bankId,
                  cashId,
                  paymentReference || null,
                  remarks || null,
                  user.id,
                ]
              );

            await connection.execute(
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
                "FUNDING_RECEIPT_DRAFT_CREATED",
                "FUNDING_TRANSACTION",
                result.insertId,
                JSON.stringify({
                  agreement_id: agreementId,
                  agreement_version_id: policy.version_id,
                  transaction_no: transactionNo,
                  transaction_type: "FUNDING_RECEIVED",
                  bank_account_id: bankId,
                  cash_account_id: cashId,
                  status: "DRAFT",
                }),
              ]
            );

            await connection.commit();
            outcome = "created";
          }
        }
      }
    }

    if (outcome !== "created") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Funding receipt creation failed:", error);
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "created") {
    revalidatePath("/funding/transactions");
  }

  redirect(`/funding/transactions?result=${outcome}`);
}
