
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

const PAGE = "/accounting/journals";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string"
    ? value.trim()
    : "";
}

function positiveId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function optionalId(value: string): number | null {
  return value === "" ? null : positiveId(value);
}

// Use integer paise for exact monetary validation.
// No parseFloat or floating-point arithmetic.
function toPaise(value: string): bigint | null {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [whole, fraction = ""] = value.split(".");
  const result =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  return result <= 999999999999999999n
    ? result
    : null;
}

function toMoney(value: bigint): string {
  return (
    (value / 100n).toString() +
    "." +
    (value % 100n).toString().padStart(2, "0")
  );
}

function validDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return false;
  }

  const [year, month, day] = input
    .split("-")
    .map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

type DraftLine = {
  accountId: number;
  divisionId: number | null;
  branchId: number | null;
  description: string | null;
  debit: bigint;
  credit: bigint;
};

function parseLines(form: FormData): DraftLine[] | null {
  const lines: DraftLine[] = [];

  // The initial screen offers six line rows.
  for (let i = 0; i < 6; i++) {
    const prefix = `line_${i}_`;
    const accountText = field(form, prefix + "account");
    const debitText = field(form, prefix + "debit");
    const creditText = field(form, prefix + "credit");
    const divisionText = field(form, prefix + "division");
    const branchText = field(form, prefix + "branch");
    const description = field(
      form, prefix + "description"
    );

    const entirelyBlank =
      !accountText &&
      !debitText &&
      !creditText &&
      !divisionText &&
      !branchText &&
      !description;

    if (entirelyBlank) continue;

    const accountId = positiveId(accountText);
    const divisionId = optionalId(divisionText);
    const branchId = optionalId(branchText);

    if (
      accountId === null ||
      (divisionText !== "" && divisionId === null) ||
      (branchText !== "" && branchId === null) ||
      (branchId !== null && divisionId === null) ||
      description.length > 500
    ) {
      return null;
    }

    const debit = toPaise(debitText || "0");
    const credit = toPaise(creditText || "0");

    if (
      debit === null ||
      credit === null ||
      !(
        (debit > 0n && credit === 0n) ||
        (credit > 0n && debit === 0n)
      )
    ) {
      return null;
    }

    lines.push({
      accountId,
      divisionId,
      branchId,
      description: description || null,
      debit,
      credit,
    });
  }

  return lines.length >= 2 ? lines : null;
}

export async function createDraftJournalAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const financialYearId = positiveId(
    field(form, "financial_year_id")
  );
  const accountingPeriodId = positiveId(
    field(form, "accounting_period_id")
  );
  const entryDate = field(form, "entry_date");
  const description = field(form, "description");
  const lines = parseLines(form);

  if (
    financialYearId === null ||
    accountingPeriodId === null ||
    !validDate(entryDate) ||
    description.length < 5 ||
    description.length > 500 ||
    !lines
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  const totalDebit = lines.reduce(
    (sum, line) => sum + line.debit,
    0n
  );
  const totalCredit = lines.reduce(
    (sum, line) => sum + line.credit,
    0n
  );

  if (
    totalDebit === 0n ||
    totalDebit !== totalCredit
  ) {
    redirect(`${PAGE}?result=unbalanced`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    // Establish a consistent lock order.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    const [years] = await conn.execute<RowDataPacket[]>(
      `SELECT id,DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
     DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on,
     status
       FROM acct_financial_years
       WHERE id = ?
         AND legal_business_id = ?
       LIMIT 1`,
      [financialYearId, businessId]
    );

    const [periods] = await conn.execute<RowDataPacket[]>(
      `SELECT
         id,
         fiscal_year_label,
         DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
         status
       FROM acct_accounting_periods
       WHERE id = ?
         AND legal_business_id = ?
       FOR UPDATE`,
      [accountingPeriodId, businessId]
    );

    if (!business.length || !years.length || !periods.length) {
      outcome = "not-found";
    } else {
      const period = periods[0];

      const fy = years[0];

      if (
        entryDate < fy.starts_on ||
        entryDate > fy.ends_on ||
        entryDate < period.start_date ||
        entryDate > period.end_date ||
        period.start_date < fy.starts_on ||
        period.end_date > fy.ends_on
      ) {
        outcome = "period-date-mismatch";
      } else if (period.status === "CLOSED") {
        outcome = "closed";
      } else {
        const accountIds = [
          ...new Set(lines.map((line) => line.accountId)),
        ];

        const placeholders = accountIds
          .map(() => "?").join(",");

        const [accounts] = await conn.query<RowDataPacket[]>(
          `SELECT
             id,
             account_type,
             account_subtype,
             normal_balance,
             is_posting_account,
             status,
             requires_division,
             requires_branch
           FROM acct_chart_of_accounts
           WHERE legal_business_id = ?
             AND id IN (${placeholders})
           FOR UPDATE`,
          [businessId, ...accountIds]
        );

        const accountMap = new Map(
          accounts.map((account) => [
            Number(account.id),
            account,
          ])
        );

        let valid = true;

        for (const line of lines) {
          const account = accountMap.get(line.accountId);

          if (
            !account ||
            account.status !== "ACTIVE" ||
            Number(account.is_posting_account) !== 1 ||
            (Number(account.requires_division) === 1 &&
              line.divisionId === null) ||
            (Number(account.requires_branch) === 1 &&
              line.branchId === null)
          ) {
            valid = false;
            break;
          }
        }

        if (!valid) {
          outcome = "invalid-account";
        } else {
          const divisionIds = [
            ...new Set(
              lines.flatMap((line) =>
                line.divisionId === null
                  ? []
                  : [line.divisionId]
              )
            ),
          ];

          const branchIds = [
            ...new Set(
              lines.flatMap((line) =>
                line.branchId === null
                  ? []
                  : [line.branchId]
              )
            ),
          ];

          const divisionMap = new Map<number, boolean>();
          const branchMap = new Map<number, number>();

          if (divisionIds.length > 0) {
            const [divisions] =
              await conn.query<RowDataPacket[]>(
                `SELECT id
                 FROM acct_divisions
                 WHERE legal_business_id = ?
                   AND id IN (
                     ${divisionIds.map(() => "?").join(",")}
                   )`,
                [businessId, ...divisionIds]
              );

            for (const division of divisions) {
              divisionMap.set(Number(division.id), true);
            }
          }

          if (branchIds.length > 0) {
            const [branches] =
              await conn.query<RowDataPacket[]>(
                `SELECT id, division_id
                 FROM acct_branches
                 WHERE legal_business_id = ?
                   AND status = 'ACTIVE'
                   AND id IN (
                     ${branchIds.map(() => "?").join(",")}
                   )`,
                [businessId, ...branchIds]
              );

            for (const branch of branches) {
              branchMap.set(
                Number(branch.id),
                Number(branch.division_id)
              );
            }
          }

          valid = lines.every((line) => {
            if (
              line.divisionId !== null &&
              !divisionMap.has(line.divisionId)
            ) {
              return false;
            }

            if (line.branchId !== null) {
              return (
                branchMap.get(line.branchId) ===
                line.divisionId
              );
            }

            return true;
          });

          if (!valid) {
            outcome = "invalid-dimension";
          } else {
            // Draft reference is separate from future
            // posted sequential journal numbers.
            const draftNumber =
              "D-" + randomBytes(16).toString("hex");

            const [inserted] =
              await conn.execute<ResultSetHeader>(
                `INSERT INTO acct_journal_entries
                 (
                   legal_business_id,
                   financial_year_id,
                   accounting_period_id,
                   journal_no,
                   entry_date,
                   description,
                   status,
                   created_by
                 )
                 VALUES (
                   ?, ?, ?, ?, ?, ?,
                   'DRAFT', ?
                 )`,
                [
                  businessId,
                  financialYearId,
                  accountingPeriodId,
                  draftNumber,
                  entryDate,
                  description,
                  user.id,
                ]
              );

            for (const [index, line] of lines.entries()) {
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
                  inserted.insertId,
                  businessId,
                  index + 1,
                  line.accountId,
                  line.divisionId,
                  line.branchId,
                  line.description,
                  toMoney(line.debit),
                  toMoney(line.credit),
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
                "DRAFT_JOURNAL_CREATED",
                "JOURNAL",
                inserted.insertId,
                JSON.stringify({
                  journal_no: draftNumber,
                  financial_year_id: financialYearId,
                  accounting_period_id: accountingPeriodId,
                  entry_date: entryDate,
                  line_count: lines.length,
                  total_debit: toMoney(totalDebit),
                  total_credit: toMoney(totalCredit),
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
    console.error("Draft journal creation failed:", error);
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(PAGE);
  }

  redirect(`${PAGE}?result=${outcome}`);
}
