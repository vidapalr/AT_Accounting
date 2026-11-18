/**
 * Loan repayment schedule (pure): monthly instalment, and how much of each instalment is interest.
 * Used to check the lender's interest certificate for the year. Money is integer paise.
 */
import { roundRupee } from "../payroll/engine.ts";

export type ScheduleRow = { month: string; opening: bigint; instalment: bigint; interest: bigint; principal: bigint; closing: bigint };

const addMonths = (ym: string, n: number): string => {
  const [y, m] = ym.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
};

/** Equal monthly instalment for a loan (rate in basis points a year, e.g. 1050 = 10.5%). */
export function monthlyInstalment(principal: bigint, rateBps: number, months: number): bigint {
  if (months <= 0 || principal <= 0n) return 0n;
  if (rateBps <= 0) return roundRupee(principal / BigInt(months));
  const r = rateBps / 10000 / 12;
  const p = Number(principal);
  const emi = (p * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return roundRupee(BigInt(Math.round(emi)));
}

/**
 * Month-by-month schedule. Interest each month is the balance x rate / 12, rounded to the rupee;
 * the last instalment clears whatever is left. `instalment` may be given when the lender's
 * figure differs slightly from the formula.
 */
export function loanSchedule(input: {
  principal: bigint;
  rateBps: number;
  months: number;
  firstMonth: string;
  instalment?: bigint | null;
}): ScheduleRow[] {
  const emi = input.instalment && input.instalment > 0n ? input.instalment : monthlyInstalment(input.principal, input.rateBps, input.months);
  const rows: ScheduleRow[] = [];
  let balance = input.principal;
  for (let i = 0; i < input.months && balance > 0n; i++) {
    const interest = roundRupee((balance * BigInt(input.rateBps)) / 120000n);
    const last = i === input.months - 1;
    let principal = emi - interest;
    if (principal < 0n) principal = 0n;
    if (last || principal > balance) principal = balance;
    const instalment = principal + interest;
    rows.push({ month: addMonths(input.firstMonth, i), opening: balance, instalment, interest, principal, closing: balance - principal });
    balance -= principal;
  }
  return rows;
}

/** Totals for one tax year (April to March) from a schedule. */
export function yearTotals(rows: ScheduleRow[], taxYear: number): { interest: bigint; principal: bigint; opening: bigint; closing: bigint; instalments: number } {
  const from = `${taxYear}-04`;
  const to = `${taxYear + 1}-03`;
  const inYear = rows.filter((r) => r.month >= from && r.month <= to);
  const before = rows.filter((r) => r.month < from);
  const opening = inYear[0]?.opening ?? (before.length ? before[before.length - 1].closing : rows[0]?.month > to ? rows[0].opening : 0n);
  const closing = inYear.length ? inYear[inYear.length - 1].closing : opening;
  return {
    interest: inYear.reduce((t, r) => t + r.interest, 0n),
    principal: inYear.reduce((t, r) => t + r.principal, 0n),
    opening,
    closing,
    instalments: inYear.length,
  };
}
