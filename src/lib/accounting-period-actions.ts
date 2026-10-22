
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/periods";

function value(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function yearLabel(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function dateText(
  year: number,
  month: number,
  day: number
): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function generatePeriods(startYear: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = 3 + index;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const endDay = new Date(
      Date.UTC(year, month, 0)
    ).getUTCDate();

    const monthName = new Intl.DateTimeFormat(
      "en-GB",
      { month: "long", timeZone: "UTC" }
    ).format(new Date(Date.UTC(year, month - 1, 1)));

    return {
      periodNo: index + 1,
      periodName: `${monthName} ${year}`,
      start: dateText(year, month, 1),
      end: dateText(year, month, endDay),
    };
  });
}

export async function createAccountingPeriodsAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const yearText = value(form, "start_year");

  if (!/^\d{4}$/.test(yearText)) {
    redirect(`${PAGE}?result=invalid-year`);
  }

  const startYear = Number(yearText);

  if (startYear < 2000 || startYear > 2098) {
    redirect(`${PAGE}?result=invalid-year`);
  }

  const label = yearLabel(startYear);
  const months = generatePeriods(startYear);

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [user.legal_business_id]
    );

    if (!business.length) {
      result = "not-found";
    } else {
      const [existing] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_accounting_periods
         WHERE legal_business_id = ?
           AND (
             fiscal_year_label = ?
             OR (
               start_date <= ?
               AND end_date >= ?
             )
           )
         LIMIT 1`,
        [
          user.legal_business_id,
          label,
          months[11].end,
          months[0].start,
        ]
      );

      if (existing.length > 0) {
        result = "already-exists";
      } else {
        for (const period of months) {
          await conn.execute<ResultSetHeader>(
            `INSERT INTO acct_accounting_periods
             (
               legal_business_id,
               fiscal_year_label,
               period_no,
               period_name,
               start_date,
               end_date,
               status,
               created_by
             )
             VALUES (
               ?, ?, ?, ?, ?, ?,
               'NOT_OPENED', ?
             )`,
            [
              user.legal_business_id,
              label,
              period.periodNo,
              period.periodName,
              period.start,
              period.end,
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
            user.legal_business_id,
            user.id,
            "ACCOUNTING_PERIODS_CREATED",
            "ACCOUNTING_YEAR",
            startYear,
            JSON.stringify({
              fiscal_year_label: label,
              start_date: months[0].start,
              end_date: months[11].end,
              periods_created: 12,
              initial_status: "NOT_OPENED",
            }),
          ]
        );

        await conn.commit();
        result = "created";
      }
    }

    if (result !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error(
      "Accounting period creation failed:",
      error
    );
  } finally {
    conn.release();
  }

  if (result === "created") {
    revalidatePath(PAGE);
  }

  redirect(`${PAGE}?result=${result}`);
}
