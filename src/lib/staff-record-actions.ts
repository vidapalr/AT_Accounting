"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const money = /^\d{1,9}(\.\d{1,2})?$/;
const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function back(id: number, kind: "saved" | "error", text: string): never {
  redirect(`/accounting/salaries/${id}?${kind}=${encodeURIComponent(text.slice(0, 220))}`);
}

async function ownEmployee(businessId: number, id: number) {
  const [r] = await db.execute<RowDataPacket[]>(
    `SELECT id, monthly_salary FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [businessId, id]);
  return r[0];
}

/** Joined, notice given and last working day. Leaving the last day marks the person as left. */
export async function saveStaffDatesAction(formData: FormData) {
  const user = await requireAccess("salary");
  const id = Number(formData.get("employee_id"));
  const get = (n: string) => String(formData.get(n) ?? "").trim();
  if (!(await ownEmployee(user.legal_business_id, id))) return back(id, "error", "Person not found.");
  const joined = get("joined_on"), notice = get("notice_given_on"), left = get("left_on");
  for (const v of [joined, notice, left]) if (v && !dateOk(v)) return back(id, "error", "One of the dates does not look right.");
  if (joined && left && left < joined) return back(id, "error", "The last working day cannot be before the joining day.");
  if (notice && left && left < notice) return back(id, "error", "The last working day cannot be before the day notice was given.");
  await db.execute(
    `UPDATE acct_employees
        SET joined_on = ?, notice_given_on = ?, left_on = ?, status = ?
      WHERE legal_business_id = ? AND id = ?`,
    [joined || null, notice || null, left || null, left && left <= todayIso() ? "LEFT" : "ACTIVE", user.legal_business_id, id]
  );
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'EMPLOYEE_DATES_CHANGED', 'EMPLOYEE', ?, ?)`,
    [user.legal_business_id, user.id, id, JSON.stringify({ joined, notice, left })]
  );
  revalidatePath(`/accounting/salaries/${id}`);
  return back(id, "saved", "Dates saved.");
}

/** A pay change kept with its date. The current salary becomes the latest change that has started. */
export async function addPayChangeAction(formData: FormData) {
  const user = await requireAccess("salary");
  const id = Number(formData.get("employee_id"));
  const get = (n: string) => String(formData.get(n) ?? "").trim();
  if (!(await ownEmployee(user.legal_business_id, id))) return back(id, "error", "Person not found.");
  const salary = get("monthly_salary").replaceAll(",", "");
  const from = get("effective_from");
  if (!money.test(salary) || Number(salary) <= 0) return back(id, "error", "Type the new monthly salary in rupees.");
  if (!dateOk(from)) return back(id, "error", "Choose the date the new salary starts.");
  await db.execute(
    `INSERT INTO acct_employee_pay_history (legal_business_id, employee_id, effective_from, monthly_salary, note, changed_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user.legal_business_id, id, from, salary, get("note").slice(0, 200) || null, user.id]
  );
  // Salary used for payments = the latest change that has already started.
  const [cur] = await db.execute<RowDataPacket[]>(
    `SELECT monthly_salary FROM acct_employee_pay_history
      WHERE legal_business_id = ? AND employee_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC, id DESC LIMIT 1`,
    [user.legal_business_id, id, todayIso()]
  );
  if (cur[0]) {
    await db.execute(`UPDATE acct_employees SET monthly_salary = ? WHERE legal_business_id = ? AND id = ?`,
      [cur[0].monthly_salary, user.legal_business_id, id]);
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'EMPLOYEE_SALARY_CHANGED', 'EMPLOYEE', ?, ?)`,
    [user.legal_business_id, user.id, id, JSON.stringify({ salary, from })]
  );
  revalidatePath(`/accounting/salaries/${id}`);
  revalidatePath("/accounting/salaries");
  return back(id, "saved", from > todayIso() ? "Saved. The new salary starts on the date you chose." : "Salary change saved.");
}
