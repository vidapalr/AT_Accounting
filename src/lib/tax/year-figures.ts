/** Small year-end helpers (pure). */

/** The 12 months of a tax year as YYYY-MM, April first. */
export function taxYearMonths(taxYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((3 + i) % 12) + 1;
    return `${m >= 4 ? taxYear : taxYear + 1}-${String(m).padStart(2, "0")}`;
  });
}

/** Add daily figures up month by month; months with nothing are zero. */
export function monthTotals<T extends { date: string }>(points: T[], taxYear: number, pick: (p: T) => bigint): Array<{ month: string; amount: bigint }> {
  const totals = new Map(taxYearMonths(taxYear).map((m) => [m, 0n]));
  for (const p of points) {
    const m = p.date.slice(0, 7);
    if (totals.has(m)) totals.set(m, totals.get(m)! + pick(p));
  }
  return [...totals].map(([month, amount]) => ({ month, amount }));
}

const PAN = /^[A-Z]{5}\d{4}[A-Z]$/;
export const isPan = (v: string): boolean => PAN.test(v);

/** PAN typed on the record, or read from a GSTIN (characters 3 to 12). */
export function panOf(pan: string | null | undefined, gstin: string | null | undefined): { pan: string | null; fromGstin: boolean } {
  const typed = String(pan ?? "").trim().toUpperCase();
  if (isPan(typed)) return { pan: typed, fromGstin: false };
  const g = String(gstin ?? "").trim().toUpperCase();
  const fromG = g.length === 15 ? g.slice(2, 12) : "";
  return isPan(fromG) ? { pan: fromG, fromGstin: true } : { pan: null, fromGstin: false };
}

export const monthName = (ym: string): string =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
