/** Terms printed on every bill until the owner changes them (one per line). */
export const DEFAULT_TERMS = [
  "No return or refund.",
  "Only one offer applies at a time: an offer, a coupon or points. They cannot be combined.",
].join("\n");

export const MAX_TERMS = 12;
export const MAX_TERM_LENGTH = 220;

/** Lines of a terms text, trimmed, blanks and any typed numbers removed. */
export function termsLines(body: string | null | undefined): string[] {
  return String(body ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_TERMS)
    .map((l) => l.slice(0, MAX_TERM_LENGTH));
}

/** What the owner typed, made safe to store: numbering and blanks removed, limits applied. */
export function cleanTerms(body: string): string {
  return termsLines(body).join("\n");
}
