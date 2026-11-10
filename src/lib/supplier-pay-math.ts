/** Splits one payment over a supplier's open bills, oldest first. All amounts are paise. */
export type OpenBill = { id: number; due: bigint };
export type Allocation = { id: number; amount: bigint };

export function allocateOldestFirst(
  bills: OpenBill[],
  amount: bigint
): { allocations: Allocation[]; leftover: bigint } {
  let left = amount;
  const allocations: Allocation[] = [];
  for (const bill of bills) {
    if (left <= 0n) break;
    if (bill.due <= 0n) continue;
    const part = bill.due < left ? bill.due : left;
    allocations.push({ id: bill.id, amount: part });
    left -= part;
  }
  return { allocations, leftover: left };
}

/** Checks hand-typed parts: each within what is due on its bill, and together equal to the amount. */
export function checkManualParts(
  bills: OpenBill[],
  parts: Allocation[],
  amount: bigint
): "ok" | "too-much-on-bill" | "total-differs" | "unknown-bill" {
  let sum = 0n;
  for (const p of parts) {
    const bill = bills.find((b) => b.id === p.id);
    if (!bill) return "unknown-bill";
    if (p.amount <= 0n || p.amount > bill.due) return "too-much-on-bill";
    sum += p.amount;
  }
  return sum === amount ? "ok" : "total-differs";
}
