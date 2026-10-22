
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  openingWorksheetHash,
} from "@/lib/opening-balance-fingerprint";

const PAGE = "/accounting/opening-balances/review";

const CHECKS = [
  "cash_count_confirmed",
  "bank_statements_confirmed",
  "inventory_valuation_confirmed",
  "liabilities_confirmed",
  "funding_reconciliation_confirmed",
  "cutover_reconciliation_confirmed",
] as const;

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toPaise(value: string): bigint {
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid decimal amount");
  }

  const [whole, decimals = ""] = value.split(".");

  return (
    BigInt(whole) * 100n +
    BigInt(decimals.padEnd(2, "0"))
  );
}

export async function authorizeOpeningBalancesAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const notes = field(form, "reconciliation_notes");
  const confirmed = CHECKS.every(
    (key) => field(form, key) === "yes"
  );

  if (
    !confirmed ||
    notes.length < 20 ||
    notes.length > 10000 ||
    field(form, "confirm") !== "AUTHORIZE"
  ) {
    redirect(`${PAGE}?authorization=invalid`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      outcome = "not-found";
    } else {
      const [batches] = await conn.execute<RowDataPacket[]>(
        `SELECT
           b.id,
           b.status,
           DATE_FORMAT(b.opening_date, '%Y-%m-%d')
             AS opening_date,
           fy.status AS fy_status,
           DATE_FORMAT(fy.starts_on, '%Y-%m-%d')
             AS fy_start,
           DATE_FORMAT(fy.ends_on, '%Y-%m-%d')
             AS fy_end,
           p.status AS period_status,
           DATE_FORMAT(p.start_date, '%Y-%m-%d')
             AS period_start,
           DATE_FORMAT(p.end_date, '%Y-%m-%d')
             AS period_end
         FROM acct_opening_balance_batches b
         JOIN acct_financial_years fy
           ON fy.id = b.financial_year_id
          AND fy.legal_business_id = b.legal_business_id
         JOIN acct_accounting_periods p
           ON p.id = b.accounting_period_id
          AND p.legal_business_id = b.legal_business_id
         WHERE b.legal_business_id = ?
         FOR UPDATE`,
        [businessId]
      );

      const batch = batches[0];

      if (!batch) {
        outcome = "not-found";
      } else if (batch.status !== "DRAFT") {
        outcome = "already-posted";
      } else if (
        batch.fy_status !== "OPEN" ||
        batch.period_status !== "OPEN" ||
        batch.opening_date < batch.fy_start ||
        batch.opening_date > batch.fy_end ||
        batch.opening_date < batch.period_start ||
        batch.opening_date > batch.period_end ||
        batch.period_start < batch.fy_start ||
        batch.period_end > batch.fy_end
      ) {
        outcome = "period-invalid";
      } else {
        const [lines] = await conn.execute<RowDataPacket[]>(
          `SELECT
             CAST(debit AS CHAR) AS debit,
             CAST(credit AS CHAR) AS credit
           FROM acct_opening_balance_lines
           WHERE legal_business_id = ?
             AND batch_id = ?
           ORDER BY line_no
           FOR UPDATE`,
          [businessId, batch.id]
        );

        const [missingInvestorBanks] =
          await conn.execute<RowDataPacket[]>(
            `SELECT b.id
             FROM acct_bank_accounts b
             LEFT JOIN acct_opening_investor_bank_balances x
               ON x.legal_business_id = b.legal_business_id
              AND x.bank_account_id = b.id
              AND x.batch_id = ?
             WHERE b.legal_business_id = ?
               AND b.ownership_type = 'INVESTOR'
               AND x.bank_account_id IS NULL
             LIMIT 1`,
            [batch.id, businessId]
          );

        let debit = 0n;
        let credit = 0n;
        let valid = lines.length >= 2;

        for (const line of lines) {
          const dr = toPaise(line.debit);
          const cr = toPaise(line.credit);

          if (
            !(
              (dr > 0n && cr === 0n) ||
              (cr > 0n && dr === 0n)
            )
          ) {
            valid = false;
            break;
          }

          debit += dr;
          credit += cr;
        }

        if (missingInvestorBanks.length > 0) {
          outcome = "investor-bank-opening-required";
        } else if (
          !valid ||
          debit === 0n ||
          debit !== credit
        ) {
          outcome = "unbalanced";
        } else {
          const [activity] =
            await conn.execute<RowDataPacket[]>(
              `SELECT COUNT(*) AS total
               FROM acct_journal_entries
               WHERE legal_business_id = ?
                 AND status = 'POSTED'
                 AND entry_date <= ?`,
              [businessId, batch.opening_date]
            );

          if (Number(activity[0].total) > 0) {
            // No automatic waiver for old transactions.
            // They require a separate reconciled cutover.
            outcome = "existing-activity";
          } else {
            const hash = await openingWorksheetHash(
              conn,
              businessId,
              Number(batch.id)
            );

            const [existing] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_opening_balance_authorizations
                 WHERE legal_business_id = ?
                   AND batch_id = ?
                 FOR UPDATE`,
                [businessId, batch.id]
              );

            if (existing.length > 0) {
              await conn.execute(
                `UPDATE acct_opening_balance_authorizations
                 SET
                   status = 'APPROVED',
                   opening_date = ?,
                   cash_count_confirmed = 1,
                   bank_statements_confirmed = 1,
                   inventory_valuation_confirmed = 1,
                   liabilities_confirmed = 1,
                   funding_reconciliation_confirmed = 1,
                   cutover_reconciliation_confirmed = 1,
                   reconciliation_notes = ?,
                   worksheet_hash = ?,
                   approved_by = ?,
                   approved_at = CURRENT_TIMESTAMP,
                   revoked_by = NULL,
                   revoked_at = NULL,
                   revocation_reason = NULL
                 WHERE legal_business_id = ?
                   AND batch_id = ?`,
                [
                  batch.opening_date,
                  notes,
                  hash,
                  user.id,
                  businessId,
                  batch.id,
                ]
              );
            } else {
              await conn.execute(
                `INSERT INTO
                   acct_opening_balance_authorizations
                 (
                   legal_business_id,
                   batch_id,
                   status,
                   opening_date,
                   cash_count_confirmed,
                   bank_statements_confirmed,
                   inventory_valuation_confirmed,
                   liabilities_confirmed,
                   funding_reconciliation_confirmed,
                   cutover_reconciliation_confirmed,
                   reconciliation_notes,
                   worksheet_hash,
                   approved_by
                 )
                 VALUES (
                   ?, ?, 'APPROVED', ?,
                   1, 1, 1, 1, 1, 1,
                   ?, ?, ?
                 )`,
                [
                  businessId,
                  batch.id,
                  batch.opening_date,
                  notes,
                  hash,
                  user.id,
                ]
              );
            }

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
                "OPENING_BALANCE_AUTHORIZED",
                "OPENING_BALANCE",
                batch.id,
                JSON.stringify({
                  opening_date: batch.opening_date,
                  worksheet_hash: hash,
                  line_count: lines.length,
                  reconciliation_attested: true,
                  notes,
                }),
              ]
            );

            await conn.commit();
            outcome = "authorized";
          }
        }
      }
    }

    if (outcome !== "authorized") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error(
      "Opening balance authorization failed",
      error
    );
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "authorized") {
    revalidatePath(PAGE);
    revalidatePath("/accounting/opening-balances");
  }

  redirect(`${PAGE}?authorization=${outcome}`);
}
