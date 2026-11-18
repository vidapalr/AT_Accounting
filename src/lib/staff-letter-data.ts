import "server-only";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { loadLetterTemplate } from "@/lib/letter-templates";
import { ctcFromGross, monthlyGrossFor, type EmploymentType } from "@/lib/payroll/ctc";
import { loadComponents, loadCtcOptions, loadNormalMonth, loadPayrollSettings, toPaise } from "@/lib/payroll/data";
import { DEFAULT_TERMS, LETTER_TYPES, renderLetter, type Letter, type LetterContext, type LetterType, type Terms } from "@/lib/staff-letters";
import { todayInIndia } from "@/lib/format";

/** What the letters screen may be asked for; the same values are used when a letter is saved to a folder. */
export type LetterQuery = {
  type?: string; title?: string; notice?: string; probation?: string; hours?: string; off?: string;
  leaves?: string; month?: string; new_salary?: string; effective?: string; reason?: string;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const dmy = (v: unknown) => (v ? new Date(v as string).toLocaleDateString("en-GB").replaceAll("/", "-") : "");
const inr = (v: unknown) => Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clean = (v: string | undefined, max: number, fallback: string) => (v ?? "").trim().slice(0, max) || fallback;

export const typeOfWork = (v: unknown): EmploymentType =>
  (["PART_TIME", "DAILY_WAGE", "HOURLY"].includes(String(v)) ? String(v) : "FULL_TIME") as EmploymentType;

/** The letter that fits a type of work, used as the first choice on the letters screen. */
export function defaultLetterType(employmentType: unknown): LetterType {
  const t = typeOfWork(employmentType);
  if (t === "DAILY_WAGE") return "daily_wage_engagement";
  if (t === "HOURLY") return "hourly_engagement";
  if (t === "PART_TIME") return "part_time_appointment";
  return "appointment";
}

/**
 * The cost to company for one person, whichever way they are paid. Wage and hourly staff are worked
 * out on a normal month (working days and hours a day from Payroll settings).
 */
export async function ctcForEmployee(businessId: number, e: Row, month = todayInIndia().slice(0, 7)) {
  const [settings, components, options, normal] = await Promise.all([
    loadPayrollSettings(businessId), loadComponents(businessId), loadCtcOptions(businessId), loadNormalMonth(businessId),
  ]);
  const type = typeOfWork(e.employment_type);
  const monthlyGross = monthlyGrossFor(
    type,
    { monthlySalary: toPaise(e.monthly_salary ?? 0), dailyWage: toPaise(e.daily_wage ?? 0), hourlyRate: toPaise(e.hourly_rate ?? 0) },
    normal
  );
  return { type, normal, ctc: ctcFromGross({ monthlyGross, components, settings, options, month }), settings, components, options };
}

export type StaffLetter = {
  employee: Row;
  type: LetterType;
  ctx: LetterContext;
  /** null for the pay slip, which the screen draws from the saved pay slip instead. */
  letter: Letter | null;
  month: string;
  address: string;
  branchCity: string;
};

/** Everything the letters screen (and saving a letter to a folder) needs for one person. */
export async function loadStaffLetter(businessId: number, employeeId: number, q: LetterQuery): Promise<StaffLetter | null> {
  const [emp] = await db.execute<Row[]>(`SELECT * FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [businessId, employeeId]);
  const e = emp[0];
  if (!e) return null;
  const brand = await getBrand(businessId);
  const type: LetterType = LETTER_TYPES.some((t) => t.key === q.type) ? (q.type as LetterType) : defaultLetterType(e.employment_type);
  const terms: Terms = {
    noticeDays: clean(q.notice, 3, DEFAULT_TERMS.noticeDays).replace(/\D/g, "") || DEFAULT_TERMS.noticeDays,
    probationDays: clean(q.probation, 3, DEFAULT_TERMS.probationDays).replace(/\D/g, "") || "0",
    hours: clean(q.hours, 60, DEFAULT_TERMS.hours),
    weeklyOff: clean(q.off, 60, DEFAULT_TERMS.weeklyOff),
    leaves: clean(q.leaves, 3, DEFAULT_TERMS.leaves).replace(/\D/g, "") || "0",
  };
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? String(q.month) : todayInIndia().slice(0, 7);

  const [branch] = await db.execute<Row[]>(
    `SELECT address_line1, address_line2, city, state, postal_code FROM acct_branches
      WHERE legal_business_id = ? AND id = ? LIMIT 1`,
    [businessId, Number(e.branch_id ?? 0)]
  );
  const b = branch[0];
  const address = [b?.address_line1, b?.address_line2, b?.city, b?.state, b?.postal_code].filter(Boolean).join(", ") || brand.place;
  const { ctc } = await ctcForEmployee(businessId, e, month);

  const ctx: LetterContext = {
    title: ["Mr.", "Ms.", "Mrs."].includes(q.title ?? "") ? String(q.title) : "",
    name: String(e.full_name),
    jobTitle: String(e.job_title ?? ""),
    salary: inr(e.monthly_salary),
    joinedOn: dmy(e.joined_on),
    noticeGivenOn: dmy(e.notice_given_on),
    leftOn: dmy(e.left_on),
    letterDate: dmy(todayInIndia()),
    place: String(b?.city ?? brand.place),
    terms,
    employer: brand.shopName !== brand.groupName ? `${brand.groupName} (${brand.shopName})` : brand.groupName,
    newSalary: /^\d{1,9}(\.\d{1,2})?$/.test(q.new_salary ?? "") ? inr(q.new_salary) : "",
    effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(q.effective ?? "") ? dmy(q.effective) : "",
    reason: clean(q.reason, 300, ""),
    employmentType: typeOfWork(e.employment_type),
    dailyWage: e.daily_wage == null ? "" : inr(e.daily_wage),
    hourlyRate: e.hourly_rate == null ? "" : inr(e.hourly_rate),
    ctc: inr(Number(ctc.annual.ctc) / 100),
  };

  return {
    employee: e,
    type,
    ctx,
    letter: type === "payslip" ? null : renderLetter(await loadLetterTemplate(businessId, type), ctx),
    month,
    address,
    branchCity: String(b?.city ?? brand.place),
  };
}
