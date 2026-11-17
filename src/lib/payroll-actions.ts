"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { QuickExpenseError, recordExpensePayment, recordQuickExpense } from "@/lib/expense-quick";
import { takeBackAdvance } from "@/lib/staff-advance-recovery";
import { saveBusinessSettings } from "@/lib/business-settings";
import { todayInIndia } from "@/lib/format";
import { advanceOwed, buildPayslip, loadComponents, loadPayrollSettings, payslipColumns, rupeesText, saveDraftPayslip, toPaise, type EmployeeForPay } from "@/lib/payroll/data";
import { parsePtSlabs, PT_PRESETS } from "@/lib/payroll/rules";

const RUN = "/accounting/payroll";
const DUES = "/accounting/payroll/dues";
const SETTINGS = "/accounting/payroll/settings";
type Row = RowDataPacket & Record<string, string | number | null>;

const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const text = (f: FormData, n: string) => String(f.get(n) ?? "").trim();
const go = (page: string, params: Record<string, string>): never => redirect(`${page}?${new URLSearchParams(params).toString()}`);
const isRedirect = (e: unknown) => !!e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

async function employeesFor(businessId: number, month: string, onlyId?: number): Promise<EmployeeForPay[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT * FROM acct_employees
      WHERE legal_business_id = ? ${onlyId ? "AND id = ?" : ""}
        AND (status = 'ACTIVE' OR (left_on IS NOT NULL AND left_on >= ?))
        AND (joined_on IS NULL OR joined_on <= LAST_DAY(?))
      ORDER BY full_name`,
    onlyId ? [businessId, onlyId, `${month}-01`, `${month}-01`] : [businessId, `${month}-01`, `${month}-01`]
  );
  return rows as EmployeeForPay[];
}

/** Work out (or refresh) the payslips of everyone for a month. Paid ones are never changed. */
export async function preparePayrollAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const month = text(form, "month");
  if (!isMonth(month)) redirect(RUN);
  const biz = user.legal_business_id;
  const settings = await loadPayrollSettings(biz);
  const components = await loadComponents(biz);
  const [done] = await db.query<Row[]>(
    `SELECT employee_id, status, paid_days, advance_deducted FROM acct_payslips WHERE legal_business_id = ? AND salary_month = ?`,
    [biz, month]
  );
  const existing = new Map(done.map((d) => [Number(d.employee_id), d]));
  const [paidOld] = await db.query<Row[]>(
    `SELECT employee_id FROM acct_salary_payments WHERE legal_business_id = ? AND salary_month = ?`,
    [biz, month]
  );
  const paidBefore = new Set(paidOld.map((r) => Number(r.employee_id)));
  let count = 0;
  for (const e of await employeesFor(biz, month)) {
    const prev = existing.get(Number(e.id));
    if (prev?.status === "PAID" || (paidBefore.has(Number(e.id)) && !prev)) continue;
    const { input, slip } = await buildPayslip(db, biz, e, month, {
      settings, components,
      // Keep the days and advance someone already corrected on a draft.
      ...(prev ? { paidDays: Number(prev.paid_days), advance: toPaise(prev.advance_deducted) } : {}),
    });
    await saveDraftPayslip(db, biz, Number(e.id), month, input, slip, user.id);
    count++;
  }
  revalidatePath(RUN);
  go(RUN, { month, saved: `${count} payslip${count === 1 ? "" : "s"} worked out for ${monthLabel(month)}. Check the days, then pay.` });
}

/** Change the days paid or the advance taken back on one draft payslip. */
export async function updatePayslipAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const biz = user.legal_business_id;
  const id = Number(text(form, "payslip_id"));
  const month = text(form, "month");
  const days = Number(text(form, "paid_days"));
  const advanceText = text(form, "advance").replaceAll(",", "") || "0";
  if (!isMonth(month)) redirect(RUN);
  if (!Number.isFinite(days) || days < 0 || days > 31 || Math.round(days * 2) !== days * 2) go(RUN, { month, error: "Days paid must be a number like 26 or 25.5." });
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(advanceText)) go(RUN, { month, error: "Type the advance to take back in rupees, or 0." });
  const [rows] = await db.query<Row[]>(`SELECT employee_id, status FROM acct_payslips WHERE legal_business_id = ? AND id = ?`, [biz, id]);
  if (!rows[0] || rows[0].status !== "DRAFT") go(RUN, { month, error: "That payslip is already paid or no longer exists." });
  const [e] = await employeesFor(biz, month, Number(rows[0].employee_id));
  if (!e) go(RUN, { month, error: "That person is not on the list for this month." });
  const { input, slip } = await buildPayslip(db, biz, e, month, { paidDays: days, advance: toPaise(advanceText) });
  await saveDraftPayslip(db, biz, Number(e.id), month, input, slip, user.id);
  revalidatePath(RUN);
  go(RUN, { month, saved: `${e.full_name}: payslip updated. Pay ₹${rupeesText(slip.net)}.` });
}

/** Remove a draft payslip (the person will not be paid this month). */
export async function removePayslipDraftAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const month = text(form, "month");
  await db.query(`DELETE FROM acct_payslips WHERE legal_business_id = ? AND id = ? AND status = 'DRAFT'`, [user.legal_business_id, Number(text(form, "payslip_id"))]);
  revalidatePath(RUN);
  go(RUN, { month: isMonth(month) ? month : todayInIndia().slice(0, 7), saved: "Draft removed." });
}

/**
 * Pay one or more draft payslips from one account. For each person, in one transaction:
 *  - a SALARY expense for the gross salary; the net pay is paid now from the account; the advance part
 *    clears advances; PF, ESI, PT and TDS stay owing until they are paid to the government (Statutory dues);
 *  - an EMPLOYER_CONTRIBUTION expense for the employer's PF, pension, EDLI, admin and ESI share (owing);
 *  - the monthly salary record, so earlier pages, letters and pay slips keep working.
 */
export async function payPayslipsAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const biz = user.legal_business_id;
  const month = text(form, "month");
  if (!isMonth(month)) redirect(RUN);
  const ids = form.getAll("payslip_id").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  const account = /^(CASH|BANK):([1-9]\d*)$/.exec(text(form, "account"));
  const how = text(form, "how");
  if (ids.length === 0) go(RUN, { month, error: "Tick at least one person to pay." });
  if (!account) go(RUN, { month, error: "Choose where the money is paid from." });
  const [, kind, accountIdText] = account!;
  const allowed = kind === "CASH" ? ["CASH"] : ["UPI", "BANK_TRANSFER", "CHEQUE"];
  if (!allowed.includes(how)) go(RUN, { month, error: kind === "CASH" ? "A cash drawer pays in cash." : "A bank pays by UPI, bank transfer or cheque." });

  const settings = await loadPayrollSettings(biz);
  const components = await loadComponents(biz);
  const paidNames: string[] = [];
  const problems: string[] = [];

  for (const id of ids) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [ps] = await conn.query<Row[]>(
        `SELECT * FROM acct_payslips WHERE legal_business_id = ? AND id = ? AND salary_month = ? FOR UPDATE`,
        [biz, id, month]
      );
      const p = ps[0];
      if (!p || p.status !== "DRAFT") throw new QuickExpenseError("already paid");
      const [emps] = await conn.query<Row[]>(`SELECT * FROM acct_employees WHERE legal_business_id = ? AND id = ? FOR UPDATE`, [biz, Number(p.employee_id)]);
      const e = emps[0] as EmployeeForPay | undefined;
      if (!e) throw new QuickExpenseError("person not found");
      const [old] = await conn.query<Row[]>(`SELECT id FROM acct_salary_payments WHERE legal_business_id = ? AND employee_id = ? AND salary_month = ?`, [biz, Number(e.id), month]);
      if (old.length) throw new QuickExpenseError(`${e.full_name} was already paid for this month`);

      // Work it out again now, inside the transaction, with the days and advance on the draft.
      const owed = await advanceOwed(conn, biz, Number(e.id));
      const wanted = toPaise(p.advance_deducted);
      const { input, slip } = await buildPayslip(conn, biz, e, month, {
        settings, components, paidDays: Number(p.paid_days), advance: wanted > owed ? owed : wanted,
      });
      if (slip.gross <= 0n) throw new QuickExpenseError(`${e.full_name} has no salary for this month (0 days)`);
      const division = e.division_id === null ? null : Number(e.division_id);
      const branch = e.branch_id === null ? null : Number(e.branch_id);
      const today = todayInIndia();
      const pay = { source: kind === "CASH" ? "BUSINESS_CASH" as const : "BUSINESS_BANK" as const, accountId: Number(accountIdText), method: how as "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE" };

      const salary = await recordQuickExpense(conn, {
        businessId: biz, userId: user.id, date: today, category: "SALARY",
        description: `Salary ${monthLabel(month)}: ${e.full_name}`, payee: String(e.full_name),
        amount: rupeesText(slip.gross), payAmount: rupeesText(slip.net),
        remarks: `Net ${rupeesText(slip.net)}; PF ${rupeesText(slip.employee.pf)}, ESI ${rupeesText(slip.employee.esi)}, PT ${rupeesText(slip.employee.pt)}, TDS ${rupeesText(slip.employee.tds)} owing to government`,
        divisionId: division, branchId: branch, pay,
      });
      await takeBackAdvance(conn, { businessId: biz, employeeId: Number(e.id), expenseId: salary.id, divisionId: division, amount: slip.employee.advance, date: today, userId: user.id });

      let employerExpenseId: number | null = null;
      if (slip.employerCost > 0n) {
        const er = await recordQuickExpense(conn, {
          businessId: biz, userId: user.id, date: today, category: "EMPLOYER_CONTRIBUTION",
          description: `Employer PF and ESI ${monthLabel(month)}: ${e.full_name}`, payee: "Government (PF / ESI)",
          amount: rupeesText(slip.employerCost), payAmount: "0",
          divisionId: division, branchId: branch, pay,
        });
        employerExpenseId = er.id;
      }

      await conn.query(
        `INSERT INTO acct_salary_payments (legal_business_id, employee_id, salary_month, amount, advance_deducted, note, expense_id, paid_on, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [biz, Number(e.id), month, rupeesText(slip.gross), rupeesText(slip.employee.advance), "Paid through Payroll", salary.id, today, user.id]
      );
      const c = payslipColumns(input, slip);
      await conn.query(
        `UPDATE acct_payslips SET ${Object.keys(c).map((k) => `${k} = ?`).join(", ")},
                status = 'PAID', salary_expense_id = ?, employer_expense_id = ?, paid_on = ?
          WHERE id = ? AND status = 'DRAFT'`,
        [...Object.values(c), salary.id, employerExpenseId, today, id]
      );
      await conn.query(
        `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'PAYROLL_PAID', 'PAYSLIP', ?, ?)`,
        [biz, user.id, id, JSON.stringify({ month, gross: rupeesText(slip.gross), net: rupeesText(slip.net), expense: salary.expenseNo })]
      );
      await conn.commit();
      paidNames.push(String(e.full_name));
    } catch (error) {
      await conn.rollback().catch(() => {});
      if (isRedirect(error)) throw error;
      if (error instanceof QuickExpenseError) problems.push(error.message);
      else { console.error("Payroll payment failed:", error); problems.push("one payment could not be saved"); }
    } finally {
      conn.release();
    }
  }
  revalidatePath(RUN);
  revalidatePath(DUES);
  revalidatePath("/accounting/salaries");
  revalidatePath("/accounting/cash-closing");
  const msg = paidNames.length ? `Paid: ${paidNames.join(", ")}.` : "Nobody was paid.";
  go(RUN, problems.length ? { month, error: `${msg} Not paid: ${problems.join("; ")}.` } : { month, saved: msg });
}

/**
 * Pay one statute (PF, ESI, PT or TDS) for one month to the government: one challan, split across each
 * person's salary expense (their share) and employer expense (the employer's share), so the owing amounts
 * clear in the books.
 */
export async function remitStatutoryAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const biz = user.legal_business_id;
  const month = text(form, "month");
  const statute = text(form, "statute");
  const challan = text(form, "challan_no").slice(0, 60);
  const paidOn = text(form, "paid_on");
  const account = /^(CASH|BANK):([1-9]\d*)$/.exec(text(form, "account"));
  const how = text(form, "how");
  if (!isMonth(month) || !["PF", "ESI", "PT", "TDS"].includes(statute)) redirect(DUES);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) go(DUES, { month, error: "Choose the date it was paid." });
  if (!account) go(DUES, { month, error: "Choose the account it was paid from." });
  const [, kind, accountIdText] = account!;
  const allowed = kind === "CASH" ? ["CASH"] : ["UPI", "BANK_TRANSFER", "CHEQUE", "OTHER"];
  if (!allowed.includes(how)) go(DUES, { month, error: "Choose how it was paid." });

  const col = statute.toLowerCase() + "_remittance_id";
  const parts: Record<string, [string, string]> = {
    PF: ["emp_pf", "er_epf + er_eps + er_edli + er_pf_admin"],
    ESI: ["emp_esi", "er_esi"],
    PT: ["emp_pt", "0"],
    TDS: ["emp_tds", "0"],
  };
  const [empCol, erExpr] = parts[statute];

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [slips] = await conn.query<Row[]>(
      `SELECT p.id, p.salary_expense_id, p.employer_expense_id, ${empCol} AS emp, (${erExpr}) AS er,
              e.division_id
         FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
        WHERE p.legal_business_id = ? AND p.salary_month = ? AND p.status = 'PAID' AND p.${col} IS NULL
          AND (${empCol} > 0 OR (${erExpr}) > 0)
        FOR UPDATE`,
      [biz, month]
    );
    if (slips.length === 0) throw new QuickExpenseError(`Nothing is owing for ${statute} for this month.`);
    const total = slips.reduce((t, s) => t + toPaise(s.emp) + toPaise(s.er), 0n);
    const [rem] = await conn.query<ResultSetHeader>(
      `INSERT INTO acct_statutory_remittances (legal_business_id, statute, salary_month, paid_on, amount, challan_no, bank_account_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [biz, statute, month, paidOn, rupeesText(total), challan || null, kind === "BANK" ? Number(accountIdText) : null, user.id]
    );
    const common = {
      businessId: biz, date: paidOn, method: how, source: kind === "CASH" ? "BUSINESS_CASH" as const : "BUSINESS_BANK" as const,
      bankId: kind === "BANK" ? Number(accountIdText) : null, cashId: kind === "CASH" ? Number(accountIdText) : null,
      reference: challan || `${statute} ${month}`, remarks: `${statute} for ${month} paid to government`, userId: user.id,
    };
    for (const s of slips) {
      const division = s.division_id === null ? null : Number(s.division_id);
      if (toPaise(s.emp) > 0n && s.salary_expense_id) await recordExpensePayment(conn, { ...common, divisionId: division, expenseId: Number(s.salary_expense_id), amount: rupeesText(toPaise(s.emp)) });
      if (toPaise(s.er) > 0n && s.employer_expense_id) await recordExpensePayment(conn, { ...common, divisionId: division, expenseId: Number(s.employer_expense_id), amount: rupeesText(toPaise(s.er)) });
      await conn.query(`UPDATE acct_payslips SET ${col} = ? WHERE id = ?`, [rem.insertId, Number(s.id)]);
    }
    await conn.query(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'STATUTORY_PAID', 'REMITTANCE', ?, ?)`,
      [biz, user.id, rem.insertId, JSON.stringify({ statute, month, amount: rupeesText(total), challan })]
    );
    await conn.commit();
    revalidatePath(DUES);
    go(DUES, { month, saved: `${statute} for ${monthLabel(month)}: ₹${rupeesText(total)} recorded as paid${challan ? ` (challan ${challan})` : ""}.` });
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isRedirect(error)) throw error;
    if (error instanceof QuickExpenseError) go(DUES, { month, error: error.message });
    console.error("Statutory payment failed:", error);
    go(DUES, { month, error: "The payment could not be saved. Nothing was changed." });
  } finally {
    conn.release();
  }
}

/** Switch statutes on or off and choose the professional tax state. Owner only. */
export async function savePayrollSettingsAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const flag = (n: string) => (form.get(n) === "1" ? "1" : "0");
  const state = text(form, "payroll_pt_state");
  const slabs = text(form, "payroll_pt_slabs");
  if (state === "CUSTOM" && !parsePtSlabs(slabs)) go(SETTINGS, { error: "Write the professional tax slabs like 15000=0; 20000=150; *=200." });
  if (state && state !== "CUSTOM" && !PT_PRESETS[state]) go(SETTINGS, { error: "Choose a state from the list." });
  const tan = text(form, "payroll_tan").toUpperCase();
  if (tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(tan)) go(SETTINGS, { error: "The TAN looks wrong (4 letters, 5 numbers, 1 letter)." });
  await saveBusinessSettings(user.legal_business_id, {
    payroll_pf_enabled: flag("payroll_pf_enabled"),
    payroll_pf_full_wages: flag("payroll_pf_full_wages"),
    payroll_pf_fifty_rule: flag("payroll_pf_fifty_rule"),
    payroll_esi_enabled: flag("payroll_esi_enabled"),
    payroll_pt_enabled: flag("payroll_pt_enabled"),
    payroll_tds_enabled: flag("payroll_tds_enabled"),
    payroll_pt_state: state,
    payroll_pt_slabs: slabs,
    payroll_tan: tan,
  }, user.id);
  revalidatePath(SETTINGS);
  go(SETTINGS, { saved: "Payroll settings saved. They apply to payslips worked out from now on." });
}

/** Save how a salary is split (Basic, HRA, ...). The shares must not add up to more than 100%. Owner only. */
export async function savePayComponentsAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const biz = user.legal_business_id;
  const codes = form.getAll("code").map(String);
  const rows = codes.map((code, i) => ({
    code: code.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20),
    name: String(form.getAll("name")[i] ?? "").trim().slice(0, 60),
    pct: String(form.getAll("percent")[i] ?? "").trim(),
    pf: form.getAll("pf_wage").map(String).includes(code),
    esi: form.getAll("esi_wage").map(String).includes(code),
    active: form.getAll("active").map(String).includes(code),
  })).filter((r) => r.code && r.name);
  const shares = rows.filter((r) => r.active && r.pct !== "").map((r) => Number(r.pct));
  if (shares.some((n) => !Number.isFinite(n) || n < 0 || n > 100)) go(SETTINGS, { error: "Each share must be a percentage from 0 to 100, or empty for the balance part." });
  if (shares.reduce((t, n) => t + n, 0) > 100) go(SETTINGS, { error: "The shares add up to more than 100%." });
  if (rows.filter((r) => r.active && r.pct === "").length > 1) go(SETTINGS, { error: "Only one part can be the balance (empty share)." });
  for (const [i, r] of rows.entries()) {
    await db.query(
      `INSERT INTO acct_pay_components (legal_business_id, code, name, percent_bps, pf_wage, esi_wage, sort_order, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), percent_bps = VALUES(percent_bps), pf_wage = VALUES(pf_wage),
                               esi_wage = VALUES(esi_wage), sort_order = VALUES(sort_order), status = VALUES(status)`,
      [biz, r.code, r.name, r.pct === "" ? null : Math.round(Number(r.pct) * 100), r.pf ? 1 : 0, r.esi ? 1 : 0, i + 1, r.active ? "ACTIVE" : "INACTIVE"]
    );
  }
  revalidatePath(SETTINGS);
  go(SETTINGS, { saved: "Salary parts saved." });
}

/** Save a person's PF, ESI, PAN and tax details (staff record page). */
export async function saveEmployeeStatutoryAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const id = Number(text(form, "employee_id"));
  const page = `/accounting/salaries/${id}`;
  const pan = text(form, "pan").toUpperCase();
  const uan = text(form, "uan").replace(/\s/g, "");
  const esi = text(form, "esi_number").replace(/\s/g, "");
  const dob = text(form, "date_of_birth");
  const deductions = text(form, "old_regime_deductions").replaceAll(",", "") || "0";
  if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) go(page, { error: "PAN must be 5 letters, 4 numbers and 1 letter." });
  if (uan && !/^\d{12}$/.test(uan)) go(page, { error: "UAN must be 12 numbers." });
  if (esi && !/^\d{10,17}$/.test(esi)) go(page, { error: "ESI number must be 10 to 17 numbers." });
  if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) go(page, { error: "Choose the date of birth." });
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(deductions)) go(page, { error: "Deductions must be an amount in rupees." });
  await db.query(
    `UPDATE acct_employees SET pan = ?, uan = ?, name_as_per_uan = ?, esi_number = ?, date_of_birth = ?,
            pf_member = ?, esi_member = ?, pt_applicable = ?, tax_regime = ?, old_regime_deductions = ?
      WHERE legal_business_id = ? AND id = ?`,
    [pan || null, uan || null, text(form, "name_as_per_uan").slice(0, 150) || null, esi || null, dob || null,
     form.get("pf_member") === "1" ? 1 : 0, form.get("esi_member") === "1" ? 1 : 0, form.get("pt_applicable") === "1" ? 1 : 0,
     text(form, "tax_regime") === "OLD" ? "OLD" : "NEW", deductions, user.legal_business_id, id]
  );
  revalidatePath(page);
  go(page, { saved: "PF, ESI and tax details saved." });
}
