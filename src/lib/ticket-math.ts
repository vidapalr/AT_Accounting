export const TICKET_KINDS = ["COMPLAINT", "EXCHANGE", "ALTERATION", "OTHER"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];
export const KIND_LABEL: Record<TicketKind, string> = {
  COMPLAINT: "Complaint", EXCHANGE: "Exchange request", ALTERATION: "Alteration or repair", OTHER: "Other",
};
export const TICKET_STATUSES = ["OPEN", "WORKING", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open", WORKING: "Being handled", RESOLVED: "Resolved", CLOSED: "Closed",
};

export function cleanTicketKind(v: unknown): TicketKind {
  return (TICKET_KINDS as readonly string[]).includes(String(v)) ? (String(v) as TicketKind) : "OTHER";
}
export function cleanTicketStatus(v: unknown): TicketStatus | null {
  return (TICKET_STATUSES as readonly string[]).includes(String(v)) ? (String(v) as TicketStatus) : null;
}
/** A ticket still needs attention until it is resolved or closed. */
export function isOpenStatus(s: string): boolean {
  return s === "OPEN" || s === "WORKING";
}
/** Only these moves are offered: reopen is allowed from resolved, a closed ticket stays closed. */
export function allowedNext(from: TicketStatus): TicketStatus[] {
  switch (from) {
    case "OPEN": return ["WORKING", "RESOLVED", "CLOSED"];
    case "WORKING": return ["OPEN", "RESOLVED", "CLOSED"];
    case "RESOLVED": return ["OPEN", "CLOSED"];
    default: return [];
  }
}
/** Whole days a ticket has been open (calendar days, India). */
export function daysOpen(createdDay: string, today: string): number {
  const a = Date.UTC(+createdDay.slice(0, 4), +createdDay.slice(5, 7) - 1, +createdDay.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.max(0, Math.round((b - a) / 86400000));
}
