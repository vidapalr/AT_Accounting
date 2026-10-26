/** Fixed asset maths (pure). Money is integer paise; straight line, month by month. */

export const monthIndex = (ym: string): number => {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
};
export const monthFromIndex = (i: number): string => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export const nextMonth = (ym: string): string => monthFromIndex(monthIndex(ym) + 1);

/** Last day of a YYYY-MM month as YYYY-MM-DD. */
export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Wear charged in total after `months` months of life: the same amount every month,
 * with any odd paise taken in the final month so the total is exactly cost less leftover value.
 */
export function cumulativeDepreciation(cost: bigint, salvage: bigint, lifeMonths: number, months: number): bigint {
  const base = cost - salvage;
  if (base <= 0n || lifeMonths <= 0 || months <= 0) return 0n;
  if (months >= lifeMonths) return base;
  return (base / BigInt(lifeMonths)) * BigInt(months);
}

/**
 * What to charge for `month`, given what has already been charged. Asks "how much should have
 * been charged by the end of this month?" so an asset added late catches up in one go.
 */
export function depreciationDue(
  a: { purchaseMonth: string; cost: bigint; salvage: bigint; lifeMonths: number; chargedSoFar: bigint },
  month: string
): bigint {
  const elapsed = monthIndex(month) - monthIndex(a.purchaseMonth) + 1;
  if (elapsed <= 0) return 0n;
  const due = cumulativeDepreciation(a.cost, a.salvage, a.lifeMonths, elapsed) - a.chargedSoFar;
  return due > 0n ? due : 0n;
}

/** The months still to work out, oldest first, up to and including `upTo`. */
export function monthsToRun(firstMonth: string, lastRunMonth: string | null, upTo: string): string[] {
  const start = lastRunMonth ? nextMonth(lastRunMonth) : firstMonth;
  const out: string[] = [];
  for (let i = monthIndex(start); i <= monthIndex(upTo); i++) out.push(monthFromIndex(i));
  return out;
}

/** What is left on the books: cost less wear. */
export const bookValue = (cost: bigint, charged: bigint): bigint => cost - charged;
