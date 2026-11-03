export type TimelineKind = "BILL" | "PAYMENT" | "RETURN" | "ONLINE_ORDER" | "APPROVAL" | "MESSAGE" | "CHAT" | "NOTE";

export type TimelineEvent = {
  /** "YYYY-MM-DD HH:MM:SS" (or just the date). Sorted as text, newest first. */
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  href?: string;
};

export const KIND_LABEL: Record<TimelineKind, string> = {
  BILL: "Bill", PAYMENT: "Payment", RETURN: "Return", ONLINE_ORDER: "Website order",
  APPROVAL: "On approval", MESSAGE: "Message sent", CHAT: "WhatsApp chat", NOTE: "Note",
};

/** All events in one list, newest first. Events with no time of day come after timed ones of the same day. */
export function mergeTimeline(events: TimelineEvent[], limit = 150): TimelineEvent[] {
  const key = (e: TimelineEvent) => (e.at.length === 10 ? `${e.at} 00:00:00` : e.at);
  return [...events].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0)).slice(0, limit);
}

/** Phone as the 10 digits used to match a customer to chats and website orders. */
export function last10(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}
