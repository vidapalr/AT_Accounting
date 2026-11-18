/**
 * Payroll calculation: one person, one month. Pure (no database), all money in paise (bigint), so it
 * is exact and testable. The rules (rates, ceilings, slabs) come from rules.ts and the company's
 * payroll settings; nothing about one company is written here.
 */
import { ESI_DEFAULTS, PF_CEILINGS, PF_DEFAULTS, taxYearRule, type PtSlab, type TaxRegimeRule } from "./rules.ts";

export type PayrollSettings = {
  pf: { enabled: boolean; employeeRateBps: number; employerRateBps: number; epsRateBps: number; edliRateBps: number; adminRateBps: number; onFullWages: boolean; fiftyPercentRule: boolean; epsAgeLimit: number };
  esi: { enabled: boolean; employeeRateBps: number; employerRateBps: number; wageLimit: bigint; lowDailyWage: bigint };
  pt: { enabled: boolean; slabs: PtSlab[] };
  tds: { enabled: boolean };
};

export const DEFAULT_SETTINGS: PayrollSettings = {
  pf: { enabled: false, ...PF_DEFAULTS, onFullWages: false, fiftyPercentRule: true },
  esi: { enabled: false, ...ESI_DEFAULTS },
  pt: { enabled: false, slabs: [] },
  tds: { enabled: false },
};

/** A part of the salary. percentBps = share of the monthly salary; null = whatever is left (balance). */
export type PayComponent = { code: string; name: string; percentBps: number | null; pfWage: boolean; esiWage: boolean };

export type PayslipInput = {
  month: string; // YYYY-MM
  monthlySalary: bigint;
  components: PayComponent[];
  daysInMonth: number;
  paidDays: number;
  person: { pfMember: boolean; esiMember: boolean; ptApplicable: boolean; regime: "NEW" | "OLD"; oldRegimeDeductions: bigint; age: number | null };
  /** Totals of this person's earlier paid months in the same financial year. */
  ytd: { gross: bigint; tds: bigint; pt: bigint };
  /** Advance to take back this month (it is reduced if the salary cannot cover it). */
  advance: bigint;
  /** ESI: covered from the start of this contribution period even if wages rose above the limit. */
  esiCarriedOver?: boolean;
};

export type EarningLine = { code: string; name: string; full: bigint; earned: bigint };

export type Payslip = {
  earnings: EarningLine[];
  gross: bigint;
  ncpDays: number;
  wages: { pf: bigint; eps: bigint; edli: bigint; esi: bigint };
  employee: { pf: bigint; esi: bigint; pt: bigint; tds: bigint; advance: bigint };
  employer: { epf: bigint; eps: bigint; edli: bigint; pfAdmin: bigint; esi: bigint };
  totalDeductions: bigint;
  net: bigint;
  employerCost: bigint;
  tax: { fyStart: number; projectedGross: bigint; taxable: bigint; annualTax: bigint; regime: "NEW" | "OLD"; assumedRules: boolean };
  notes: string[];
};

// ------------------------------------------------------------------ small helpers

/** Nearest rupee (half up). */
export function roundRupee(p: bigint): bigint {
  const neg = p < 0n;
  const a = neg ? -p : p;
  const r = ((a + 50n) / 100n) * 100n;
  return neg ? -r : r;
}
/** Up to the next rupee. */
export function ceilRupee(p: bigint): bigint {
  return p <= 0n ? 0n : ((p + 99n) / 100n) * 100n;
}
const pct = (p: bigint, bps: number) => (p * BigInt(bps)) / 10000n;
const min = (a: bigint, b: bigint) => (a < b ? a : b);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

export function daysIn(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First year of the Indian financial year (April-March) a month falls in. */
export function fyStartOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return m >= 4 ? y : y - 1;
}

/** Months from this month up to March, this month included. */
export function monthsLeftInFy(month: string): number {
  const m = Number(month.split("-")[1]);
  return m >= 4 ? 12 - m + 4 : 4 - m;
}

/** PF wage ceiling in force on the last day of the month. */
export function pfCeiling(month: string): bigint {
  const last = `${month}-${String(daysIn(month)).padStart(2, "0")}`;
  let c = PF_CEILINGS[0].wageCeiling;
  for (const r of PF_CEILINGS) if (r.from <= last) c = r.wageCeiling;
  return c;
}

/** Splits a monthly salary into its parts; rounding goes to the balance part (or the last part). */
export function splitSalary(monthly: bigint, components: PayComponent[]): Array<{ c: PayComponent; full: bigint }> {
  if (components.length === 0) return [{ c: { code: "BASIC", name: "Basic", percentBps: null, pfWage: true, esiWage: true }, full: monthly }];
  const out = components.map((c) => ({ c, full: c.percentBps === null ? 0n : roundRupee(pct(monthly, c.percentBps)) }));
  const used = out.reduce((t, x) => t + x.full, 0n);
  const balanceIndex = out.findIndex((x) => x.c.percentBps === null);
  const i = balanceIndex >= 0 ? balanceIndex : out.length - 1;
  out[i] = { ...out[i], full: out[i].full + (monthly - used) };
  return out;
}

export function slabTax(income: bigint, rule: TaxRegimeRule): bigint {
  let tax = 0n;
  let lower = 0n;
  for (const s of rule.slabs) {
    const upper = s.upTo ?? income;
    if (income > lower) tax += ((min(income, upper) - lower) * BigInt(s.ratePct)) / 100n;
    if (s.upTo === null || income <= s.upTo) break;
    lower = s.upTo;
  }
  return tax;
}

/** Yearly income tax with rebate (and marginal relief just above the rebate limit) and cess. */
export function annualTax(taxable: bigint, rule: TaxRegimeRule, cessPct: number): bigint {
  if (taxable <= 0n) return 0n;
  let tax = slabTax(taxable, rule);
  if (taxable <= rule.rebateLimit) tax = max(0n, tax - rule.rebateMax);
  else if (rule.marginalRelief) tax = min(tax, taxable - rule.rebateLimit); // never more tax than income above the limit
  return roundRupee(tax + (tax * BigInt(cessPct)) / 100n);
}

export function ptFor(gross: bigint, month: string, slabs: PtSlab[]): bigint {
  const feb = month.endsWith("-02");
  for (const s of slabs) if (s.upTo === null || gross <= s.upTo) return feb && s.februaryAmount !== undefined ? s.februaryAmount : s.amount;
  return 0n;
}

// ------------------------------------------------------------------ the payslip

export function computePayslip(input: PayslipInput, settings: PayrollSettings): Payslip {
  const notes: string[] = [];
  const days = input.daysInMonth;
  const paid = Math.max(0, Math.min(days, input.paidDays));
  const parts = splitSalary(input.monthlySalary, input.components);
  const earnings: EarningLine[] = parts.map(({ c, full }) => ({
    code: c.code,
    name: c.name,
    full,
    earned: paid === days ? full : roundRupee((full * BigInt(Math.round(paid * 100))) / BigInt(days * 100)),
  }));
  const gross = earnings.reduce((t, e) => t + e.earned, 0n);
  const fullGross = input.monthlySalary;

  // ---- PF
  let pfWage = parts.reduce((t, x, i) => (x.c.pfWage ? t + earnings[i].earned : t), 0n);
  if (settings.pf.fiftyPercentRule) pfWage = max(pfWage, roundRupee(gross / 2n)); // Code on Wages: allowances above half count as wages
  const pfOn = settings.pf.enabled && input.person.pfMember && pfWage > 0n;
  const ceiling = pfCeiling(input.month);
  const epfWage = pfOn ? (settings.pf.onFullWages ? pfWage : min(pfWage, ceiling)) : 0n;
  const pensionAge = input.person.age !== null && input.person.age >= settings.pf.epsAgeLimit;
  const epsWage = pfOn && !pensionAge ? min(pfWage, ceiling) : 0n;
  const edliWage = pfOn ? min(pfWage, ceiling) : 0n;
  const empPf = roundRupee(pct(epfWage, settings.pf.employeeRateBps));
  const erTotal = roundRupee(pct(epfWage, settings.pf.employerRateBps));
  const erEps = min(erTotal, roundRupee(pct(epsWage, settings.pf.epsRateBps)));
  const erEpf = erTotal - erEps;
  const edli = roundRupee(pct(edliWage, settings.pf.edliRateBps));
  const pfAdmin = roundRupee(pct(epfWage, settings.pf.adminRateBps));
  if (pensionAge && pfOn) notes.push(`Age ${input.person.age}: no pension (EPS) share; the employer's whole share goes to PF.`);

  // ---- ESI
  const esiWageEarned = parts.reduce((t, x, i) => (x.c.esiWage ? t + earnings[i].earned : t), 0n);
  const esiWageFull = parts.reduce((t, x) => (x.c.esiWage ? t + x.full : t), 0n);
  const esiOn = settings.esi.enabled && input.person.esiMember && esiWageEarned > 0n && (esiWageFull <= settings.esi.wageLimit || input.esiCarriedOver === true);
  const lowWage = paid > 0 && esiWageEarned / BigInt(paid) <= settings.esi.lowDailyWage;
  const empEsi = esiOn && !lowWage ? ceilRupee(pct(esiWageEarned, settings.esi.employeeRateBps)) : 0n;
  const erEsi = esiOn ? ceilRupee(pct(esiWageEarned, settings.esi.employerRateBps)) : 0n;
  if (esiOn && lowWage) notes.push("Average pay for a day is at or below the ESI low-wage limit: no employee ESI share.");

  // ---- Professional tax
  const pt = settings.pt.enabled && input.person.ptApplicable && gross > 0n ? ptFor(gross, input.month, settings.pt.slabs) : 0n;

  // ---- Income tax (TDS), spread evenly over the months left in the year
  const fyStart = fyStartOf(input.month);
  const { rule: year, assumed } = taxYearRule(fyStart);
  const left = monthsLeftInFy(input.month);
  const projectedGross = input.ytd.gross + gross + fullGross * BigInt(left - 1);
  const regimeRule = year[input.person.regime];
  const monthlyPt = settings.pt.enabled && input.person.ptApplicable ? ptFor(fullGross, input.month, settings.pt.slabs) : 0n;
  const projectedPt = input.ytd.pt + pt + monthlyPt * BigInt(left - 1);
  const taxable = max(
    0n,
    projectedGross - regimeRule.standardDeduction - (input.person.regime === "OLD" ? input.person.oldRegimeDeductions + projectedPt : 0n)
  );
  const yearTax = settings.tds.enabled ? annualTax(taxable, regimeRule, year.cessPct) : 0n;
  const tds = settings.tds.enabled ? max(0n, roundRupee((yearTax - input.ytd.tds) / BigInt(left))) : 0n;
  if (settings.tds.enabled && assumed) notes.push(`Income-tax rules for FY ${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")} are not in the app yet; last year's were used. Ask your accountant.`);

  // ---- Advance and net
  const statutory = empPf + empEsi + pt + tds;
  const room = max(0n, gross - statutory);
  const advance = min(max(0n, input.advance), room);
  if (advance < input.advance) notes.push("The advance to take back was reduced so the salary is not negative.");
  const totalDeductions = statutory + advance;
  const net = gross - totalDeductions;
  if (net < 0n) notes.push("Deductions are more than the salary this month. Check the days and the advance.");

  return {
    earnings,
    gross,
    ncpDays: days - paid,
    wages: { pf: epfWage, eps: epsWage, edli: edliWage, esi: esiOn ? esiWageEarned : 0n },
    employee: { pf: empPf, esi: empEsi, pt, tds, advance },
    employer: { epf: erEpf, eps: erEps, edli, pfAdmin, esi: erEsi },
    totalDeductions,
    net,
    employerCost: erEpf + erEps + edli + pfAdmin + erEsi,
    tax: { fyStart, projectedGross, taxable, annualTax: yearTax, regime: input.person.regime, assumedRules: assumed },
    notes,
  };
}

/** Paid days for a month from the joining and leaving dates (whole month when neither falls in it). */
export function defaultPaidDays(month: string, joinedOn: string | null, leftOn: string | null): number {
  const days = daysIn(month);
  const first = `${month}-01`;
  const last = `${month}-${String(days).padStart(2, "0")}`;
  const start = joinedOn && joinedOn > first ? joinedOn : first;
  const end = leftOn && leftOn < last ? leftOn : last;
  if (start > last || end < first || start > end) return 0;
  return Number(end.slice(8, 10)) - Number(start.slice(8, 10)) + 1;
}

/** Whole years of age on the last day of the month, or null when the date of birth is not known. */
export function ageAt(month: string, dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const [y, m] = month.split("-").map(Number);
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const lastDay = daysIn(month);
  let age = y - by;
  if (m < bm || (m === bm && lastDay < bd)) age -= 1;
  return age;
}
