/**
 * Advance tax (pure): an estimate of the year's income tax from the profit in the books, and
 * how much of it is due by each instalment date. Money is integer paise.
 *
 * Instalments (unchanged under the 2025 Act): 15% by 15 June, 45% by 15 September, 75% by
 * 15 December, 100% by 15 March. A business on presumptive income pays 100% by 15 March.
 * No advance tax is needed when the year's tax after TDS is under ₹10,000.
 * Interest for paying an instalment late or short: 1% a month (section 425, was 234C).
 *
 * This is an estimate to plan cash, not a tax computation: the accountant confirms the figure.
 */
import { annualTax, roundRupee } from "../payroll/engine.ts";
import { R, taxYearRule } from "../payroll/rules.ts";

export type LegalForm = "PROPRIETORSHIP" | "PARTNERSHIP" | "LLP" | "COMPANY" | "OTHER";
export type Regime = "NEW" | "OLD";
/** Company tax option: the 22% scheme, 25% (smaller companies) or 30%. */
export type CompanyScheme = "22" | "25" | "30";

export type TaxEstimate = {
  income: bigint;
  tax: bigint;
  surcharge: bigint;
  cess: bigint;
  total: bigint;
  /** Plain words: which rate was used. */
  basis: string;
  /** True when the figure skips something (marginal relief on surcharge, a later year's slabs). */
  approximate: boolean;
};

const pct = (amount: bigint, bps: number): bigint => (amount * BigInt(bps)) / 10000n;
const ZERO: Omit<TaxEstimate, "basis"> = { income: 0n, tax: 0n, surcharge: 0n, cess: 0n, total: 0n, approximate: false };

function surchargeBps(form: LegalForm, income: bigint, regime: Regime, scheme: CompanyScheme): number {
  if (form === "COMPANY") {
    if (scheme === "22") return 1000;
    if (income > R(100000000)) return 1200;
    if (income > R(10000000)) return 700;
    return 0;
  }
  if (form === "PARTNERSHIP" || form === "LLP" || form === "OTHER") return income > R(10000000) ? 1200 : 0;
  // Individual owner
  if (income > R(50000000)) return regime === "NEW" ? 2500 : 3700;
  if (income > R(20000000)) return 2500;
  if (income > R(10000000)) return 1500;
  if (income > R(5000000)) return 1000;
  return 0;
}

/** Income tax on a year's business income for the kind of business. */
export function estimateTax(input: {
  legalForm: LegalForm;
  income: bigint;
  taxYear: number;
  regime?: Regime;
  companyScheme?: CompanyScheme;
}): TaxEstimate {
  const regime = input.regime ?? "NEW";
  const scheme = input.companyScheme ?? "22";
  const income = roundRupee(input.income);
  if (income <= 0n) return { ...ZERO, basis: "No profit, so no tax." };

  if (input.legalForm === "PROPRIETORSHIP") {
    const { rule, assumed } = taxYearRule(input.taxYear);
    const r = rule[regime];
    // annualTax adds cess; work the parts out separately so surcharge sits before cess.
    const beforeCess = annualTax(income, r, 0);
    const scBps = surchargeBps("PROPRIETORSHIP", income, regime, scheme);
    const surcharge = roundRupee(pct(beforeCess, scBps));
    const cess = roundRupee(((beforeCess + surcharge) * BigInt(rule.cessPct)) / 100n);
    return {
      income,
      tax: beforeCess,
      surcharge,
      cess,
      total: beforeCess + surcharge + cess,
      basis: `Owner's slabs, ${regime === "NEW" ? "new" : "old"} tax regime, plus ${rule.cessPct}% cess${scBps ? ` and ${scBps / 100}% surcharge` : ""}.`,
      approximate: assumed || scBps > 0,
    };
  }

  const rateBps = input.legalForm === "COMPANY" ? Number(scheme) * 100 : 3000;
  const tax = roundRupee(pct(income, rateBps));
  const scBps = surchargeBps(input.legalForm, income, regime, scheme);
  const surcharge = roundRupee(pct(tax, scBps));
  const cess = roundRupee(pct(tax + surcharge, 400));
  const who = input.legalForm === "COMPANY" ? "Company" : input.legalForm === "LLP" ? "LLP" : input.legalForm === "PARTNERSHIP" ? "Partnership firm" : "Business";
  return {
    income,
    tax,
    surcharge,
    cess,
    total: tax + surcharge + cess,
    basis: `${who} rate ${rateBps / 100}%${scBps ? ` plus ${scBps / 100}% surcharge` : ""} plus 4% cess.`,
    approximate: scBps > 0 && input.legalForm !== "COMPANY",
  };
}

/** The whole year's profit, from the profit so far, assuming the rest of the year runs at the same pace. */
export function projectYearProfit(profitSoFar: bigint, taxYear: number, today: string): { projected: bigint; share: number } {
  const start = Date.UTC(taxYear, 3, 1);
  const end = Date.UTC(taxYear + 1, 3, 1);
  const now = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000);
  const done = Math.min(days, Math.max(1, Math.round((now - start) / 86400000) + 1));
  if (done >= days) return { projected: profitSoFar, share: 1 };
  return { projected: (profitSoFar * BigInt(days)) / BigInt(done), share: done / days };
}

export const ADVANCE_TAX_THRESHOLD = R(10000);

export type InstalmentRow = {
  due: string;
  /** Share of the year's tax that should be paid by this date. */
  cumulativePct: number;
  cumulativeDue: bigint;
  paidByDue: bigint;
  shortfall: bigint;
  status: "PAID" | "SHORT" | "NEXT" | "LATER";
  /** Interest for this instalment at 1% a month if left short (estimate). */
  interest: bigint;
};

export type InstalmentPlan = {
  netTax: bigint;
  notRequired: boolean;
  rows: InstalmentRow[];
  paidTotal: bigint;
  next: { due: string; amount: bigint } | null;
  interestTotal: bigint;
};

/** Dates and cumulative shares for a tax year. */
export function instalmentDates(taxYear: number, presumptive: boolean): Array<{ due: string; pct: number; months: number; toleratedPct: number }> {
  if (presumptive) return [{ due: `${taxYear + 1}-03-15`, pct: 100, months: 1, toleratedPct: 100 }];
  return [
    { due: `${taxYear}-06-15`, pct: 15, months: 3, toleratedPct: 12 },
    { due: `${taxYear}-09-15`, pct: 45, months: 3, toleratedPct: 36 },
    { due: `${taxYear}-12-15`, pct: 75, months: 3, toleratedPct: 75 },
    { due: `${taxYear + 1}-03-15`, pct: 100, months: 1, toleratedPct: 100 },
  ];
}

/**
 * What should have been paid by each date, what was paid, and what to pay next.
 * `netTax` is the year's tax less TDS already taken from the business's receipts.
 */
export function planInstalments(input: {
  taxYear: number;
  netTax: bigint;
  presumptive: boolean;
  payments: Array<{ date: string; amount: bigint }>;
  today: string;
}): InstalmentPlan {
  const netTax = input.netTax > 0n ? input.netTax : 0n;
  const paidTotal = input.payments.reduce((t, p) => t + p.amount, 0n);
  const notRequired = netTax < ADVANCE_TAX_THRESHOLD;
  let nextTaken = false;
  let interestTotal = 0n;
  const rows: InstalmentRow[] = instalmentDates(input.taxYear, input.presumptive).map((d) => {
    const cumulativeDue = notRequired ? 0n : roundRupee((netTax * BigInt(d.pct)) / 100n);
    // Tax paid by 31 March still counts as advance tax for the March instalment.
    const cutOff = d.pct === 100 ? `${input.taxYear + 1}-03-31` : d.due;
    const paidByDue = input.payments.filter((p) => p.date <= cutOff).reduce((t, p) => t + p.amount, 0n);
    const shortfall = cumulativeDue > paidByDue ? cumulativeDue - paidByDue : 0n;
    const passed = input.today > cutOff;
    let status: InstalmentRow["status"];
    if (shortfall === 0n) status = "PAID";
    else if (passed) status = "SHORT";
    else if (!nextTaken) {
      status = "NEXT";
      nextTaken = true;
    } else status = "LATER";
    // Interest (estimate): not charged when the paid share reaches the tolerated share (12% / 36%).
    let interest = 0n;
    if (status === "SHORT" || status === "NEXT" || status === "LATER") {
      const tolerated = roundRupee((netTax * BigInt(d.toleratedPct)) / 100n);
      if (passed && paidByDue < tolerated) {
        const base = (shortfall / R(100)) * R(100); // rounded down to a hundred rupees
        interest = (base * BigInt(d.months)) / 100n;
      }
    }
    interestTotal += interest;
    return { due: d.due, cumulativePct: d.pct, cumulativeDue, paidByDue, shortfall, status, interest };
  });
  const nextRow = rows.find((r) => r.status === "NEXT");
  return {
    netTax,
    notRequired,
    rows,
    paidTotal,
    next: nextRow ? { due: nextRow.due, amount: nextRow.shortfall } : null,
    interestTotal,
  };
}

/** Days from today to a due date (negative when it has passed). */
export function daysUntil(today: string, due: string): number {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

/** The next advance tax date within `withinDays` of today (for a reminder), or null. */
export function upcomingInstalment(today: string, presumptive: boolean, withinDays = 10): { due: string; days: number } | null {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const taxYear = m >= 4 ? y : y - 1;
  for (const d of instalmentDates(taxYear, presumptive)) {
    const days = daysUntil(today, d.due);
    if (days >= 0 && days <= withinDays) return { due: d.due, days };
  }
  return null;
}
