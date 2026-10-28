/** Pure money maths for the daily cash closing. All amounts are paise (bigint). */

export type ClosingFigures = {
  opening: bigint;
  cashIn: bigint;
  cashOut: bigint;
  takenOut: bigint;
};

/** What should be in the drawer: opening + money in - money out - cash taken to the bank or owner. */
export function expectedCash(f: ClosingFigures): bigint {
  return f.opening + f.cashIn - f.cashOut - f.takenOut;
}

/** Counted minus expected. Negative = short, positive = extra. */
export function cashDifference(expected: bigint, counted: bigint): bigint {
  return counted - expected;
}

/** "12.50" or "1250" style text to paise; throws on anything that is not a plain positive amount with up to 2 decimals. */
export function parseRupees(text: string): bigint {
  const t = text.trim().replace(/,/g, "");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) throw new Error("Invalid amount");
  const [whole, frac = ""] = t.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
}

export const paiseText = (p: bigint) => `${p < 0n ? "-" : ""}${(p < 0n ? -p : p) / 100n}.${String((p < 0n ? -p : p) % 100n).padStart(2, "0")}`;

/**
 * Drawer against the books. Cash taken to the bank or owner is recorded on the daily closing but
 * not in the ledger, so it is taken off the books figure before comparing.
 * Positive difference = more cash counted than the books explain.
 */
export function drawerVsBooks(f: { books: bigint; takenAway: bigint; counted: bigint }) {
  const booksAfterTaken = f.books - f.takenAway;
  return { booksAfterTaken, difference: f.counted - booksAfterTaken };
}
