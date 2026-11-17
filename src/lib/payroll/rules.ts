/**
 * Statutory payroll rules for India, with the date each one starts. These are the LAW, not a company's
 * choice, so they live here once; a company can still switch each statute on or off and change rates
 * on Staff > Payroll settings (stored in acct_business_settings) if a notification changes them.
 *
 * Checked 17 Nov 2026:
 *  - EPF/EPS/EDLI: 12% employee, 12% employer of which 8.33% to EPS; EDLI 0.5%; wage ceiling Rs 15,000,
 *    raised to Rs 25,000 from 17 Sep 2026 (Code on Social Security, S.O. 5109(E)). EPS stops at age 58.
 *  - ESI: 0.75% employee, 3.25% employer, for wages up to Rs 21,000 a month; no employee share when the
 *    average daily wage is Rs 176 or less; each share rounded up to the next rupee.
 *  - Income tax FY 2025-26 and FY 2026-27 (unchanged by Budget 2026): new regime slabs 4/8/12/16/20/24 lakh
 *    at 0-30%, standard deduction Rs 75,000, rebate up to Rs 60,000 when taxable income is at most
 *    Rs 12 lakh; old regime 2.5/5/10 lakh, standard deduction Rs 50,000, rebate Rs 12,500 up to Rs 5 lakh;
 *    health and education cess 4%. From FY 2026-27 the salary certificate is Form 130 (was Form 16) and the
 *    quarterly statement is Form 138 (was Form 24Q), under the Income-tax Act, 2025.
 *  - Professional tax presets: Telangana and Andhra Pradesh (nil up to Rs 15,000, Rs 150 up to Rs 20,000,
 *    Rs 200 above). Other states: enter the slabs on Payroll settings.
 * Amounts are paise (bigint); rates are basis points (1% = 100).
 */

export const R = (rupees: number): bigint => BigInt(Math.round(rupees * 100));

export type PfRule = { from: string; wageCeiling: bigint };
export const PF_CEILINGS: PfRule[] = [
  { from: "2014-09-01", wageCeiling: R(15000) },
  { from: "2026-09-17", wageCeiling: R(25000) },
];

export const PF_DEFAULTS = {
  employeeRateBps: 1200,
  employerRateBps: 1200,
  epsRateBps: 833,
  edliRateBps: 50,
  adminRateBps: 50,
  epsAgeLimit: 58,
};

export const ESI_DEFAULTS = {
  employeeRateBps: 75,
  employerRateBps: 325,
  wageLimit: R(21000),
  lowDailyWage: R(176),
};

export type Slab = { upTo: bigint | null; ratePct: number };
export type TaxRegimeRule = { slabs: Slab[]; standardDeduction: bigint; rebateLimit: bigint; rebateMax: bigint };
export type TaxYearRule = { NEW: TaxRegimeRule; OLD: TaxRegimeRule; cessPct: number; certificate: string; quarterly: string };

const NEW_2025: TaxRegimeRule = {
  slabs: [
    { upTo: R(400000), ratePct: 0 },
    { upTo: R(800000), ratePct: 5 },
    { upTo: R(1200000), ratePct: 10 },
    { upTo: R(1600000), ratePct: 15 },
    { upTo: R(2000000), ratePct: 20 },
    { upTo: R(2400000), ratePct: 25 },
    { upTo: null, ratePct: 30 },
  ],
  standardDeduction: R(75000),
  rebateLimit: R(1200000),
  rebateMax: R(60000),
};
const OLD_2025: TaxRegimeRule = {
  slabs: [
    { upTo: R(250000), ratePct: 0 },
    { upTo: R(500000), ratePct: 5 },
    { upTo: R(1000000), ratePct: 20 },
    { upTo: null, ratePct: 30 },
  ],
  standardDeduction: R(50000),
  rebateLimit: R(500000),
  rebateMax: R(12500),
};

/** Keyed by financial year start, e.g. "2026" = FY 2026-27. */
export const TAX_YEARS: Record<string, TaxYearRule> = {
  "2025": { NEW: NEW_2025, OLD: OLD_2025, cessPct: 4, certificate: "Form 16", quarterly: "Form 24Q" },
  "2026": { NEW: NEW_2025, OLD: OLD_2025, cessPct: 4, certificate: "Form 130", quarterly: "Form 138" },
};

/** The rule for a financial year; a later year not yet listed uses the newest one (flagged as assumed). */
export function taxYearRule(fyStart: number): { rule: TaxYearRule; assumed: boolean } {
  const key = String(fyStart);
  if (TAX_YEARS[key]) return { rule: TAX_YEARS[key], assumed: false };
  const years = Object.keys(TAX_YEARS).map(Number).sort((a, b) => a - b);
  const pick = years.filter((y) => y <= fyStart).pop() ?? years[0];
  return { rule: TAX_YEARS[String(pick)], assumed: true };
}

export type PtSlab = { upTo: bigint | null; amount: bigint; februaryAmount?: bigint };

export const PT_PRESETS: Record<string, { label: string; slabs: PtSlab[] }> = {
  TELANGANA: { label: "Telangana", slabs: [{ upTo: R(15000), amount: 0n }, { upTo: R(20000), amount: R(150) }, { upTo: null, amount: R(200) }] },
  ANDHRA_PRADESH: { label: "Andhra Pradesh", slabs: [{ upTo: R(15000), amount: 0n }, { upTo: R(20000), amount: R(150) }, { upTo: null, amount: R(200) }] },
};

/** "15000=0; 20000=150; *=200" (and "*=200/300" for a different February amount) <-> slabs. */
export function parsePtSlabs(text: string): PtSlab[] | null {
  const parts = text.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const slabs: PtSlab[] = [];
  for (const p of parts) {
    const m = /^(\*|\d{1,7})\s*=\s*(\d{1,5})(?:\s*\/\s*(\d{1,5}))?$/.exec(p);
    if (!m) return null;
    slabs.push({ upTo: m[1] === "*" ? null : R(Number(m[1])), amount: R(Number(m[2])), ...(m[3] ? { februaryAmount: R(Number(m[3])) } : {}) });
  }
  if (slabs[slabs.length - 1].upTo !== null) return null;
  for (let i = 1; i < slabs.length - 1; i++) if ((slabs[i].upTo as bigint) <= (slabs[i - 1].upTo as bigint)) return null;
  return slabs;
}

export function formatPtSlabs(slabs: PtSlab[]): string {
  const rs = (p: bigint) => String(p / 100n);
  return slabs.map((s) => `${s.upTo === null ? "*" : rs(s.upTo)}=${rs(s.amount)}${s.februaryAmount !== undefined ? `/${rs(s.februaryAmount)}` : ""}`).join("; ");
}
