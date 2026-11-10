export type Bucket = "overdue" | "today" | "week" | "later";

/** Adds days to a YYYY-MM-DD day (calendar only, no time zones). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Which heading a follow-up goes under. */
export function bucketOf(day: string, today: string): Bucket {
  if (day < today) return "overdue";
  if (day === today) return "today";
  return day <= addDays(today, 7) ? "week" : "later";
}

export const KINDS = ["NOTE", "CALL", "VISIT", "WHATSAPP"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_WORDS: Record<Kind, string> = { NOTE: "Note", CALL: "Phone call", VISIT: "Visit", WHATSAPP: "WhatsApp chat" };
export function cleanKind(v: unknown): Kind {
  return (KINDS as readonly string[]).includes(String(v)) ? (String(v) as Kind) : "NOTE";
}
export function dayOk(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return addDays(v, 0) === v;
}
