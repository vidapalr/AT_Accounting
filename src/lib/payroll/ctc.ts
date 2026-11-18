/**
 * Cost to company (CTC), pure. CTC is everything the business spends on a person in a year:
 *   12 x (monthly gross + employer PF, EPS, EDLI and PF admin + employer ESI)
 *   + statutory bonus (8.33% of basic up to the bonus wage cap, for pay up to Rs 21,000 a month), when switched on
 *   + gratuity provision (4.81% of basic), when switched on.
 * Employer PF and ESI follow the company's payroll settings, so a business not yet registered
 * for PF or ESI shows them as nil. Money in paise.
 *
 * "Monthly gross" is the salary the person is offered (Basic + HRA + other parts); take-home is
 * gross less the person's own PF, ESI, professional tax and income tax.
 */
import { computePayslip, daysIn, roundRupee, type PayComponent, type PayrollSettings } from "./engine.ts";

export type CtcOptions = {
  bonus: boolean;
  gratuity: boolean;
  /** Basic counted for bonus, per month (Rs 7,000 unless the state minimum wage is higher). */
  bonusWageCap: bigint;
  /** Bonus applies to people earning up to this much a month. */
  bonusEligibleUpTo: bigint;
};

export const DEFAULT_CTC_OPTIONS: CtcOptions = { bonus: false, gratuity: false, bonusWageCap: 700000n, bonusEligibleUpTo: 2100000n };

export type Ctc = {
  monthlyGross: bigint;
  basic: bigint;
  employerMonthly: { pf: bigint; esi: bigint; total: bigint };
  takeHomeMonthly: bigint;
  annual: { gross: bigint; employer: bigint; bonus: bigint; gratuity: bigint; ctc: bigint };
};

export function ctcFromGross(input: {
  monthlyGross: bigint;
  components: PayComponent[];
  settings: PayrollSettings;
  options: CtcOptions;
  month: string;
  age?: number | null;
}): Ctc {
  const slip = computePayslip(
    {
      month: input.month,
      monthlySalary: input.monthlyGross,
      components: input.components,
      daysInMonth: daysIn(input.month),
      paidDays: daysIn(input.month),
      person: { pfMember: true, esiMember: true, ptApplicable: true, regime: "NEW", oldRegimeDeductions: 0n, age: input.age ?? null },
      ytd: { gross: 0n, tds: 0n, pt: 0n },
      advance: 0n,
    },
    { ...input.settings, tds: { enabled: false } }
  );
  const basicLine = slip.earnings.find((e) => e.code === "BASIC") ?? slip.earnings[0];
  const basic = basicLine ? basicLine.earned : input.monthlyGross;
  const pf = slip.employer.epf + slip.employer.eps + slip.employer.edli + slip.employer.pfAdmin;
  const esi = slip.employer.esi;
  const o = input.options;
  const bonus = o.bonus && input.monthlyGross <= o.bonusEligibleUpTo ? roundRupee(((basic < o.bonusWageCap ? basic : o.bonusWageCap) * 833n * 12n) / 10000n) : 0n;
  const gratuity = o.gratuity ? roundRupee((basic * 481n * 12n) / 10000n) : 0n;
  const employerAnnual = (pf + esi) * 12n;
  return {
    monthlyGross: input.monthlyGross,
    basic,
    employerMonthly: { pf, esi, total: pf + esi },
    takeHomeMonthly: input.monthlyGross - slip.employee.pf - slip.employee.esi - slip.employee.pt,
    annual: { gross: input.monthlyGross * 12n, employer: employerAnnual, bonus, gratuity, ctc: input.monthlyGross * 12n + employerAnnual + bonus + gratuity },
  };
}

/** The monthly gross (whole rupees) that gives a yearly CTC as close as possible without going over. */
export function grossFromCtc(input: Omit<Parameters<typeof ctcFromGross>[0], "monthlyGross"> & { annualCtc: bigint }): Ctc {
  let lo = 0n;
  let hi = input.annualCtc / 12n / 100n + 1n; // rupees; gross never exceeds CTC / 12
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const c = ctcFromGross({ ...input, monthlyGross: mid * 100n });
    if (c.annual.ctc <= input.annualCtc) lo = mid;
    else hi = mid - 1n;
  }
  return ctcFromGross({ ...input, monthlyGross: lo * 100n });
}

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "DAILY_WAGE" | "HOURLY";
export const EMPLOYMENT_TYPES: Array<{ key: EmploymentType; label: string }> = [
  { key: "FULL_TIME", label: "Full time (monthly salary)" },
  { key: "PART_TIME", label: "Part time (monthly amount, absent days cut)" },
  { key: "DAILY_WAGE", label: "Daily wage (paid for days present)" },
  { key: "HOURLY", label: "Paid by the hour (rate x hours worked)" },
];

/**
 * Days paid in a month from the attendance register:
 *  - daily wage: days present (a half day counts half);
 *  - paid by the hour: the whole month, because the pay is already the rate times the hours worked;
 *  - monthly staff (full and part time): days in the month less days marked absent (unpaid).
 * Days with no mark are not cut for monthly staff (weekly off, holiday, not yet marked).
 */
/**
 * What a person's pay would be in a normal month, so a cost to company can be shown for every type of
 * work. Monthly staff: their salary. Daily wage: wage x working days. By the hour: rate x hours a day x
 * working days. The working days and hours a day come from Payroll settings (26 days, 8 hours by default).
 */
export function monthlyGrossFor(
  type: EmploymentType,
  pay: { monthlySalary: bigint; dailyWage: bigint; hourlyRate: bigint },
  normal: { daysAMonth: number; hoursADay: number } = DEFAULT_NORMAL_MONTH
): bigint {
  if (type === "DAILY_WAGE") return pay.dailyWage * BigInt(Math.round(normal.daysAMonth));
  if (type === "HOURLY") return (pay.hourlyRate * BigInt(Math.round(normal.daysAMonth * normal.hoursADay * 10))) / 10n;
  return pay.monthlySalary;
}

/** The normal month used to show a cost to company for wage and hourly staff. */
export const DEFAULT_NORMAL_MONTH = { daysAMonth: 26, hoursADay: 8 };

export function paidDaysFromAttendance(type: EmploymentType, daysInMonth: number, marks: { present: number; half: number; absent: number }): number {
  if (type === "HOURLY") return daysInMonth;
  if (type === "DAILY_WAGE") return Math.min(daysInMonth, marks.present + marks.half / 2);
  return Math.max(0, daysInMonth - marks.absent - marks.half / 2);
}
