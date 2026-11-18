"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { DAY_STATUSES } from "@/lib/attendance";

const PAGE = "/accounting/attendance";
const text = (f: FormData, n: string) => String(f.get(n) ?? "").trim();
const go = (params: Record<string, string>): never => redirect(`${PAGE}?${new URLSearchParams(params).toString()}`);

/** Mark one day for one person by hand (present, half day, absent, leave, weekly off, holiday), with times if known. */
export async function markAttendanceAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const month = text(form, "month");
  const employeeId = Number(text(form, "employee_id"));
  const date = text(form, "work_date");
  const status = text(form, "status");
  const inTime = text(form, "in_time");
  const outTime = text(form, "out_time");
  const back = { month };
  if (!Number.isInteger(employeeId) || employeeId <= 0) go({ ...back, error: "Choose the person." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) go({ ...back, error: "Choose the date." });
  if (status !== "CLEAR" && !DAY_STATUSES.some((s) => s.key === status)) go({ ...back, error: "Choose how the day is marked." });
  const time = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : null);
  if ((inTime && !time(inTime)) || (outTime && !time(outTime))) go({ ...back, error: "Times look like 10:00." });
  try {
    if (status === "CLEAR") {
      await db.execute(`DELETE FROM acct_attendance WHERE legal_business_id = ? AND employee_id = ? AND work_date = ?`, [user.legal_business_id, employeeId, date]);
    } else {
      await db.execute(
        `INSERT INTO acct_attendance (legal_business_id, employee_id, work_date, in_time, out_time, status, source, note, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)
         ON DUPLICATE KEY UPDATE in_time = COALESCE(VALUES(in_time), in_time), out_time = COALESCE(VALUES(out_time), out_time),
                                 status = VALUES(status), note = VALUES(note), updated_by = VALUES(updated_by)`,
        [user.legal_business_id, employeeId, date, time(inTime), time(outTime), status, text(form, "note").slice(0, 200) || null, user.id]
      );
    }
  } catch (error) {
    if (isMissingTable(error)) go({ ...back, error: "Run migration 091 in phpMyAdmin first." });
    throw error;
  }
  revalidatePath(PAGE);
  go({ ...back, saved: "Saved." });
}

/** Mark a weekday as weekly off for everyone for the whole month (e.g. every Tuesday), without touching marked days. */
export async function markWeeklyOffAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const month = text(form, "month");
  const weekday = Number(text(form, "weekday"));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) go({ month, error: "Choose the day of the week." });
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= last; d++) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === weekday) dates.push(`${month}-${String(d).padStart(2, "0")}`);
  try {
    for (const date of dates) {
      await db.execute(
        `INSERT IGNORE INTO acct_attendance (legal_business_id, employee_id, work_date, status, source, updated_by)
         SELECT legal_business_id, id, ?, 'WEEKLY_OFF', 'MANUAL', ? FROM acct_employees
          WHERE legal_business_id = ? AND status = 'ACTIVE' AND employment_type <> 'DAILY_WAGE'`,
        [date, user.id, user.legal_business_id]
      );
    }
  } catch (error) {
    if (isMissingTable(error)) go({ month, error: "Run migration 091 in phpMyAdmin first." });
    throw error;
  }
  revalidatePath(PAGE);
  go({ month, saved: `Weekly off marked on ${dates.length} days for monthly staff.` });
}
