/**
 * Approval rules: pure functions, no database. Money in paise (bigint).
 *
 * The chain: a cashier asks, the accountant checks and passes it on, then the division
 * manager or the owner approves for good. The owner may also approve straight away.
 * Nobody approves their own request.
 */
export type ApprovalKind = "EXPENSE" | "SUPPLIER_PAYMENT" | "CASH_TAKEN" | "OWNER_MONEY";
export const APPROVAL_KINDS: ApprovalKind[] = ["EXPENSE", "SUPPLIER_PAYMENT", "CASH_TAKEN", "OWNER_MONEY"];
export const KIND_LABEL: Record<ApprovalKind, string> = {
  EXPENSE: "Expense",
  SUPPLIER_PAYMENT: "Payment to a supplier",
  CASH_TAKEN: "Cash taken out",
  OWNER_MONEY: "Owner money in or out",
};
/** Which kinds can be sent for approval and posted by themselves today. */
export const LIVE_KINDS: ApprovalKind[] = ["EXPENSE"];

export type RequestStatus = "WAITING_CHECK" | "WAITING_FINAL" | "APPROVED" | "REJECTED" | "CANCELLED" | "FAILED";

export const limitKey = (kind: ApprovalKind) => `approval_limit_${kind}`;

/** Limit in paise, or null when no limit is set (then nothing needs approval). */
export function parseLimit(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value.trim() === "") return null;
  return /^\d{1,15}$/.test(value.trim()) ? BigInt(value.trim()) : null;
}

/** "5000" or "5000.50" (rupees) to paise, or null when blank. Throws on anything else. */
export function rupeesToLimit(text: string): bigint | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) throw new Error("Enter a rupee amount like 5000");
  const [w, f = ""] = t.split(".");
  return BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
}

/** The owner never needs approval. Everyone else does when the amount is above the limit. */
export function needsApproval(role: string, limit: bigint | null, amount: bigint): boolean {
  if (role === "GROUP_OWNER") return false;
  if (limit === null) return false;
  return amount > limit;
}

/** Where a new request starts. A cashier's request is checked by the accountant first. */
export function firstStatus(requesterRole: string): RequestStatus {
  return requesterRole === "CASHIER" ? "WAITING_CHECK" : "WAITING_FINAL";
}

export type RequestView = { status: RequestStatus; requestedBy: number };

/** The accountant checks and passes it on. Not their own request. */
export function canCheck(role: string, userId: number, r: RequestView): boolean {
  return role === "ACCOUNTANT" && r.status === "WAITING_CHECK" && r.requestedBy !== userId;
}

/** Final approval: the division manager (after the check) or the owner (at any waiting step). Not their own request. */
export function canFinalApprove(role: string, userId: number, r: RequestView): boolean {
  if (r.requestedBy === userId) return false;
  if (role === "GROUP_OWNER") return r.status === "WAITING_CHECK" || r.status === "WAITING_FINAL";
  if (role === "DIVISION_MANAGER") return r.status === "WAITING_FINAL";
  return false;
}

/** Anyone who could act may also reject. */
export function canReject(role: string, userId: number, r: RequestView): boolean {
  return canCheck(role, userId, r) || canFinalApprove(role, userId, r);
}

/** The person who asked can withdraw it while it still waits. */
export function canCancel(userId: number, r: RequestView): boolean {
  return r.requestedBy === userId && (r.status === "WAITING_CHECK" || r.status === "WAITING_FINAL");
}

export const STATUS_WORDS: Record<RequestStatus, string> = {
  WAITING_CHECK: "Waiting for the accountant",
  WAITING_FINAL: "Waiting for the division manager or owner",
  APPROVED: "Approved and posted",
  REJECTED: "Rejected",
  CANCELLED: "Withdrawn",
  FAILED: "Approved but could not be posted",
};
