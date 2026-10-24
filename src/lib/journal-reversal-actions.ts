
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { isAppPostedSource } from "@/lib/ledger/reversible-sources";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/journals";
const MAX_PAISE = 999999999999999999n;

function formText(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function parseId(s: string): number | null {
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() + 1 === m &&
    dt.getUTCDate() === d
  );
}

function paise(input: unknown): bigint | null {
  const s = String(input ?? "");
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
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}

interface Journal extends RowDataPacket {
  id: number;
  journal_no: string;
  status: string;
  entry_date: string;
  source_type: string | null;
  financial_year_id: number;
}

interface JournalLine extends RowDataPacket {
  line_no: number;
  account_id: number;
  division_id: number | null;
  branch_id: number | null;
  description: string | null;
  debit: string;
  credit: string;
}

export async function reversePostedJournalAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const originalId = parseId(
    formText(form, "original_journal_id")
  );
  const periodId = parseId(
    formText(form, "accounting_period_id")
  );
  const reversalDate = formText(form, "reversal_date");
  const reason = formText(form, "reversal_reason");

  if (
    originalId === null ||
    periodId === null ||
    !validDate(reversalDate) ||
    reason.length < 10 ||
    reason.length > 1000 ||
    formText(form, "confirm") !== "REVERSE"
  ) {
    redirect(`${PAGE}?reversal=invalid`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";
  let reversalId: number | null = null;

  try {
    await conn.beginTransaction();

    // Match the lock order of the journal posting
    // and period management services.
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
      const [originalRows] =
        await conn.execute<Journal[]>(
          `SELECT
             id,
             journal_no,
             status,
             source_type,
             financial_year_id,
             DATE_FORMAT(entry_date, '%Y-%m-%d')
               AS entry_date
           FROM acct_journal_entries
           WHERE id = ?
             AND legal_business_id = ?
           FOR UPDATE`,
          [originalId, businessId]
        );

      const original = originalRows[0];

      if (!original) {
        outcome = "not-found";
      } else if (original.status !== "POSTED") {
        outcome = "not-posted";
      } else if (original.source_type !== null && !isAppPostedSource(original.source_type)) {
        // Other integrated journals (opening balances, funding and so on)
        // still need their own source reversal first.
        outcome = "source-restricted";
      } else {
        const [alreadyReversed] =
          await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_journal_reversals
             WHERE legal_business_id = ?
               AND (
                 original_journal_id = ?
                 OR reversal_journal_id = ?
               )
             LIMIT 1`,
            [businessId, originalId, originalId]
          );

        if (alreadyReversed.length > 0) {
          outcome = "already-reversed";
        } else {
          const [periodRows] =
            await conn.execute<RowDataPacket[]>(
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
              [periodId, businessId]
            );

          const period = periodRows[0];

          if (!period) {
            outcome = "period-missing";
          } else if (period.status !== "OPEN") {
            outcome = "period-not-open";
          } else if (
            reversalDate < period.start_date ||
            reversalDate > period.end_date ||
            reversalDate < original.entry_date
          ) {
            outcome = "date-mismatch";
          } else {
            const [years] =
              await conn.execute<RowDataPacket[]>(
                `SELECT
                   id,
                   DATE_FORMAT(starts_on, '%Y-%m-%d')
                     AS starts_on,
                   DATE_FORMAT(ends_on, '%Y-%m-%d')
                     AS ends_on,
                   status
                 FROM acct_financial_years
                 WHERE legal_business_id = ?
                   AND status = 'OPEN'
                   AND starts_on <= ?
                   AND ends_on >= ?
                 FOR UPDATE`,
                [businessId, reversalDate, reversalDate]
              );

            const matchingYears = years.filter(
              (y) =>
                period.start_date >= y.starts_on &&
                period.end_date <= y.ends_on
            );

            if (matchingYears.length !== 1) {
              outcome = "financial-year-mismatch";
            } else {
              const year = matchingYears[0];

              const [lines] =
                await conn.execute<JournalLine[]>(
                  `SELECT
                     line_no,
                     account_id,
                     division_id,
                     branch_id,
                     description,
                     CAST(debit AS CHAR) AS debit,
                     CAST(credit AS CHAR) AS credit
                   FROM acct_journal_lines
                   WHERE journal_entry_id = ?
                     AND legal_business_id = ?
                   ORDER BY line_no
                   FOR UPDATE`,
                  [originalId, businessId]
                );

              let totalDebit = 0n;
              let totalCredit = 0n;
              let valid = lines.length >= 2;

              for (const line of lines) {
                const debit = paise(line.debit);
                const credit = paise(line.credit);

                if (
                  debit === null ||
                  credit === null ||
                  !(
                    (debit > 0n && credit === 0n) ||
                    (credit > 0n && debit === 0n)
                  )
                ) {
                  valid = false;
                  break;
                }

                totalDebit += debit;
                totalCredit += credit;
              }

              if (
                !valid ||
                totalDebit === 0n ||
                totalDebit !== totalCredit ||
                totalDebit > MAX_PAISE
              ) {
                outcome = "invalid-original";
              } else {
                // Inherit original accounts and dimensions.
                // Inactive accounts/branches remain usable
                // solely for the exact reversal of history.
                const draftNo =
                  "R-" + randomBytes(16).toString("hex");

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
                     VALUES (?, ?, ?, ?, ?, ?,
                       'JOURNAL_REVERSAL', ?, 'DRAFT', ?)`,
                    [
                      businessId,
                      year.id,
                      periodId,
                      draftNo,
                      reversalDate,
                      `Reversal of ${original.journal_no}: ${reason}`
                        .slice(0, 500),
                      originalId,
                      user.id,
                    ]
                  );

                reversalId = created.insertId;

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
                      reversalId,
                      businessId,
                      line.line_no,
                      line.account_id,
                      line.division_id,
                      line.branch_id,
                      line.description,
                      line.credit,
                      line.debit,
                    ]
                  );
                }

                // Allocate the posted number using the
                // same sequence table as normal journals.
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
                  [businessId, year.id]
                );

                const [seq] =
                  await conn.execute<RowDataPacket[]>(
                    `SELECT last_number
                     FROM acct_journal_post_sequences
                     WHERE legal_business_id = ?
                       AND financial_year_id = ?
                     FOR UPDATE`,
                    [businessId, year.id]
                  );

                const next = BigInt(seq[0].last_number) + 1n;

                if (next > 999999n) {
                  outcome = "sequence-exhausted";
                } else {
                  const fyLabel =
                    `${year.starts_on.slice(0, 4)}-` +
                    `${year.ends_on.slice(2, 4)}`;

                  const postedNo =
                    `AG-JV-${fyLabel}-` +
                    next.toString().padStart(6, "0");

                  // Fail safely if any historical journal
                  // already uses the proposed number.
                  const [collision] =
                    await conn.execute<RowDataPacket[]>(
                      `SELECT id
                       FROM acct_journal_entries
                       WHERE legal_business_id = ?
                         AND journal_no = ?
                       LIMIT 1`,
                      [businessId, postedNo]
                    );

                  if (collision.length) {
                    outcome = "number-conflict";
                  } else {
                    await conn.execute(
                      `UPDATE acct_journal_post_sequences
                       SET last_number = ?
                       WHERE legal_business_id = ?
                         AND financial_year_id = ?`,
                      [next.toString(), businessId, year.id]
                    );

                    const [posted] =
                      await conn.execute<ResultSetHeader>(
                        `UPDATE acct_journal_entries
                         SET journal_no = ?,
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
                          reversalId,
                          businessId,
                        ]
                      );

                    if (posted.affectedRows !== 1) {
                      outcome = "posting-conflict";
                    } else {
                      await conn.execute(
                        `INSERT INTO acct_journal_reversals
                         (
                           legal_business_id,
                           original_journal_id,
                           reversal_journal_id,
                           reversal_reason,
                           reversed_by
                         )
                         VALUES (?, ?, ?, ?, ?)`,
                        [
                          businessId,
                          originalId,
                          reversalId,
                          reason,
                          user.id,
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
                          "JOURNAL_REVERSED",
                          "JOURNAL",
                          originalId,
                          JSON.stringify({
                            original_journal_id: originalId,
                            original_journal_no:
                              original.journal_no,
                            reversal_journal_id: reversalId,
                            reversal_journal_no: postedNo,
                            reversal_date: reversalDate,
                            reason,
                            original_total: money(totalDebit),
                          }),
                        ]
                      );

                      await conn.commit();
                      outcome = "reversed";
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (outcome !== "reversed") {
      await conn.rollback();
      reversalId = null;
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Journal reversal failed");
    outcome = "failed";
    reversalId = null;
  } finally {
    conn.release();
  }

  if (outcome === "reversed") {
    revalidatePath(PAGE);
    revalidatePath(`${PAGE}/${originalId}`);
    if (reversalId !== null) {
      revalidatePath(`${PAGE}/${reversalId}`);
    }
  }

  redirect(`${PAGE}/${originalId}?reversal=${outcome}`);
}
