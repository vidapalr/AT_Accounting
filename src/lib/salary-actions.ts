"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";
import { isMissingColumn } from "@/lib/db-errors";
import { ensureEmployeeCode } from "@/lib/employee-code";

const PAGE = "/accounting/salaries";
const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const money = /^\d{1,9}(\.\d{1,2})?$/;
// Paying salaries is done on the Payroll page (payroll-actions.ts).

function go(month: string, kind: "saved" | "error", message: string): never {
  redirect(`${PAGE}?month=${month}&${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

export async function addEmployeeAction(formData: FormData) {
  const user = await requireAccess("salary");
  const text = (n: string) => String(formData.get(n) ?? "").trim();
  const month = isMonth(text("month")) ? text("month") : todayIso().slice(0, 7);
  const name = text("full_name");
  const title = text("job_title").slice(0, 100);
  const type = ["FULL_TIME", "PART_TIME", "DAILY_WAGE", "HOURLY"].includes(text("employment_type")) ? text("employment_type") : "FULL_TIME";
  const monthly = type === "FULL_TIME" || type === "PART_TIME";
  const wage = text("daily_wage").replaceAll(",", "");
  const rate = text("hourly_rate").replaceAll(",", "");
  // Daily-wage and hourly people have no monthly salary: their pay comes from the wage and the attendance register.
  const salary = monthly ? text("monthly_salary").replaceAll(",", "") : "0";
  const wa = text("whatsapp_number").replace(/\D/g, "").slice(-10);
  const phoneRaw = text("phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const branchId = Number(text("branch_id")) || null;
  const joined = /^\d{4}-\d{2}-\d{2}$/.test(text("joined_on")) ? text("joined_on") : null;
  if (name.length < 2 || name.length > 150) go(month, "error", "Write the person's name.");
  if (monthly && (!money.test(salary) || Number(salary) <= 0)) go(month, "error", "Type the monthly salary in rupees.");
  if (type === "DAILY_WAGE" && (!money.test(wage) || Number(wage) <= 0)) go(month, "error", "Type the wage for one day in rupees.");
  if (type === "HOURLY" && (!money.test(rate) || Number(rate) <= 0)) go(month, "error", "Type the rate for one hour in rupees.");
  if (wa && wa.length !== 10) go(month, "error", "The WhatsApp number must be 10 digits.");
  if (phoneRaw && phone === null) go(month, "error", "That mobile number does not look right (10 digits).");

  let divisionId: number | null = null;
  if (branchId) {
    const [b] = await db.execute<RowDataPacket[]>(
      `SELECT division_id FROM acct_branches WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
      [user.legal_business_id, branchId]
    );
    if (b.length !== 1) go(month, "error", "Choose a branch from the list.");
    divisionId = Number(b[0].division_id);
  }
  if (wa) {
    const [clash] = await db.query<RowDataPacket[]>(
      `SELECT full_name FROM acct_employees WHERE legal_business_id = ? AND whatsapp_number = ? AND status = 'ACTIVE' LIMIT 1`,
      [user.legal_business_id, wa]
    ).catch(() => [[] as RowDataPacket[]]);
    if (clash.length) go(month, "error", `That WhatsApp number is already saved for ${clash[0].full_name}.`);
  }
  const base = [user.legal_business_id, divisionId, branchId, name, phone, title || null, salary, joined, user.id];
  let saved: ResultSetHeader;
  try {
    [saved] = await db.execute<ResultSetHeader>(
      `INSERT INTO acct_employees (legal_business_id, division_id, branch_id, full_name, phone, job_title, monthly_salary, joined_on, created_by,
                                   employment_type, daily_wage, hourly_rate, whatsapp_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...base, type, wage || null, rate || null, wa || null]
    );
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    if (!monthly) go(month, "error", "Run migrations 091 and 092 in phpMyAdmin to add daily-wage and hourly staff.");
    [saved] = await db.execute<ResultSetHeader>(
      `INSERT INTO acct_employees (legal_business_id, division_id, branch_id, full_name, phone, job_title, monthly_salary, joined_on, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      base
    );
  }
  if (monthly) {
    try {
      await db.execute(
        `INSERT INTO acct_employee_pay_history (legal_business_id, employee_id, effective_from, monthly_salary, note, changed_by)
         VALUES (?, ?, ?, ?, 'Starting salary', ?)`,
        [user.legal_business_id, saved.insertId, joined ?? todayIso(), salary, user.id]
      );
    } catch { /* migration 062 not run yet */ }
  }
  await ensureEmployeeCode(db, user.legal_business_id, saved.insertId);
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'EMPLOYEE_ADDED', 'EMPLOYEE', ?, ?)`,
    [user.legal_business_id, user.id, saved.insertId, JSON.stringify({ salary, type, wage: wage || null, rate: rate || null })]
  );
  revalidatePath(PAGE);
  // Straight to the person's record: the cost to company is worked out there, and it says which
  // papers to take (Aadhaar, PAN) and which letter to make.
  redirect(`${PAGE}/${saved.insertId}?saved=${encodeURIComponent(`${name} added. Take their Aadhaar and PAN, and make the letter.`)}`);
}

/** Change a salary (from the next payment) or mark the person as having left. */
export async function updateEmployeeAction(formData: FormData) {
  const user = await requireAccess("salary");
  const text = (n: string) => String(formData.get(n) ?? "").trim();
  const month = isMonth(text("month")) ? text("month") : todayIso().slice(0, 7);
  const id = Number(text("employee_id"));
  const what = text("what");
  if (!Number.isInteger(id) || id <= 0) go(month, "error", "Choose a person.");
  if (what === "LEFT") {
    await db.execute(`UPDATE acct_employees SET status = 'LEFT' WHERE id = ? AND legal_business_id = ?`, [id, user.legal_business_id]);
    try {
      await db.execute(`UPDATE acct_employees SET left_on = COALESCE(left_on, ?) WHERE id = ? AND legal_business_id = ?`, [todayIso(), id, user.legal_business_id]);
    } catch { /* migration 062 not run yet */ }
    await db.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'EMPLOYEE_LEFT', 'EMPLOYEE', ?, '{}')`,
      [user.legal_business_id, user.id, id]
    );
    revalidatePath(PAGE);
    go(month, "saved", "Marked as left. Earlier payments stay in the books.");
  }
  const salary = text("monthly_salary").replaceAll(",", "");
  if (!money.test(salary) || Number(salary) <= 0) go(month, "error", "Type the new monthly salary in rupees.");
  await db.execute(`UPDATE acct_employees SET monthly_salary = ? WHERE id = ? AND legal_business_id = ?`, [salary, id, user.legal_business_id]);
  try {
    await db.execute(
      `INSERT INTO acct_employee_pay_history (legal_business_id, employee_id, effective_from, monthly_salary, note, changed_by)
       VALUES (?, ?, ?, ?, 'Changed on the Salaries page', ?)`,
      [user.legal_business_id, id, todayIso(), salary, user.id]
    );
  } catch { /* migration 062 not run yet */ }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'EMPLOYEE_SALARY_CHANGED', 'EMPLOYEE', ?, ?)`,
    [user.legal_business_id, user.id, id, JSON.stringify({ salary })]
  );
  revalidatePath(PAGE);
  go(month, "saved", "Salary changed. It applies from the next payment.");
}

/** Employee's contact and job details used on letters: email, home address, department, reporting to. */
export async function saveStaffDetailsAction(formData: FormData) {
  const user = await requireAccess("salary");
  const text = (n: string) => String(formData.get(n) ?? "").trim();
  const id = Number(text("employee_id"));
  const back = `${PAGE}/${id}`;
  const say = (kind: "saved" | "error", m: string): never => redirect(`${back}?${kind}=${encodeURIComponent(m)}#details`);
  if (!Number.isInteger(id) || id <= 0) redirect(PAGE);
  const email = text("email").toLowerCase().slice(0, 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) say("error", "That email address does not look right.");
  try {
    const [r] = await db.execute<ResultSetHeader>(
      `UPDATE acct_employees SET email = ?, home_address = ?, department = ?, reports_to = ?
        WHERE legal_business_id = ? AND id = ?`,
      [email || null, text("home_address").slice(0, 300) || null, text("department").slice(0, 100) || null,
       text("reports_to").slice(0, 150) || null, user.legal_business_id, id]
    );
    if (r.affectedRows !== 1) redirect(PAGE);
  } catch (error) {
    if (isMissingColumn(error)) say("error", "Run migration 095 in phpMyAdmin first.");
    throw error;
  }
  await ensureEmployeeCode(db, user.legal_business_id, id);
  revalidatePath(back);
  say("saved", "Details saved. They appear on the offer and joining letters.");
}
