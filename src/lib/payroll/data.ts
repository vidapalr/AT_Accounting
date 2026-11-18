import "server-only";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";
import { ageAt, computePayslip, daysIn, defaultPaidDays, DEFAULT_SETTINGS, fyStartOf, type PayComponent, type PayrollSettings, type Payslip, type PayslipInput } from "./engine";
import { ESI_DEFAULTS, PF_DEFAULTS, PT_PRESETS, parsePtSlabs } from "./rules";
import { openAdvances } from "@/lib/staff-advance-recovery";
import { monthHours, monthMarks, type DayStatus } from "@/lib/attendance";
import { DEFAULT_CTC_OPTIONS, paidDaysFromAttendance, type CtcOptions, type EmploymentType } from "./ctc";

type Q = Pool | PoolConnection;
type Row = RowDataPacket & Record<string, string | number | null>;

export const toPaise = (v: unknown): bigint => {
  const t = String(v ?? "0");
  const neg = t.startsWith("-");
  const [w, f = ""] = t.replace("-", "").split(".");
  const p = BigInt(w || "0") * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -p : p;
};
export const rupeesText = (p: bigint): string => `${p < 0n ? "-" : ""}${(p < 0n ? -p : p) / 100n}.${String((p < 0n ? -p : p) % 100n).padStart(2, "0")}`;

/** Every setting key used by payroll, so the settings page and the loader agree. */
export const PAYROLL_KEYS = [
  "payroll_pf_enabled", "payroll_pf_full_wages", "payroll_pf_fifty_rule",
  "payroll_pf_employee_bps", "payroll_pf_employer_bps",
  "payroll_esi_enabled", "payroll_pt_enabled", "payroll_pt_state", "payroll_pt_slabs", "payroll_tds_enabled",
  "payroll_tan", "payroll_ctc_bonus", "payroll_ctc_gratuity", "payroll_bonus_wage_cap",
] as const;

const bps = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 10000 ? n : fallback;
};

/** The company's payroll settings (statutes off until switched on). */
export async function loadPayrollSettings(businessId: number, conn: Q = db): Promise<PayrollSettings & { ptState: string; tan: string }> {
  const [rows] = await conn.query<Row[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key IN (?)`,
    [businessId, PAYROLL_KEYS]
  );
  const s: Record<string, string> = {};
  for (const r of rows) s[String(r.setting_key)] = String(r.setting_value);
  const ptState = s.payroll_pt_state || "";
  const slabs = ptState === "CUSTOM" ? parsePtSlabs(s.payroll_pt_slabs ?? "") ?? [] : PT_PRESETS[ptState]?.slabs ?? [];
  return {
    pf: {
      ...DEFAULT_SETTINGS.pf,
      enabled: s.payroll_pf_enabled === "1",
      onFullWages: s.payroll_pf_full_wages === "1",
      fiftyPercentRule: s.payroll_pf_fifty_rule !== "0",
      employeeRateBps: bps(s.payroll_pf_employee_bps, PF_DEFAULTS.employeeRateBps),
      employerRateBps: bps(s.payroll_pf_employer_bps, PF_DEFAULTS.employerRateBps),
    },
    esi: { ...DEFAULT_SETTINGS.esi, ...ESI_DEFAULTS, enabled: s.payroll_esi_enabled === "1" },
    pt: { enabled: s.payroll_pt_enabled === "1" && slabs.length > 0, slabs },
    tds: { enabled: s.payroll_tds_enabled === "1" },
    ptState,
    tan: s.payroll_tan ?? "",
  };
}

/** The parts a salary is split into (one Basic part before migration 088). */
export async function loadComponents(businessId: number, conn: Q = db): Promise<PayComponent[]> {
  try {
    const [rows] = await conn.query<Row[]>(
      `SELECT code, name, percent_bps, pf_wage, esi_wage FROM acct_pay_components
        WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY sort_order, id`,
      [businessId]
    );
    return rows.map((r) => ({
      code: String(r.code), name: String(r.name),
      percentBps: r.percent_bps === null ? null : Number(r.percent_bps),
      pfWage: Number(r.pf_wage) === 1, esiWage: Number(r.esi_wage) === 1,
    }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

/** The monthly salary in force on the last day of the month (pay history), else the saved salary. */
export async function salaryInForce(conn: Q, businessId: number, employeeId: number, month: string, saved: unknown): Promise<bigint> {
  try {
    const [rows] = await conn.query<Row[]>(
      `SELECT monthly_salary FROM acct_employee_pay_history
        WHERE legal_business_id = ? AND employee_id = ? AND effective_from <= LAST_DAY(?)
        ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [businessId, employeeId, `${month}-01`]
    );
    if (rows[0]) return toPaise(rows[0].monthly_salary);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  return toPaise(saved);
}

/** Totals of a person's PAID payslips earlier in the same financial year. */
export async function yearToDate(conn: Q, businessId: number, employeeId: number, month: string) {
  const fy = fyStartOf(month);
  const [rows] = await conn.query<Row[]>(
    `SELECT COALESCE(SUM(gross), 0) AS g, COALESCE(SUM(emp_tds), 0) AS t, COALESCE(SUM(emp_pt), 0) AS p
       FROM acct_payslips WHERE legal_business_id = ? AND employee_id = ? AND status = 'PAID'
        AND salary_month >= ? AND salary_month < ?`,
    [businessId, employeeId, `${fy}-04`, month]
  );
  // Months paid before Payroll was used (the old one-line salary payment) still count as income this year.
  const [before] = await conn.query<Row[]>(
    `SELECT COALESCE(SUM(s.amount), 0) AS g FROM acct_salary_payments s
      WHERE s.legal_business_id = ? AND s.employee_id = ? AND s.salary_month >= ? AND s.salary_month < ?
        AND NOT EXISTS (SELECT 1 FROM acct_payslips p WHERE p.legal_business_id = s.legal_business_id
                          AND p.employee_id = s.employee_id AND p.salary_month = s.salary_month AND p.status = 'PAID')`,
    [businessId, employeeId, `${fy}-04`, month]
  );
  return { gross: toPaise(rows[0]?.g) + toPaise(before[0]?.g), tds: toPaise(rows[0]?.t), pt: toPaise(rows[0]?.p) };
}

/** ESI keeps applying to the end of a contribution period (Apr-Sep, Oct-Mar) once a person was covered in it. */
async function esiCarriedOver(conn: Q, businessId: number, employeeId: number, month: string): Promise<boolean> {
  const [y, m] = month.split("-").map(Number);
  const start = m >= 4 && m <= 9 ? `${y}-04` : m >= 10 ? `${y}-10` : `${y - 1}-10`;
  const [rows] = await conn.query<Row[]>(
    `SELECT 1 FROM acct_payslips WHERE legal_business_id = ? AND employee_id = ? AND status = 'PAID'
        AND salary_month >= ? AND salary_month < ? AND esi_wages > 0 LIMIT 1`,
    [businessId, employeeId, start, month]
  );
  return rows.length > 0;
}

export type EmployeeForPay = Row & { id: number; full_name: string };

/** Works out one person's payslip for a month. `paidDays` and `advance` default to the full month and the planned instalment. */
export async function buildPayslip(
  conn: Q,
  businessId: number,
  e: EmployeeForPay,
  month: string,
  opts: { paidDays?: number; advance?: bigint; settings?: PayrollSettings; components?: PayComponent[] } = {}
): Promise<{ input: PayslipInput; slip: Payslip }> {
  const settings = opts.settings ?? (await loadPayrollSettings(businessId, conn));
  const components = opts.components ?? (await loadComponents(businessId, conn));
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null);
  const type = (["PART_TIME", "DAILY_WAGE", "HOURLY"].includes(String(e.employment_type)) ? String(e.employment_type) : "FULL_TIME") as EmploymentType;
  // Daily wage: a month's pay is the day rate for every day of the month, earned for the days present.
  // Paid by the hour: the month's pay is the rate times the hours in the attendance register, earned in full.
  const hours = type === "HOURLY" ? await attendanceHours(conn, businessId, Number(e.id), month) : 0;
  const monthlySalary =
    type === "DAILY_WAGE"
      ? toPaise(e.daily_wage ?? 0) * BigInt(daysIn(month))
      : type === "HOURLY"
        ? (toPaise(e.hourly_rate ?? 0) * BigInt(Math.round(hours * 10))) / 10n
        : await salaryInForce(conn, businessId, Number(e.id), month, e.monthly_salary);
  const marks = await attendanceMarks(conn, businessId, Number(e.id), month);
  const ytd = await yearToDate(conn, businessId, Number(e.id), month);
  let advance = opts.advance;
  if (advance === undefined) {
    const [plan] = await conn.query<Row[]>(
      `SELECT COALESCE(MAX(a.instalment), 0) AS i FROM acct_staff_advances a
        WHERE a.legal_business_id = ? AND a.employee_id = ?
          AND a.amount > COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.advance_id = a.id), 0)`,
      [businessId, Number(e.id)]
    ).catch(() => [[{ i: 0 }] as Row[]]);
    advance = toPaise(plan[0]?.i ?? 0);
  }
  const input: PayslipInput = {
    month,
    monthlySalary,
    components,
    daysInMonth: daysIn(month),
    paidDays:
      opts.paidDays ??
      (marks
        ? Math.min(defaultPaidDays(month, iso(e.joined_on), iso(e.left_on)), paidDaysFromAttendance(type, daysIn(month), marks))
        : type === "DAILY_WAGE"
          ? 0
          : defaultPaidDays(month, iso(e.joined_on), iso(e.left_on))),
    person: {
      pfMember: Number(e.pf_member ?? 1) === 1,
      esiMember: Number(e.esi_member ?? 1) === 1,
      ptApplicable: Number(e.pt_applicable ?? 1) === 1,
      regime: e.tax_regime === "OLD" ? "OLD" : "NEW",
      oldRegimeDeductions: toPaise(e.old_regime_deductions ?? 0),
      age: ageAt(month, iso(e.date_of_birth)),
    },
    ytd,
    advance,
    esiCarriedOver: await esiCarriedOver(conn, businessId, Number(e.id), month),
  };
  return { input, slip: computePayslip(input, settings) };
}

/** Hours worked in a month from the IN and OUT times in the register (0 before migration 091). */
export async function attendanceHours(conn: Q, businessId: number, employeeId: number, month: string): Promise<number> {
  try {
    const [rows] = await conn.query<Row[]>(
      `SELECT in_time, out_time FROM acct_attendance
        WHERE legal_business_id = ? AND employee_id = ? AND work_date BETWEEN ? AND LAST_DAY(?)`,
      [businessId, employeeId, `${month}-01`, `${month}-01`]
    );
    return monthHours(rows.map((r) => ({ inTime: r.in_time == null ? null : String(r.in_time), outTime: r.out_time == null ? null : String(r.out_time) })));
  } catch (error) {
    if (isMissingTable(error)) return 0;
    throw error;
  }
}

/** Counts of marked days for a person and month, or null when nothing is marked (or before migration 091). */
export async function attendanceMarks(conn: Q, businessId: number, employeeId: number, month: string): Promise<{ present: number; half: number; absent: number } | null> {
  try {
    const [rows] = await conn.query<Row[]>(
      `SELECT status FROM acct_attendance WHERE legal_business_id = ? AND employee_id = ? AND work_date BETWEEN ? AND LAST_DAY(?)`,
      [businessId, employeeId, `${month}-01`, `${month}-01`]
    );
    if (rows.length === 0) return null;
    const m = monthMarks(rows.map((r) => ({ status: (r.status as DayStatus) ?? null })));
    return { present: m.present, half: m.half, absent: m.absent };
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

/** CTC options from payroll settings. */
export async function loadCtcOptions(businessId: number, conn: Q = db): Promise<CtcOptions> {
  const [rows] = await conn.query<Row[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key IN ('payroll_ctc_bonus', 'payroll_ctc_gratuity', 'payroll_bonus_wage_cap')`,
    [businessId]
  );
  const s = Object.fromEntries(rows.map((r) => [String(r.setting_key), String(r.setting_value ?? "")]));
  const cap = Number(s.payroll_bonus_wage_cap);
  return { ...DEFAULT_CTC_OPTIONS, bonus: s.payroll_ctc_bonus === "1", gratuity: s.payroll_ctc_gratuity === "1", bonusWageCap: Number.isFinite(cap) && cap > 0 ? BigInt(Math.round(cap * 100)) : DEFAULT_CTC_OPTIONS.bonusWageCap };
}

/** What is still owed on advances (for capping the amount taken back when paying). */
export async function advanceOwed(conn: PoolConnection, businessId: number, employeeId: number): Promise<bigint> {
  return (await openAdvances(conn, businessId, employeeId)).reduce((t, a) => t + a.due, 0n);
}

/** Columns of acct_payslips written from a computed payslip. */
export function payslipColumns(input: PayslipInput, slip: Payslip) {
  const t = rupeesText;
  return {
    monthly_salary: t(input.monthlySalary), days_in_month: input.daysInMonth, paid_days: input.paidDays,
    gross: t(slip.gross), pf_wages: t(slip.wages.pf), eps_wages: t(slip.wages.eps), edli_wages: t(slip.wages.edli), esi_wages: t(slip.wages.esi),
    emp_pf: t(slip.employee.pf), emp_esi: t(slip.employee.esi), emp_pt: t(slip.employee.pt), emp_tds: t(slip.employee.tds),
    advance_deducted: t(slip.employee.advance),
    er_epf: t(slip.employer.epf), er_eps: t(slip.employer.eps), er_edli: t(slip.employer.edli), er_pf_admin: t(slip.employer.pfAdmin), er_esi: t(slip.employer.esi),
    net_pay: t(slip.net),
    detail_json: JSON.stringify({
      earnings: slip.earnings.map((x) => ({ code: x.code, name: x.name, full: t(x.full), earned: t(x.earned) })),
      tax: { ...slip.tax, projectedGross: t(slip.tax.projectedGross), taxable: t(slip.tax.taxable), annualTax: t(slip.tax.annualTax) },
      notes: slip.notes,
    }),
  };
}

/** Insert or refresh a DRAFT payslip (a PAID one is never touched). */
export async function saveDraftPayslip(conn: Q, businessId: number, employeeId: number, month: string, input: PayslipInput, slip: Payslip, userId: number): Promise<void> {
  const c = payslipColumns(input, slip);
  const cols = Object.keys(c);
  await conn.query(
    `INSERT INTO acct_payslips (legal_business_id, employee_id, salary_month, status, created_by, ${cols.join(", ")})
     VALUES (?, ?, ?, 'DRAFT', ?, ${cols.map(() => "?").join(", ")})
     ON DUPLICATE KEY UPDATE ${cols.map((k) => `${k} = IF(status = 'DRAFT', VALUES(${k}), ${k})`).join(", ")}`,
    [businessId, employeeId, month, userId, ...Object.values(c)]
  );
}
