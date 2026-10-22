
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/historical-funding";

const TYPES = [
  "FUNDING_RECEIVED",
  "PRINCIPAL_REPAID",
  "RETURN_PAID",
] as const;

const METHODS = [
  "BANK_TRANSFER",
  "UPI",
  "CASH",
  "CHEQUE",
  "OTHER",
] as const;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function positiveId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));

  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() + 1 === m &&
    parsed.getUTCDate() === d
  );
}

function positiveAmount(value: string): string | null {
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");
  const paise =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  if (
    paise <= 0n ||
    paise > 999999999999999999n
  ) {
    return null;
  }

  return (
    `${paise / 100n}.` +
    `${String(paise % 100n).padStart(2, "0")}`
  );
}

function nullable(value: string): string | null {
  return value.length === 0 ? null : value;
}

function destination(
  code: string,
  batchId?: number
): string {
  const params = new URLSearchParams({ result: code });

  if (batchId) {
    params.set("batch", String(batchId));
  }

  return `${PAGE}?${params.toString()}`;
}

export async function createHistoricalFundingBatchAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();

  const description = field(form, "description");

  if (
    description.length < 5 ||
    description.length > 500
  ) {
    redirect(destination("invalid-description"));
  }

  const conn = await db.getConnection();
  let result = "failed";
  let batchId: number | undefined;

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [user.legal_business_id]
    );

    if (business.length !== 1) {
      result = "invalid-business";
    } else {
      const reference =
        "HF-" +
        randomBytes(10).toString("hex").toUpperCase();

      const [created] =
        await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_historical_funding_batches
           (
             legal_business_id,
             batch_reference,
             description,
             status,
             created_by
           )
           VALUES (?, ?, ?, 'DRAFT', ?)`,
          [
            user.legal_business_id,
            reference,
            description,
            user.id,
          ]
        );

      batchId = created.insertId;

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
          user.legal_business_id,
          user.id,
          "HISTORICAL_FUNDING_BATCH_CREATED",
          "HISTORICAL_FUNDING_BATCH",
          batchId,
          JSON.stringify({
            batch_reference: reference,
            description,
          }),
        ]
      );

      await conn.commit();
      result = "batch-created";
    }

    if (result !== "batch-created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Historical batch creation failed", error);
  } finally {
    conn.release();
  }

  if (result === "batch-created") {
    revalidatePath(PAGE);
  }

  redirect(destination(result, batchId));
}

export async function addHistoricalFundingItemAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const batchId = positiveId(field(form, "batch_id"));
  const agreementId =
    positiveId(field(form, "agreement_id"));
  const versionId =
    positiveId(field(form, "agreement_version_id"));

  const transactionDate =
    field(form, "transaction_date");
  const transactionType =
    field(form, "transaction_type");
  const paymentMethod = field(form, "payment_method");
  const amount = positiveAmount(field(form, "amount"));

  const paymentReference =
    field(form, "payment_reference");
  const remarks = field(form, "remarks");
  const evidence = field(form, "evidence_reference");

  const go = (code: string) =>
    destination(code, batchId ?? undefined);

  if (
    batchId === null ||
    agreementId === null ||
    versionId === null ||
    !validDate(transactionDate) ||
    !TYPES.some((t) => t === transactionType) ||
    !METHODS.some((m) => m === paymentMethod) ||
    amount === null ||
    paymentReference.length > 120 ||
    remarks.length > 500 ||
    evidence.length > 255
  ) {
    redirect(go("invalid-item"));
  }

  // Evidence identifiers are metadata, not document
  // uploads. Do not accept or store document contents.
  if (evidence.length < 3) {
    redirect(go("evidence-required"));
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    const [business] =
      await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    const [batches] =
      await conn.execute<RowDataPacket[]>(
        `SELECT id, status
         FROM acct_historical_funding_batches
         WHERE legal_business_id = ?
           AND id = ?
         FOR UPDATE`,
        [businessId, batchId]
      );

    if (
      business.length !== 1 ||
      batches.length !== 1
    ) {
      result = "batch-not-found";
    } else if (batches[0].status !== "DRAFT") {
      result = "batch-locked";
    } else {
      const [opening] =
        await conn.execute<RowDataPacket[]>(
          `SELECT
             status,
             DATE_FORMAT(opening_date, '%Y-%m-%d')
               AS opening_date
           FROM acct_opening_balance_batches
           WHERE legal_business_id = ?
           FOR UPDATE`,
          [businessId]
        );

      // Staging historical funding is only permitted
      // against an existing, unposted cutover worksheet.
      if (!opening[0]) {
        result = "opening-required";
      } else if (opening[0].status !== "DRAFT") {
        result = "opening-posted";
      } else if (
        transactionDate > opening[0].opening_date
      ) {
        result = "date-after-cutover";
      } else {
        const [agreements] =
          await conn.execute<RowDataPacket[]>(
            `SELECT
               id,
               DATE_FORMAT(effective_from, '%Y-%m-%d')
                 AS effective_from,
               DATE_FORMAT(effective_to, '%Y-%m-%d')
                 AS effective_to
             FROM acct_funding_agreements
             WHERE legal_business_id = ?
               AND id = ?
             FOR UPDATE`,
            [businessId, agreementId]
          );

        const agreement = agreements[0];

        if (
          !agreement ||
          transactionDate < agreement.effective_from ||
          (
            agreement.effective_to !== null &&
            transactionDate > agreement.effective_to
          )
        ) {
          result = "agreement-invalid";
        } else {
          const [versions] =
            await conn.execute<RowDataPacket[]>(
              `SELECT
                 id,
                 version_status,
                 DATE_FORMAT(effective_from, '%Y-%m-%d')
                   AS effective_from,
                 DATE_FORMAT(effective_to, '%Y-%m-%d')
                   AS effective_to
               FROM acct_agreement_versions
               WHERE legal_business_id = ?
                 AND agreement_id = ?
                 AND id = ?
               FOR UPDATE`,
              [businessId, agreementId, versionId]
            );

          const version = versions[0];

          if (
            !version ||
            !["APPROVED", "SUPERSEDED"].includes(
              version.version_status
            ) ||
            transactionDate < version.effective_from ||
            (
              version.effective_to !== null &&
              transactionDate > version.effective_to
            )
          ) {
            result = "version-invalid";
          } else {
            // Strong reference-based duplicate check.
            // Two genuine identical amounts and dates
            // are not automatically duplicates.
            let duplicate = false;

            if (paymentReference) {
              const [staged] =
                await conn.execute<RowDataPacket[]>(
                  `SELECT i.id
                   FROM acct_historical_funding_items i
                   JOIN acct_historical_funding_batches b
                     ON b.id = i.batch_id
                    AND b.legal_business_id =
                        i.legal_business_id
                   WHERE i.legal_business_id = ?
                     AND i.agreement_id = ?
                     AND i.transaction_type = ?
                     AND i.payment_reference = ?
                     AND b.status <> 'CANCELLED'
                   LIMIT 1`,
                  [
                    businessId,
                    agreementId,
                    transactionType,
                    paymentReference,
                  ]
                );

              const [existing] =
                await conn.execute<RowDataPacket[]>(
                  `SELECT id
                   FROM acct_funding_transactions
                   WHERE legal_business_id = ?
                     AND agreement_id = ?
                     AND transaction_type = ?
                     AND payment_reference = ?
                     AND status <> 'VOID'
                   LIMIT 1`,
                  [
                    businessId,
                    agreementId,
                    transactionType,
                    paymentReference,
                  ]
                );

              duplicate =
                staged.length > 0 ||
                existing.length > 0;
            }

            if (duplicate) {
              result = "possible-duplicate";
            } else {
              const [sequence] =
                await conn.execute<RowDataPacket[]>(
                  `SELECT COALESCE(MAX(line_no), 0) AS last_line
                   FROM acct_historical_funding_items
                   WHERE legal_business_id = ?
                     AND batch_id = ?`,
                  [businessId, batchId]
                );

              const lineNo =
                Number(sequence[0].last_line) + 1;

              if (!Number.isSafeInteger(lineNo)) {
                result = "line-limit";
              } else {
                const [inserted] =
                  await conn.execute<ResultSetHeader>(
                    `INSERT INTO acct_historical_funding_items
                     (
                       legal_business_id,
                       batch_id,
                       line_no,
                       agreement_id,
                       agreement_version_id,
                       transaction_date,
                       transaction_type,
                       amount,
                       payment_method,
                       payment_reference,
                       remarks,
                       evidence_reference,
                       validation_status
                     )
                     VALUES (
                       ?, ?, ?, ?, ?, ?, ?, ?,
                       ?, ?, ?, ?, 'PENDING'
                     )`,
                    [
                      businessId,
                      batchId,
                      lineNo,
                      agreementId,
                      versionId,
                      transactionDate,
                      transactionType,
                      amount,
                      paymentMethod,
                      nullable(paymentReference),
                      nullable(remarks),
                      evidence,
                    ]
                  );

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
                    "HISTORICAL_FUNDING_ITEM_CREATED",
                    "HISTORICAL_FUNDING_ITEM",
                    inserted.insertId,
                    JSON.stringify({
                      batch_id: batchId,
                      agreement_id: agreementId,
                      agreement_version_id: versionId,
                      transaction_date: transactionDate,
                      transaction_type: transactionType,
                      amount,
                      line_no: lineNo,
                      evidence_reference: evidence,
                    }),
                  ]
                );

                await conn.commit();
                result = "item-saved";
              }
            }
          }
        }
      }
    }

    if (result !== "item-saved") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Historical funding item save failed", error);
  } finally {
    conn.release();
  }

  if (result === "item-saved") {
    revalidatePath(PAGE);
  }

  redirect(go(result));
}
