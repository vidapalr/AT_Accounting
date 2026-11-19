import "server-only";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { loadLetterTemplate } from "@/lib/letter-templates";
import { ctcFromGross, monthlyGrossFor, type EmploymentType } from "@/lib/payroll/ctc";
import { loadComponents, loadCtcOptions, loadNormalMonth, loadPayrollSettings, toPaise } from "@/lib/payroll/data";
import { DEFAULT_TERMS, LETTER_TYPES, PACK_LETTERS, TERMS_FOR, type LetterContext, type LetterType, type Terms } from "@/lib/staff-letters";
import { addDaysDmy, buildLetterPack, salaryAnnexure, type LetterPack } from "@/lib/letter-pack";
import { ageAt, computePayslip, daysIn } from "@/lib/payroll/engine";
import { ensureEmployeeCode } from "@/lib/employee-code";
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

/** The person's branch address for the letterhead (the brand's town when no branch is set). */
export async function branchAddress(businessId: number, branchId: unknown, fallback: string): Promise<{ address: string; city: string }> {
  const [branch] = await db.execute<Row[]>(
    `SELECT address_line1, address_line2, city, state, postal_code FROM acct_branches
      WHERE legal_business_id = ? AND id = ? LIMIT 1`,
    [businessId, Number(branchId ?? 0)]
  );
  const b = branch[0];
  return {
    address: [b?.address_line1, b?.address_line2, b?.city, b?.state, b?.postal_code].filter(Boolean).join(", ") || fallback,
    city: String(b?.city ?? fallback),
  };
}

export type StaffLetter = {
  employee: Row;
  type: LetterType;
  ctx: LetterContext;
  /** The letter as pages (null for the pay slip, which the screen draws from the saved pay slip instead). */
  pack: LetterPack | null;
  month: string;
  address: string;
  branchCity: string;
};

/** Everything the letters screen (and saving a letter to a folder) needs for one person. */
export async function loadStaffLetter(businessId: number, employeeId: number, q: LetterQuery): Promise<StaffLetter | null> {
  const code = await ensureEmployeeCode(db, businessId, employeeId);
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

  const { address, city } = await branchAddress(businessId, e.branch_id, brand.place);
  const { ctc, normal, settings, components, type: workType } = await ctcForEmployee(businessId, e, month);
  const today = todayInIndia();

  const ctx: LetterContext = {
    title: ["Mr.", "Ms.", "Mrs."].includes(q.title ?? "") ? String(q.title) : "",
    name: String(e.full_name),
    jobTitle: String(e.job_title ?? ""),
    salary: inr(e.monthly_salary),
    joinedOn: dmy(e.joined_on),
    noticeGivenOn: dmy(e.notice_given_on),
    leftOn: dmy(e.left_on),
    letterDate: dmy(todayInIndia()),
    place: city,
    terms,
    employer: brand.shopName !== brand.groupName ? `${brand.groupName} (${brand.shopName})` : brand.groupName,
    newSalary: /^\d{1,9}(\.\d{1,2})?$/.test(q.new_salary ?? "") ? inr(q.new_salary) : "",
    effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(q.effective ?? "") ? dmy(q.effective) : "",
    reason: clean(q.reason, 300, ""),
    employmentType: typeOfWork(e.employment_type),
    dailyWage: e.daily_wage == null ? "" : inr(e.daily_wage),
    hourlyRate: e.hourly_rate == null ? "" : inr(e.hourly_rate),
    ctc: inr(Number(ctc.annual.ctc) / 100),
    employeeCode: code ?? "",
    department: String(e.department ?? ""),
    reportsTo: String(e.reports_to ?? ""),
    offerValidUntil: addDaysDmy(today, 7),
  };

  // Salary annexure: one full month on the payroll rules, with the person's own PF, ESI and PT settings.
  let annexure: { rows: ReturnType<typeof salaryAnnexure>["rows"]; basis: string[] } | null = null;
  if (PACK_LETTERS.has(type) && ctc.monthlyGross > 0n) {
    const flag = (v: unknown) => v == null || Number(v) === 1;
    const slip = computePayslip({
      month, monthlySalary: ctc.monthlyGross, components, daysInMonth: daysIn(month), paidDays: daysIn(month),
      person: {
        pfMember: flag(e.pf_member), esiMember: flag(e.esi_member), ptApplicable: flag(e.pt_applicable),
        regime: e.tax_regime === "OLD" ? "OLD" : "NEW", oldRegimeDeductions: 0n,
        age: ageAt(month, e.date_of_birth ? new Date(String(e.date_of_birth)).toISOString().slice(0, 10) : null),
      },
      ytd: { gross: 0n, tds: 0n, pt: 0n }, advance: 0n,
    }, { ...settings, tds: { enabled: false } });
    const a = salaryAnnexure(slip, { bonusAnnual: ctc.annual.bonus, gratuityAnnual: ctc.annual.gratuity });
    ctx.ctc = inr(Number(a.ctcAnnual) / 100);
    const monthlyWords = `₹${inr(Number(ctc.monthlyGross) / 100)}`;
    const basis = workType === "DAILY_WAGE"
      ? [`Basis of pay: ₹${ctx.dailyWage} a day × ${normal.daysAMonth} working days in a normal month = ${monthlyWords} a month (estimate).`]
      : workType === "HOURLY"
        ? [`Basis of pay: ₹${ctx.hourlyRate} an hour × ${normal.hoursADay} hours × ${normal.daysAMonth} days in a normal month = ${monthlyWords} a month (estimate).`]
        : [`Your annual cost to company (CTC) is ₹${ctx.ctc}, made up as follows.`];
    annexure = { rows: a.rows, basis };
  }

  return {
    employee: e,
    type,
    ctx,
    pack: type === "payslip" ? null : buildLetterPack({
      type, ctx, dateIso: today,
      letter: await loadLetterTemplate(businessId, type),
      terms: await loadLetterTemplate(businessId, TERMS_FOR[type] ?? "terms_monthly"),
      homeAddress: String(e.home_address ?? ""),
      phone: String(e.phone ?? ""),
      workAddress: address,
      annexure,
    }),
    month,
    address,
    branchCity: city,
  };
}
