"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";
import { QuickExpenseError, recordQuickExpense } from "@/lib/expense-quick";
import { spreadOldestFirst } from "@/lib/setoff-math";

const PAGE = "/accounting/salaries";
const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const money = /^\d{1,9}(\.\d{1,2})?$/;

function go(month: string, kind: "saved" | "error", message: string): never {
  redirect(`${PAGE}?month=${month}&${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const rethrowRedirect = (error: unknown) => {
  if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
};

export async function addEmployeeAction(formData: FormData) {
  const user = await requireAccess("salary");
  const text = (n: string) => String(formData.get(n) ?? "").trim();
  const month = isMonth(text("month")) ? text("month") : todayIso().slice(0, 7);
  const name = text("full_name");
  const title = text("job_title").slice(0, 100);
  const salary = text("monthly_salary").replaceAll(",", "");
  const phoneRaw = text("phone");
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  const branchId = Number(text("branch_id")) || null;
  const joined = /^\d{4}-\d{2}-\d{2}$/.test(text("joined_on")) ? text("joined_on") : null;
  if (name.length < 2 || name.length > 150) go(month, "error", "Write the person's name.");
  if (!money.test(salary) || Number(salary) <= 0) go(month, "error", "Type the monthly salary in rupees.");
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
  const [saved] = await db.execute<ResultSetHeader>(
    `INSERT INTO acct_employees (legal_business_id, division_id, branch_id, full_name, phone, job_title, monthly_salary, joined_on, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [user.legal_business_id, divisionId, branchId, name, phone, title || null, salary, joined, user.id]
  );
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'EMPLOYEE_ADDED', 'EMPLOYEE', ?, ?)`,
    [user.legal_business_id, user.id, saved.insertId, JSON.stringify({ salary })]
  );
  revalidatePath(PAGE);
  go(month, "saved", `${name} added.`);
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
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'EMPLOYEE_SALARY_CHANGED', 'EMPLOYEE', ?, ?)`,
    [user.legal_business_id, user.id, id, JSON.stringify({ salary })]
  );
  revalidatePath(PAGE);
  go(month, "saved", "Salary changed. It applies from the next payment.");
}

/** Pays one person for one month. Saved as a SALARY expense with its payment. */
export async function paySalaryAction(formData: FormData) {
  const user = await requireAccess("salary");
  const businessId = user.legal_business_id;
  const text = (n: string) => String(formData.get(n) ?? "").trim();
  const month = text("month");
  if (!isMonth(month)) redirect(PAGE);
  const id = Number(text("employee_id"));
  const amount = text("amount").replaceAll(",", "");
  const note = text("note").slice(0, 300);
  const deductText = text("deduct").replaceAll(",", "");
  if (deductText !== "" && !money.test(deductText)) go(month, "error", "Type the advance to take off in rupees, or leave it empty.");
  const toPaise = (v: string) => { const [w, f = ""] = v.split("."); return BigInt(w || "0") * 100n + BigInt(f.padEnd(2, "0") || "0"); };
  const rupeesOf = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
  const account = /^(CASH|BANK):([1-9]\d*)$/.exec(text("account"));
  const how = text("how");
  if (!Number.isInteger(id) || id <= 0) go(month, "error", "Choose a person.");
  if (!money.test(amount) || Number(amount) <= 0) go(month, "error", "Type the amount to pay.");
  if (!account) go(month, "error", "Choose where the money is paid from.");
  const [, kind, accountId] = account;
  const allowed = kind === "CASH" ? ["CASH"] : ["UPI", "BANK_TRANSFER", "CHEQUE"];
  if (!allowed.includes(how)) go(month, "error", kind === "CASH" ? "A cash drawer pays in cash." : "A bank pays by UPI, bank transfer or cheque.");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [emps] = await conn.execute<RowDataPacket[]>(
      `SELECT id, full_name, division_id, branch_id FROM acct_employees
       WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [businessId, id]
    );
    if (emps.length !== 1) throw new QuickExpenseError("That person is not on the active list.");
    const emp = emps[0];
    const [already] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_salary_payments WHERE legal_business_id = ? AND employee_id = ? AND salary_month = ?`,
      [businessId, id, month]
    );
    if (already.length > 0) throw new QuickExpenseError(`${emp.full_name} has already been paid for this month.`);

    // Advances given earlier, oldest first, with what is still to be taken back.
    const [adv] = await conn.execute<RowDataPacket[]>(
      `SELECT a.id, DATE_FORMAT(a.given_on, '%Y-%m-%d') AS d, ROUND(a.amount * 100) - COALESCE((SELECT SUM(ROUND(r.amount * 100)) FROM acct_staff_advance_recoveries r WHERE r.advance_id = a.id), 0) AS left_paise
         FROM acct_staff_advances a WHERE a.legal_business_id = ? AND a.employee_id = ? ORDER BY a.given_on, a.id FOR UPDATE`,
      [businessId, id]
    );
    const open = adv.map((a) => ({ id: Number(a.id), date: String(a.d), due: BigInt(a.left_paise) })).filter((a) => a.due > 0n);
    const owed = open.reduce((t, a) => t + a.due, 0n);
    const gross = toPaise(amount);
    const deduct = deductText === "" ? 0n : toPaise(deductText);
    if (deduct > owed) throw new QuickExpenseError(`${emp.full_name} owes only ₹${rupeesOf(owed)} of advance.`);
    if (deduct > gross) throw new QuickExpenseError("The advance taken off cannot be more than the salary.");
    const cashPart = gross - deduct;

    const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    const saved = await recordQuickExpense(conn, {
      businessId,
      userId: user.id,
      date: todayIso(),
      category: "SALARY",
      description: `Salary ${label}: ${emp.full_name}`,
      amount,
      payAmount: rupeesOf(cashPart),
      remarks: note || undefined,
      divisionId: emp.division_id === null ? null : Number(emp.division_id),
      branchId: emp.branch_id === null ? null : Number(emp.branch_id),
      pay: {
        source: kind === "CASH" ? "BUSINESS_CASH" : "BUSINESS_BANK",
        accountId: Number(accountId),
        method: how as "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE",
      },
    });
    const [salaryRow] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_salary_payments (legal_business_id, employee_id, salary_month, amount, advance_deducted, note, expense_id, paid_on, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, id, month, amount, rupeesOf(deduct), note || null, saved.id, todayIso(), user.id]
    );
    void salaryRow;
    if (deduct > 0n) {
      // The part of the salary that clears advances: no cash or bank moves.
      const [clearing] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_expense_payments
           (legal_business_id, division_id, expense_id, payment_date, payment_method, payment_source, amount, remarks, status, created_by)
         VALUES (?, ?, ?, ?, 'ADVANCE', 'BUSINESS_CASH', ?, 'Taken off salary against advance', 'RECORDED', ?)`,
        [businessId, emp.division_id === null ? null : Number(emp.division_id), saved.id, todayIso(), rupeesOf(deduct), user.id]
      );
      for (const share of spreadOldestFirst(open, deduct) ?? []) {
        await conn.execute(
          `INSERT INTO acct_staff_advance_recoveries (advance_id, employee_id, expense_payment_id, amount, recovered_on) VALUES (?, ?, ?, ?, ?)`,
          [share.id, id, clearing.insertId, rupeesOf(share.amount), todayIso()]
        );
      }
    }
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'SALARY_PAID', 'EMPLOYEE', ?, ?)`,
      [businessId, user.id, id, JSON.stringify({ month, amount, advanceTakenOff: rupeesOf(deduct), expense: saved.expenseNo })]
    );
    await conn.commit();
    revalidatePath(PAGE);
    revalidatePath("/accounting/cash-closing");
    go(month, "saved", `${emp.full_name}: ₹${Number(amount).toLocaleString("en-IN")} salary done (${saved.expenseNo})` + (deduct > 0n ? `, of which ₹${Number(rupeesOf(deduct)).toLocaleString("en-IN")} taken off the advance.` : "."));
  } catch (error) {
    await conn.rollback().catch(() => {});
    rethrowRedirect(error);
    if (error instanceof QuickExpenseError) go(month, "error", error.message);
    if ((error as { code?: string; message?: string }).code === "ER_DUP_ENTRY" && /uq_salary_employee_month/.test(String((error as Error).message))) go(month, "error", "That person has already been paid for this month.");
    console.error("Salary payment failed:", error);
    go(month, "error", "The payment could not be saved. Nothing was changed.");
  } finally {
    conn.release();
  }
}
