/** Customer credit: pure maths, money in paise (bigint). */

/** A payment bigger than what the bill still needs: the bill gets what it needs, the rest is kept as credit. */
export function splitPayment(amount: bigint, outstanding: bigint): { toBill: bigint; toCredit: bigint } {
  const room = outstanding > 0n ? outstanding : 0n;
  const toBill = amount < room ? amount : room;
  return { toBill, toCredit: amount - toBill };
}

export type CreditEntry = { type: "RECEIVED" | "USED" | "REFUNDED"; amount: bigint };

/** Received minus used minus paid back. Never shown below zero. */
export function creditBalance(entries: CreditEntry[]): bigint {
  let total = 0n;
  for (const e of entries) total += e.type === "RECEIVED" ? e.amount : -e.amount;
  return total > 0n ? total : 0n;
}

/** How much credit a bill can take: not more than the customer has, not more than the bill still needs. */
export function creditToUse(balance: bigint, billOutstanding: bigint): bigint {
  if (balance <= 0n || billOutstanding <= 0n) return 0n;
  return balance < billOutstanding ? balance : billOutstanding;
}
