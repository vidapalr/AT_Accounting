export const SOURCES = ["WALK_IN", "WHATSAPP", "INSTAGRAM", "FACEBOOK", "WEBSITE", "REFERRAL", "OTHER"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  WALK_IN: "Walked in", WHATSAPP: "WhatsApp", INSTAGRAM: "Instagram", FACEBOOK: "Facebook",
  WEBSITE: "Website", REFERRAL: "Someone told them", OTHER: "Other",
};
export const STATUSES = ["NEW", "FOLLOW_UP", "WON", "LOST"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = { NEW: "New", FOLLOW_UP: "To follow up", WON: "Bought", LOST: "Not interested" };

export function cleanSource(v: unknown): Source {
  return (SOURCES as readonly string[]).includes(String(v)) ? (String(v) as Source) : "OTHER";
}

/** A lead that is still open and whose follow-up day has come (or passed). */
export function isDue(status: string, followUpOn: string | null, today: string): boolean {
  return (status === "NEW" || status === "FOLLOW_UP") && !!followUpOn && followUpOn <= today;
}
