// Pure helpers for financial years (April to March) and their 12 months.
export function yearLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function generatePeriods(startYear: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = 3 + index;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month - 1, 1))
    );
    return {
      periodNo: index + 1,
      periodName: `${monthName} ${year}`,
      start: `${pad(year, 4)}-${pad(month)}-01`,
      end: `${pad(year, 4)}-${pad(month)}-${pad(endDay)}`,
    };
  });
}

/** The April-start year that follows the latest year's end date (YYYY-MM-DD). */
export function nextYearStart(latestEndsOn: string): number {
  return Number(latestEndsOn.slice(0, 4)) + (Number(latestEndsOn.slice(5, 7)) >= 4 ? 1 : 0);
}
