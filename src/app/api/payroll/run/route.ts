import { timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { preparePayslips } from "@/lib/payroll/data";
import { todayInIndia } from "@/lib/reports/money";
import { allBusinessIds } from "@/lib/tenant";

/**
 * The monthly payroll job. It works out everyone's pay slip for a month from the attendance register,
 * for every company, and leaves them as drafts to check and pay. Nothing is paid and nothing posts to
 * the books: that still needs someone to press Pay on the Payroll screen.
 *
 * Set it up on the hosting service to run on the 1st of every month:
 *   curl -s "https://<site>/api/payroll/run?secret=<CRON_SECRET>"
 * Add &month=YYYY-MM to work out a particular month (the default is the month just finished).
 */
function authorised(request: Request, url: URL): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || expected.length < 16) return false;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const given = header || url.searchParams.get("secret") || "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The month just finished, in India time. */
function lastMonth(today: string): string {
  const [y, m] = today.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  if (!authorised(request, url)) return new Response("Forbidden", { status: 403 });

  const asked = url.searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : lastMonth(todayInIndia());

  const results: Record<number, { payslips: number } | { error: string }> = {};
  for (const businessId of await allBusinessIds()) {
    try {
      // userId 0: worked out by the job, not by a person.
      const payslips = await preparePayslips(businessId, month, 0);
      results[businessId] = { payslips };
      await db
        .execute(
          `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
           VALUES (?, 'payroll_last_run', ?, NULL) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [businessId, `${new Date().toISOString()}|${month}|${payslips}`]
        )
        .catch((error) => console.error("Could not note the payroll run", error));
    } catch (error) {
      console.error("Monthly payroll job failed", businessId, month, error);
      results[businessId] = { error: "failed" };
    }
  }
  return Response.json({ month, results });
}

export const POST = handle;
export const GET = handle;
