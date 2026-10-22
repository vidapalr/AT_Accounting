
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/journals";
const MAX_PAISE = 999999999999999999n;

function formText(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function validId(s: string): number | null {
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

function parseMoney(value: unknown): bigint | null {
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

function formatMoney(value: bigint): string {
  return (
    `${value / 100n}.` +
    `${value % 100n}`.padStart(2, "0")
  );
}

interface HeaderRow extends RowDataPacket {
  id: number;
  financial_year_id: number;
  accounting_period_id: number | null;
  journal_no: string;
  entry_date: string;
  status: string;
  source_type: string | null;
  source_id: number | null;
}

interface LineRow extends RowDataPacket {
  id: number;
  account_id: number;
  division_id: number | null;
  branch_id: number | null;
  debit: string;
  credit: string;
  account_type: string | null;
  account_subtype: string | null;
  is_posting_account: number | null;
  account_status: string | null;
  requires_division: number | null;
  requires_branch: number | null;
  linked_bank_count: number;
  line_no: number;
}

const RESTRICTED_TYPES = new Set([
  "BANK",
  "CASH",
  "FUNDING_CLEARING",
  "INVESTOR_PRINCIPAL",
  "LOAN",
  "DISTRIBUTION",
  "CAPITAL",
  "DRAWINGS",
  "TAX",
  "INVENTORY",
  "RETAIL_SALES",
  "WHOLESALE_SALES",
  "RECEIVABLE",
  "PAYABLE",
  "COGS",
  "CONTRA_REVENUE",
  "CONTRA_COGS",
]);

export async function postDraftJournalAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const journalId = validId(
    formText(form, "journal_id")
  );

  if (journalId === null ||
      formText(form, "confirm") !== "POST") {
    redirect(`${PAGE}?posting=invalid`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    // Serialize sensitive accounting changes within
    // the legal business. Period status actions use
    // the same first lock.
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
      const [headers] = await conn.execute<HeaderRow[]>(
        `SELECT
           id,
           financial_year_id,
           accounting_period_id,
           journal_no,
           DATE_FORMAT(entry_date, '%Y-%m-%d')
             AS entry_date,
           status,
           source_type,
           source_id
         FROM acct_journal_entries
         WHERE id = ?
           AND legal_business_id = ?
         FOR UPDATE`,
        [journalId, businessId]
      );

      const header = headers[0];

      if (!header) {
        outcome = "not-found";
      } else if (header.status !== "DRAFT") {
        outcome = "already-processed";
      } else if (
        header.source_type !== null ||
        header.source_id !== null
      ) {
        // Automated source journals require their
        // own controlled posting integration.
        outcome = "source-restricted";
      } else if (header.accounting_period_id === null) {
        outcome = "period-required";
      } else {
        const [years] = await conn.execute<RowDataPacket[]>(
          `SELECT
             id,
             DATE_FORMAT(starts_on, '%Y-%m-%d')
               AS starts_on,
             DATE_FORMAT(ends_on, '%Y-%m-%d')
               AS ends_on,
             status
           FROM acct_financial_years
           WHERE id = ?
             AND legal_business_id = ?
           FOR UPDATE`,
          [header.financial_year_id, businessId]
        );

        const [periods] = await conn.execute<RowDataPacket[]>(
          `SELECT
             id,
             DATE_FORMAT(start_date, '%Y-%m-%d')
               AS start_date,
             DATE_FORMAT(end_date, '%Y-%m-%d')
               AS end_date,
             status
           FROM acct_accounting_periods
           WHERE id = ?
             AND legal_business_id = ?
           FOR UPDATE`,
          [header.accounting_period_id, businessId]
        );

        const fy = years[0];
        const period = periods[0];
        const date = header.entry_date;

        if (!fy || !period) {
          outcome = "financial-period-missing";
        } else if (
          fy.status !== "OPEN" ||
          period.status !== "OPEN"
        ) {
          outcome = "period-not-open";
        } else if (
          date < fy.starts_on ||
          date > fy.ends_on ||
          date < period.start_date ||
          date > period.end_date ||
          period.start_date < fy.starts_on ||
          period.end_date > fy.ends_on
        ) {
          outcome = "date-mismatch";
        } else {
          const [lines] = await conn.execute<LineRow[]>(
            `SELECT
               l.id,
               l.line_no,
               l.account_id,
               l.division_id,
               l.branch_id,
               CAST(l.debit AS CHAR) AS debit,
               CAST(l.credit AS CHAR) AS credit,
               a.account_type,
               a.account_subtype,
               a.is_posting_account,
               a.status AS account_status,
               a.requires_division,
               a.requires_branch,
               (
                 SELECT COUNT(*)
                 FROM acct_bank_accounts b
                 WHERE b.legal_business_id =
                       l.legal_business_id
                   AND b.gl_account_id = l.account_id
               ) AS linked_bank_count
             FROM acct_journal_lines l
             LEFT JOIN acct_chart_of_accounts a
               ON a.id = l.account_id
              AND a.legal_business_id =
                  l.legal_business_id
             WHERE l.journal_entry_id = ?
               AND l.legal_business_id = ?
             ORDER BY l.line_no
             FOR UPDATE`,
            [journalId, businessId]
          );

          if (lines.length < 2) {
            outcome = "invalid-lines";
          } else {
            let totalDebit = 0n;
            let totalCredit = 0n;
            let valid = true;
            let restricted = false;

            const divisionIds = new Set<number>();
            const branchIds = new Set<number>();

            for (const line of lines) {
              const debit = parseMoney(line.debit);
              const credit = parseMoney(line.credit);

              if (
                debit === null ||
                credit === null ||
                !(
                  (debit > 0n && credit === 0n) ||
                  (credit > 0n && debit === 0n)
                ) ||
                !line.account_type ||
                line.account_status !== "ACTIVE" ||
                Number(line.is_posting_account) !== 1 ||
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

              if (
                RESTRICTED_TYPES.has(
                  String(line.account_subtype)
                ) ||
                Number(line.linked_bank_count) > 0
              ) {
                restricted = true;
              }

              if (line.division_id !== null) {
                divisionIds.add(Number(line.division_id));
              }

              if (line.branch_id !== null) {
                branchIds.add(Number(line.branch_id));
              }

              totalDebit += debit;
              totalCredit += credit;
            }

            if (!valid) {
              outcome = "invalid-lines";
            } else if (restricted) {
              outcome = "restricted-account";
            } else if (
              totalDebit === 0n ||
              totalDebit !== totalCredit ||
              totalDebit > MAX_PAISE
            ) {
              outcome = "unbalanced";
            } else {
              const divisions = new Map<number, boolean>();
              const branches = new Map<number, number>();

              if (divisionIds.size > 0) {
                const ids = [...divisionIds];
                const [rows] =
                  await conn.query<RowDataPacket[]>(
                    `SELECT id
                     FROM acct_divisions
                     WHERE legal_business_id = ?
                       AND id IN (
                         ${ids.map(() => "?").join(",")}
                       )`,
                    [businessId, ...ids]
                  );

                for (const row of rows) {
                  divisions.set(Number(row.id), true);
                }
              }

              if (branchIds.size > 0) {
                const ids = [...branchIds];
                const [rows] =
                  await conn.query<RowDataPacket[]>(
                    `SELECT id, division_id
                     FROM acct_branches
                     WHERE legal_business_id = ?
                       AND status = 'ACTIVE'
                       AND id IN (
                         ${ids.map(() => "?").join(",")}
                       )`,
                    [businessId, ...ids]
                  );

                for (const row of rows) {
                  branches.set(
                    Number(row.id),
                    Number(row.division_id)
                  );
                }
              }

              const dimensionsValid = lines.every(
                (line) => {
                  if (
                    line.division_id !== null &&
                    !divisions.has(Number(line.division_id))
                  ) {
                    return false;
                  }

                  if (line.branch_id !== null) {
                    return (
                      branches.get(Number(line.branch_id)) ===
                      Number(line.division_id)
                    );
                  }

                  return true;
                }
              );

              if (!dimensionsValid) {
                outcome = "invalid-dimension";
              } else {
                // A single business lock serializes sequence
                // allocation for this business.
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
                  [businessId, header.financial_year_id]
                );

                const [sequenceRows] =
                  await conn.execute<RowDataPacket[]>(
                    `SELECT last_number
                     FROM acct_journal_post_sequences
                     WHERE legal_business_id = ?
                       AND financial_year_id = ?
                     FOR UPDATE`,
                    [businessId, header.financial_year_id]
                  );

                const nextNumber =
                  BigInt(sequenceRows[0].last_number) + 1n;

                if (nextNumber > 999999n) {
                  outcome = "sequence-exhausted";
                } else {
                  const label =
                    `${fy.starts_on.slice(0, 4)}-` +
                    `${fy.ends_on.slice(2, 4)}`;

                  const postedNumber =
                    `AG-JV-${label}-` +
                    nextNumber.toString().padStart(6, "0");

                  await conn.execute(
                    `UPDATE acct_journal_post_sequences
                     SET last_number = ?
                     WHERE legal_business_id = ?
                       AND financial_year_id = ?`,
                    [
                      nextNumber.toString(),
                      businessId,
                      header.financial_year_id,
                    ]
                  );

                  const [updated] = await conn.execute<
                    import("mysql2").ResultSetHeader
                  >(
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
                      postedNumber,
                      header.journal_no,
                      user.id,
                      journalId,
                      businessId,
                    ]
                  );

                  if (updated.affectedRows !== 1) {
                    outcome = "already-processed";
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
                        "JOURNAL_POSTED",
                        "JOURNAL",
                        journalId,
                        JSON.stringify({
                          posted_journal_no: postedNumber,
                          draft_reference: header.journal_no,
                          financial_year_id:
                            header.financial_year_id,
                          accounting_period_id:
                            header.accounting_period_id,
                          entry_date: header.entry_date,
                          total_debit: formatMoney(totalDebit),
                          total_credit: formatMoney(totalCredit),
                          line_count: lines.length,
                        }),
                      ]
                    );

                    await conn.commit();
                    outcome = "posted";
                  }
                }
              }
            }
          }
        }
      }
    }

    if (outcome !== "posted") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    // Avoid logging confidential journal details.
    console.error("Journal posting failed", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "posted") {
    revalidatePath(PAGE);
  }

  redirect(`${PAGE}?posting=${outcome}`);
}
