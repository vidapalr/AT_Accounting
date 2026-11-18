/**
 * Tax years (1 April to 31 March) and the names of the forms that go with them (pure).
 * From tax year 2026-27 the Income-tax Act, 2025 applies: "tax year" replaces the old
 * financial year / assessment year pair, and several forms got new numbers.
 */

/** The tax year a date falls in, as its starting calendar year: 2026-11-18 -> 2026 (= 2026-27). */
export function taxYearOf(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 4 ? y : y - 1;
}

export const taxYearLabel = (start: number): string => `${start}-${String((start + 1) % 100).padStart(2, "0")}`;

export function taxYearRange(start: number): { from: string; to: string } {
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** Accept "2026" from a query string; anything else gives the year of `today`. */
export function parseTaxYear(raw: string | undefined, today: string): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : taxYearOf(today);
}

/** Under the 2025 Act (tax year 2026-27 onwards) or the 1961 Act. */
export const newAct = (start: number): boolean => start >= 2026;

/** Names shown to the owner and the accountant for this tax year. */
export function formNames(start: number) {
  const act = newAct(start);
  return {
    act: act ? "Income-tax Act, 2025" : "Income-tax Act, 1961",
    /** The annual tax statement of TDS, TCS and tax paid. */
    statement: act ? "Form 168 (annual tax statement, was Form 26AS)" : "Form 26AS",
    statementShort: act ? "Form 168" : "Form 26AS",
    /** Opting out of the default new tax regime when there is business income. */
    optOut: act
      ? "the form to opt out of the new tax regime (Form 10-IEA until now; check the new number on the e-filing portal)"
      : "Form 10-IEA",
    advanceTaxSection: act ? "sections 403 to 408" : "sections 207 to 211",
    interestSections: act ? "sections 424 and 425" : "sections 234B and 234C",
  };
}

/** Last date to file the return: 31 July, or 31 October when the accounts must be audited. */
export function returnDueDate(start: number, audited: boolean): string {
  return audited ? `${start + 1}-10-31` : `${start + 1}-07-31`;
}
