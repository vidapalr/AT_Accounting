
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/periods";

type PeriodStatus =
  | "NOT_OPENED"
  | "OPEN"
  | "SOFT_CLOSED"
  | "CLOSED";

type Operation =
  | "OPEN"
  | "SOFT_CLOSE"
  | "FINAL_CLOSE"
  | "REOPEN";

const transitions: Record<
  Operation,
  { from: PeriodStatus; to: PeriodStatus }
> = {
  OPEN: {
    from: "NOT_OPENED",
    to: "OPEN",
  },
  SOFT_CLOSE: {
    from: "OPEN",
    to: "SOFT_CLOSED",
  },
  FINAL_CLOSE: {
    from: "SOFT_CLOSED",
    to: "CLOSED",
  },
  REOPEN: {
    from: "SOFT_CLOSED",
    to: "OPEN",
  },
};

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseId(input: string): number | null {
  if (!/^[1-9]\d*$/.test(input)) return null;
  const parsed = Number(input);

  return Number.isSafeInteger(parsed)
    ? parsed
    : null;
}

export async function changeAccountingPeriodStatusAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const periodId = parseId(field(form, "period_id"));
  const operation = field(form, "operation") as Operation;
  const reason = field(form, "reason");

  if (
    periodId === null ||
    !Object.prototype.hasOwnProperty.call(
      transitions, operation
    ) ||
    reason.length < 10 ||
    reason.length > 1000
  ) {
    redirect(`${PAGE}?status_result=invalid`);
  }

  const transition = transitions[operation];

  const conn = await db.getConnection();
  let outcome = "failed";
  let year = "";

  try {
    await conn.beginTransaction();

    // Lock the legal business first, maintaining
    // the same lock order as other financial actions.
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
      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT
           id,
           fiscal_year_label,
           period_no,
           start_date,
           end_date,
           status
         FROM acct_accounting_periods
         WHERE id = ?
           AND legal_business_id = ?
         FOR UPDATE`,
        [periodId, businessId]
      );

      const period = rows[0];

      if (!period) {
        outcome = "not-found";
      } else {
        year = period.fiscal_year_label;

        if (period.status !== transition.from) {
          outcome = "invalid-transition";
        } else {
          // Do not allow final closure while another
          // earlier period in the same FY remains
          // neither soft-closed nor fully closed.
          if (operation === "FINAL_CLOSE") {
            const [earlier] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_accounting_periods
                 WHERE legal_business_id = ?
                   AND fiscal_year_label = ?
                   AND period_no < ?
                   AND status <> 'CLOSED'
                 LIMIT 1`,
                [businessId, year, period.period_no]
              );

            if (earlier.length > 0) {
              outcome = "earlier-not-closed";
            }
          }

          if (outcome !== "earlier-not-closed") {
            const updates: Record<
              Operation,
              string
            > = {
              OPEN:
                `opened_by = ?,
                 opened_at = CURRENT_TIMESTAMP`,
              SOFT_CLOSE:
                `soft_closed_by = ?,
                 soft_closed_at = CURRENT_TIMESTAMP`,
              FINAL_CLOSE:
                `closed_by = ?,
                 closed_at = CURRENT_TIMESTAMP`,
              REOPEN:
                `opened_by = ?,
                 opened_at = CURRENT_TIMESTAMP`,
            };

            await conn.execute(
              `UPDATE acct_accounting_periods
               SET status = ?,
                   status_reason = ?,
                   ${updates[operation]}
               WHERE id = ?
                 AND legal_business_id = ?`,
              [
                transition.to,
                reason,
                user.id,
                periodId,
                businessId,
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
                "ACCOUNTING_PERIOD_STATUS_CHANGED",
                "ACCOUNTING_PERIOD",
                periodId,
                JSON.stringify({
                  operation,
                  previous_status: period.status,
                  new_status: transition.to,
                  fiscal_year_label: year,
                  period_no: period.period_no,
                  reason,
                }),
              ]
            );

            await conn.commit();
            outcome = "updated";
          }
        }
      }
    }

    if (outcome !== "updated") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error(
      "Accounting period status change failed:",
      error
    );
  } finally {
    conn.release();
  }

  if (outcome === "updated") {
    revalidatePath(PAGE);
  }

  const params = new URLSearchParams({
    status_result: outcome,
  });

  if (year) {
    params.set("year", year);
  }

  redirect(`${PAGE}?${params.toString()}`);
}
