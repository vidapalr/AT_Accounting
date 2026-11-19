/**
 * One customer's balance: pure maths, money in paise (bigint).
 *
 * Everything that moves money between us and a customer is set off into ONE figure:
 *   unpaid bills  -  credit we hold for them  -  return value not yet given back or used  -  what we owe them as a supplier
 * Above zero they owe us; below zero we owe them. Every screen shows only this net figure,
 * so a person never appears as owing us and being owed by us at the same time.
 */

export type BalanceParts = {
  /** Posted bills less payments recorded on them. */
  billsDue: bigint;
  /** Extra payments kept as credit (received - used - paid back). */
  creditHeld: bigint;
  /** Returns not yet paid back or used on a bill. */
  returnOwed: bigint;
  /** Unpaid supplier bills, when the same person also sells to us (0 if not linked or not allowed to see). */
  supplierOwed: bigint;
};

export type Balance = BalanceParts & { net: bigint };

export const ZERO_PARTS: BalanceParts = { billsDue: 0n, creditHeld: 0n, returnOwed: 0n, supplierOwed: 0n };

/** The customer side alone: bills less credit and return value (before any supplier set-off). */
export const customerSide = (p: BalanceParts): bigint => p.billsDue - p.creditHeld - p.returnOwed;

/** The one figure: above zero they owe us, below zero we owe them. */
export const netBalance = (p: BalanceParts): bigint => customerSide(p) - p.supplierOwed;

export const withNet = (p: BalanceParts): Balance => ({ ...p, net: netBalance(p) });

/** Short words for the figure, the same on every screen. */
export function balanceWords(net: bigint, fmt: (p: bigint) => string): string {
  return net > 0n ? `Owes you ${fmt(net)}` : net < 0n ? `You owe them ${fmt(-net)}` : "Nothing owed either way";
}

/** How the figure was worked out, only the parts that are not zero. */
export function balanceBreakdown(p: BalanceParts, fmt: (p: bigint) => string): string {
  const parts: string[] = [];
  if (p.billsDue !== 0n) parts.push(p.billsDue > 0n ? `unpaid bills ${fmt(p.billsDue)}` : `overpaid bills ${fmt(-p.billsDue)}`);
  if (p.returnOwed > 0n) parts.push(`less returns not yet given back ${fmt(p.returnOwed)}`);
  if (p.creditHeld > 0n) parts.push(`less credit we hold ${fmt(p.creditHeld)}`);
  if (p.supplierOwed > 0n) parts.push(`less what we owe them as a supplier ${fmt(p.supplierOwed)}`);
  return parts.length > 1 ? `Worked out from: ${parts.join(", ")}.` : "";
}

/**
 * Totals for the dashboard. Each person counts once, on one side only.
 * - owedToUs: people whose net is above zero.
 * - owedToCustomers: returns and credit we owe people who are not owed anything as a supplier.
 * - supplierSetoff: what linked people owe us that is cancelled against what we owe them as suppliers
 *   (take this off the suppliers figure so they are not counted on both tiles).
 */
export function balanceTotals(balances: Iterable<BalanceParts>): { owedToUs: bigint; owedToCustomers: bigint; supplierSetoff: bigint } {
  let owedToUs = 0n, owedToCustomers = 0n, supplierSetoff = 0n;
  for (const p of balances) {
    const side = customerSide(p);
    if (side < 0n) { owedToCustomers += -side; continue; }
    const setoff = side < p.supplierOwed ? side : p.supplierOwed;
    supplierSetoff += setoff;
    owedToUs += side - setoff;
  }
  return { owedToUs, owedToCustomers, supplierSetoff };
}
