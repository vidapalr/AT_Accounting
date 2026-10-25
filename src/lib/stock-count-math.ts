import { parseQtyMilli } from "./returns-math.ts";

/** Counted quantity typed by staff: blank means "not counted", anything else must be a plain number. */
export function parseCounted(text: string): bigint | null {
  const t = text.trim();
  if (t === "") return null;
  return parseQtyMilli(t);
}

export type CountKind = "MATCH" | "SHORT" | "EXTRA";

/** Counted minus books, in thousandths, and what that means in plain words. */
export function countDifference(booksMilli: bigint, countedMilli: bigint): { diff: bigint; kind: CountKind } {
  const diff = countedMilli - booksMilli;
  return { diff, kind: diff === 0n ? "MATCH" : diff < 0n ? "SHORT" : "EXTRA" };
}

/** Items at or below the minimum they should keep. An item with no minimum is never "low". */
export function isLow(onHandMilli: bigint, levelMilli: bigint | null): boolean {
  return levelMilli !== null && levelMilli > 0n && onHandMilli <= levelMilli;
}
