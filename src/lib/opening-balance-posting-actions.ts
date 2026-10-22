
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import {
  validateOpeningFundingForPosting,
} from "@/lib/opening-funding-posting-check";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  openingWorksheetHash,
} from "@/lib/opening-balance-fingerprint";

const REVIEW = "/accounting/opening-balances/review";
const MAX_PAISE = 999999999999999999n;

function amountToPaise(value: unknown): bigint | null {
  const s = String(value ?? "");

  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(s)) {
    return null;
  }

  const [whole, decimals = ""] = s.split(".");
  const result =
    BigInt(whole) * 100n +
    BigInt(decimals.padEnd(2, "0"));

  return result <= MAX_PAISE ? result : null;
}

function money(n: bigint): string {
  return (
    `${n / 100n}.` +
    `${String(n % 100n).padStart(2, "0")}`
  );
}

function nullableId(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : Number(value);
}

interface BatchRow extends RowDataPacket {
  id: number;
  status: string;
  opening_date: string;
  description: string;
  financial_year_id: number;
  accounting_period_id: number;
  posted_journal_id: number | null;
}

interface OpeningLineRow extends RowDataPacket {
  id: number;
  line_no: number;
  account_id: number;
  division_id: number | null;
  branch_id: number | null;
  debit: string;
  credit: string;
  notes: string | null;

  account_type: string;
  account_subtype: string;
  account_status: string;
  is_posting_account: number;
  requires_division: number;
  requires_branch: number;

  funding_party_id: number | null;
  agreement_id: number | null;
  classification: string | null;
  opening_amount: string | null;

  bank_count: number;
  cash_count: number;
  cash_division: number | null;
  cash_branch: number | null;
}

export async function postOpeningBalancesAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  if (form.get("confirm") !== "POST_OPENING") {
    redirect(`${REVIEW}?posting=invalid`);
  }

  const conn = await db.getConnection();

  let result = "failed";
  let postedJournalId: number | null = null;

  try {
    await conn.beginTransaction();

    // This is the first lock used by all our
    // accounting-writing services.
    const [businessRows] =
      await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    if (businessRows.length !== 1) {
      result = "not-found";
    } else {
      const [batches] =
        await conn.execute<BatchRow[]>(
          `SELECT
             id, status, description,
             financial_year_id,
             accounting_period_id,
             posted_journal_id,
             DATE_FORMAT(opening_date, '%Y-%m-%d') AS opening_date
           FROM acct_opening_balance_batches
           WHERE legal_business_id = ?
           FOR UPDATE`,
          [businessId]
        );

      const batch = batches[0];

      if (!batch) {
        result = "not-found";
      } else if (
        batch.status !== "DRAFT" ||
        batch.posted_journal_id !== null
      ) {
        result = "already-posted";
      } else {
        const [years] =
          await conn.execute<RowDataPacket[]>(
            `SELECT
               id, status,
               DATE_FORMAT(starts_on, '%Y-%m-%d')
                 AS starts_on,
               DATE_FORMAT(ends_on, '%Y-%m-%d')
                 AS ends_on
             FROM acct_financial_years
             WHERE legal_business_id = ?
               AND id = ?
             FOR UPDATE`,
            [businessId, batch.financial_year_id]
          );

        const [periods] =
          await conn.execute<RowDataPacket[]>(
            `SELECT
               id, status,
               DATE_FORMAT(start_date, '%Y-%m-%d')
                 AS start_date,
               DATE_FORMAT(end_date, '%Y-%m-%d')
                 AS end_date
             FROM acct_accounting_periods
             WHERE legal_business_id = ?
               AND id = ?
             FOR UPDATE`,
            [businessId, batch.accounting_period_id]
          );

        const fy = years[0];
        const period = periods[0];
        const date = batch.opening_date;

        if (
          !fy ||
          !period ||
          fy.status !== "OPEN" ||
          period.status !== "OPEN" ||
          date < fy.starts_on ||
          date > fy.ends_on ||
          date < period.start_date ||
          date > period.end_date ||
          period.start_date < fy.starts_on ||
          period.end_date > fy.ends_on
        ) {
          result = "period-invalid";
        } else {
          const [approvals] =
            await conn.execute<RowDataPacket[]>(
              `SELECT
                 status,
                 worksheet_hash,
                 DATE_FORMAT(opening_date, '%Y-%m-%d') AS opening_date,
                 cash_count_confirmed,
                 bank_statements_confirmed,
                 inventory_valuation_confirmed,
                 liabilities_confirmed,
                 funding_reconciliation_confirmed,
                 cutover_reconciliation_confirmed
               FROM acct_opening_balance_authorizations
               WHERE legal_business_id = ?
                 AND batch_id = ?
               FOR UPDATE`,
              [businessId, batch.id]
            );

          const approval = approvals[0];

          const checks = [
            "cash_count_confirmed",
            "bank_statements_confirmed",
            "inventory_valuation_confirmed",
            "liabilities_confirmed",
            "funding_reconciliation_confirmed",
            "cutover_reconciliation_confirmed",
          ];

          if (
            !approval ||
            approval.status !== "APPROVED" ||
            String(approval.opening_date)
              .slice(0, 10) !== date ||
            !checks.every(
              (key) => Number(approval[key]) === 1
            )
          ) {
            result = "authorization-required";
          } else {
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

            if (missingInvestorBanks.length > 0) {
              result = "investor-bank-opening-required";
            } else {
              const actualHash =
                await openingWorksheetHash(
                  conn,
                  businessId,
                  Number(batch.id)
                );

              if (actualHash !== approval.worksheet_hash) {
                result = "approval-stale";
              } else {
                const [existingJournals] =
                  await conn.execute<RowDataPacket[]>(
                    `SELECT id
                     FROM acct_journal_entries
                     WHERE legal_business_id = ?
                       AND status = 'POSTED'
                       AND (
                         source_type = 'OPENING_BALANCE'
                         OR entry_date <= ?
                       )
                     LIMIT 1`,
                    [businessId, date]
                  );

                if (existingJournals.length > 0) {
                  result = "existing-activity";
                } else {
                  const [lines] =
                    await conn.execute<OpeningLineRow[]>(
                      `SELECT
                       l.id, l.line_no, l.account_id,
                       l.division_id, l.branch_id,
                       l.notes,
                       CAST(l.debit AS CHAR) AS debit,
                       CAST(l.credit AS CHAR) AS credit,

                       a.account_type,
                       a.account_subtype,
                       a.status AS account_status,
                       a.is_posting_account,
                       a.requires_division,
                       a.requires_branch,

                       f.funding_party_id,
                       f.agreement_id,
                       f.classification,
                       CAST(f.opening_amount AS CHAR)
                         AS opening_amount,

                       (
                         SELECT COUNT(*)
                         FROM acct_bank_accounts b
                         WHERE b.legal_business_id =
                               l.legal_business_id
                           AND b.gl_account_id = l.account_id
                           AND b.ownership_type = 'BUSINESS'
                           AND b.status = 'ACTIVE'
                           AND b.verification_status = 'VERIFIED'
                       ) AS bank_count,

                       (
                         SELECT COUNT(*)
                         FROM acct_cash_accounts c
                         WHERE c.legal_business_id =
                               l.legal_business_id
                           AND c.gl_account_id = l.account_id
                           AND c.status = 'ACTIVE'
                       ) AS cash_count,

                       (
                         SELECT c.division_id
                         FROM acct_cash_accounts c
                         WHERE c.legal_business_id =
                               l.legal_business_id
                           AND c.gl_account_id = l.account_id
                         LIMIT 1
                       ) AS cash_division,

                       (
                         SELECT c.branch_id
                         FROM acct_cash_accounts c
                         WHERE c.legal_business_id =
                               l.legal_business_id
                           AND c.gl_account_id = l.account_id
                         LIMIT 1
                       ) AS cash_branch

                     FROM acct_opening_balance_lines l
                     JOIN acct_chart_of_accounts a
                       ON a.id = l.account_id
                      AND a.legal_business_id =
                          l.legal_business_id

                     LEFT JOIN acct_opening_funding_details f
                       ON f.legal_business_id =
                          l.legal_business_id
                      AND f.opening_line_id = l.id

                     WHERE l.legal_business_id = ?
                       AND l.batch_id = ?
                     ORDER BY l.line_no
                     FOR UPDATE`,
                      [businessId, batch.id]
                    );

                let valid = lines.length >= 2;
                let debitTotal = 0n;
                let creditTotal = 0n;

                const physicalIds = new Set<number>();
                const agreementIds = new Set<number>();
                const divisionIds = new Set<number>();
                const branchIds = new Set<number>();

                for (const line of lines) {
                  const dr = amountToPaise(line.debit);
                  const cr = amountToPaise(line.credit);

                  if (
                    dr === null ||
                    cr === null ||
                    !(
                      (dr > 0n && cr === 0n) ||
                      (cr > 0n && dr === 0n)
                    ) ||
                    line.account_status !== "ACTIVE" ||
                    Number(line.is_posting_account) !== 1 ||
                    !["ASSET", "LIABILITY", "EQUITY"].includes(
                      line.account_type
                    ) ||
                    (
                      Number(line.requires_division) === 1 &&
                      line.division_id === null
                    ) ||
                    (
                      Number(line.requires_branch) === 1 &&
                      line.branch_id === null
                    ) ||
                    (
                      line.branch_id !== null &&
                      line.division_id === null
                    )
                  ) {
                    valid = false;
                    break;
                  }

                  debitTotal += dr;
                  creditTotal += cr;

                  if (line.division_id !== null) {
                    divisionIds.add(Number(line.division_id));
                  }

                  if (line.branch_id !== null) {
                    branchIds.add(Number(line.branch_id));
                  }

                  const bankCount = Number(line.bank_count);
                  const cashCount = Number(line.cash_count);

                  const isBank =
                    line.account_subtype === "BANK" ||
                    bankCount > 0;

                  const isCash =
                    line.account_subtype === "CASH" ||
                    cashCount > 0;

                  if (isBank || isCash) {
                    const accountId = Number(line.account_id);

                    if (physicalIds.has(accountId)) {
                      valid = false;
                      break;
                    }

                    physicalIds.add(accountId);

                    if (isBank && (
                      bankCount !== 1 ||
                      line.division_id !== null ||
                      line.branch_id !== null
                    )) {
                      valid = false;
                      break;
                    }

                    if (isCash && (
                      cashCount !== 1 ||
                      nullableId(line.cash_division) !==
                        nullableId(line.division_id) ||
                      nullableId(line.cash_branch) !==
                        nullableId(line.branch_id)
                    )) {
                      valid = false;
                      break;
                    }
                  }

                  if (line.funding_party_id !== null) {
                    if (
                      line.agreement_id === null ||
                      cr <= 0n ||
                      line.account_type !== "LIABILITY" ||
                      line.classification !==
                        "REPAYABLE_LIABILITY" ||
                      line.opening_amount === null ||
                      amountToPaise(line.opening_amount) !== cr ||
                      isBank ||
                      isCash
                    ) {
                      valid = false;
                      break;
                    }

                    const agreementId =
                      Number(line.agreement_id);

                    if (agreementIds.has(agreementId)) {
                      valid = false;
                      break;
                    }

                    agreementIds.add(agreementId);
                  } else if (
                    line.account_subtype
                      ?.toUpperCase()
                      .includes("INVESTOR")
                  ) {
                    valid = false;
                    break;
                  }
                }

                if (
                  !valid ||
                  debitTotal === 0n ||
                  debitTotal !== creditTotal ||
                  debitTotal > MAX_PAISE
                ) {
                  result = "invalid-lines";
                } else {
                  // Validate the Division/Branch hierarchy.
                  const [divisions] =
                    await conn.execute<RowDataPacket[]>(
                      `SELECT id
                       FROM acct_divisions
                       WHERE legal_business_id = ?`,
                      [businessId]
                    );

                  const [branches] =
                    await conn.execute<RowDataPacket[]>(
                      `SELECT id, division_id
                       FROM acct_branches
                       WHERE legal_business_id = ?
                         AND status = 'ACTIVE'`,
                      [businessId]
                    );

                  const validDivisions = new Set(
                    divisions.map((d) => Number(d.id))
                  );

                  const validBranches = new Map(
                    branches.map((b) => [
                      Number(b.id),
                      Number(b.division_id),
                    ])
                  );

                  const scopesValid =
                    [...divisionIds].every(
                      (id) => validDivisions.has(id)
                    ) &&
                    lines.every((line) =>
                      line.branch_id === null ||
                      validBranches.get(
                        Number(line.branch_id)
                      ) === Number(line.division_id)
                    );

                  if (!scopesValid) {
                    result = "invalid-scope";
                  } else {
                    const fundingCheck =
                      await validateOpeningFundingForPosting(
                        conn,
                        businessId,
                        date,
                        lines
                      );

                    if (fundingCheck !== "ok") {
                      result = fundingCheck;
                    } else {
                      // Generate a draft journal within
                      // this same database transaction.
                      const draftNo =
                        "O-" +
                        randomBytes(16).toString("hex");

                      const [created] =
                        await conn.execute<ResultSetHeader>(
                          `INSERT INTO acct_journal_entries
                           (
                             legal_business_id,
                             financial_year_id,
                             accounting_period_id,
                             journal_no,
                             entry_date,
                             description,
                             source_type,
                             source_id,
                             status,
                             created_by
                           )
                           VALUES (
                             ?, ?, ?, ?, ?, ?,
                             'OPENING_BALANCE', ?,
                             'DRAFT', ?
                           )`,
                          [
                            businessId,
                            batch.financial_year_id,
                            batch.accounting_period_id,
                            draftNo,
                            date,
                            batch.description,
                            batch.id,
                            user.id,
                          ]
                        );

                      const journalId = created.insertId;

                      for (const line of lines) {
                        await conn.execute(
                          `INSERT INTO acct_journal_lines
                           (
                             journal_entry_id,
                             legal_business_id,
                             line_no,
                             account_id,
                             division_id,
                             branch_id,
                             description,
                             debit,
                             credit
                           )
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                          [
                            journalId,
                            businessId,
                            line.line_no,
                            line.account_id,
                            line.division_id,
                            line.branch_id,
                            line.notes,
                            line.debit,
                            line.credit,
                          ]
                        );
                      }

                      // Use the existing journal-number
                      // sequence, serialized by the
                      // legal-business lock.
                      await conn.execute(
                        `INSERT INTO acct_journal_post_sequences
                         (
                           legal_business_id,
                           financial_year_id,
                           last_number
                         )
                         VALUES (?, ?, 0)
                         ON DUPLICATE KEY UPDATE
                           last_number = last_number`,
                        [businessId, batch.financial_year_id]
                      );

                      const [sequences] =
                        await conn.execute<RowDataPacket[]>(
                          `SELECT last_number
                           FROM acct_journal_post_sequences
                           WHERE legal_business_id = ?
                             AND financial_year_id = ?
                           FOR UPDATE`,
                          [
                            businessId,
                            batch.financial_year_id,
                          ]
                        );

                      const next =
                        BigInt(sequences[0].last_number) + 1n;

                      if (next > 999999n) {
                        result = "sequence-exhausted";
                      } else {
                        const fyLabel =
                          fy.starts_on.slice(0, 4) +
                          "-" +
                          fy.ends_on.slice(2, 4);

                        const postedNo =
                          `AG-JV-${fyLabel}-` +
                          String(next).padStart(6, "0");

                        const [collision] =
                          await conn.execute<RowDataPacket[]>(
                            `SELECT id
                             FROM acct_journal_entries
                             WHERE legal_business_id = ?
                               AND journal_no = ?
                             LIMIT 1`,
                            [businessId, postedNo]
                          );

                        if (collision.length > 0) {
                          result = "number-conflict";
                        } else {
                          await conn.execute(
                            `UPDATE acct_journal_post_sequences
                             SET last_number = ?
                             WHERE legal_business_id = ?
                               AND financial_year_id = ?`,
                            [
                              next.toString(),
                              businessId,
                              batch.financial_year_id,
                            ]
                          );

                          const [posted] =
                            await conn.execute<ResultSetHeader>(
                              `UPDATE acct_journal_entries
                               SET
                                 journal_no = ?,
                                 draft_reference = ?,
                                 status = 'POSTED',
                                 posted_by = ?,
                                 posted_at = CURRENT_TIMESTAMP
                               WHERE id = ?
                                 AND legal_business_id = ?
                                 AND status = 'DRAFT'`,
                              [
                                postedNo,
                                draftNo,
                                user.id,
                                journalId,
                                businessId,
                              ]
                            );

                          if (posted.affectedRows !== 1) {
                            result = "posting-conflict";
                          } else {
                            const [updated] =
                              await conn.execute<ResultSetHeader>(
                                `UPDATE acct_opening_balance_batches
                                 SET
                                   status = 'POSTED',
                                   posted_journal_id = ?,
                                   posted_by = ?,
                                   posted_at = CURRENT_TIMESTAMP,
                                   updated_by = ?
                                 WHERE id = ?
                                   AND legal_business_id = ?
                                   AND status = 'DRAFT'
                                   AND posted_journal_id IS NULL`,
                                [
                                  journalId,
                                  user.id,
                                  user.id,
                                  batch.id,
                                  businessId,
                                ]
                              );

                            if (updated.affectedRows !== 1) {
                              result = "posting-conflict";
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
                                  "OPENING_BALANCE_POSTED",
                                  "OPENING_BALANCE",
                                  batch.id,
                                  JSON.stringify({
                                    journal_id: journalId,
                                    journal_no: postedNo,
                                    opening_date: date,
                                    worksheet_hash: actualHash,
                                    total_debit: money(debitTotal),
                                    total_credit: money(creditTotal),
                                    line_count: lines.length,
                                    funding_agreement_count:
                                      agreementIds.size,
                                  }),
                                ]
                              );

                              await conn.commit();
                              postedJournalId = journalId;
                              result = "posted";
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      }

    }

    if (result !== "posted") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Opening balance posting failed", error);
    result = "failed";
  } finally {
    conn.release();
  }

  if (result === "posted") {
    revalidatePath("/accounting/opening-balances");
    revalidatePath(REVIEW);
    revalidatePath("/accounting/journals");

    if (postedJournalId !== null) {
      revalidatePath(
        `/accounting/journals/${postedJournalId}`
      );
    }
  }

  redirect(`${REVIEW}?posting=${result}`);
}
