/**
 * Set-off maths (pure, no database). Money is integer paise.
 * A set-off cancels an amount owed to us against an amount we owe, bill by bill.
 */

export type DueBill = { id: number; date: string; due: bigint };
export type Share = { id: number; amount: bigint };

/** Spread `amount` over the bills, oldest first. Returns null if the bills cannot take that much. */
export function spreadOldestFirst(bills: DueBill[], amount: bigint): Share[] | null {
  if (amount <= 0n) return null;
  let left = amount;
  const shares: Share[] = [];
  for (const b of [...bills].sort((a, c) => a.date.localeCompare(c.date) || a.id - c.id)) {
    if (left === 0n) break;
    if (b.due <= 0n) continue;
    const take = left < b.due ? left : b.due;
    shares.push({ id: b.id, amount: take });
    left -= take;
  }
  return left === 0n ? shares : null;
}

export const totalDue = (bills: DueBill[]): bigint =>
  bills.reduce((s, b) => (b.due > 0n ? s + b.due : s), 0n);

/** The most that can be cancelled: the smaller of the two sides. */
export function maxSetoff(theyOweUs: bigint, weOweThem: bigint): bigint {
  const a = theyOweUs > 0n ? theyOweUs : 0n;
  const b = weOweThem > 0n ? weOweThem : 0n;
  return a < b ? a : b;
}

/** One-line wording for both pages. `net` > 0 means they owe us more. */
export function netSentence(theyOweUs: bigint, weOweThem: bigint, fmt: (p: bigint) => string): string {
  const net = theyOweUs - weOweThem;
  const tail =
    net > 0n ? `Net: they owe us ${fmt(net)}.`
    : net < 0n ? `Net: we owe them ${fmt(-net)}.`
    : "Net: nothing either way.";
  return `They owe us ${fmt(theyOweUs)}, we owe them ${fmt(weOweThem)}. ${tail}`;
}
