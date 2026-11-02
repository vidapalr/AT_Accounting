/** Indian financial year (1 April to 31 March) label for a date given as YYYY-MM-DD, e.g. "2026–27". */
export function financialYearLabel(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, "0")}`;
}
