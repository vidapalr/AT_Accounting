/** Purchase order maths (pure). Quantity has 3 decimals, unit cost 4, amounts are paise. */

export type OrderLine = { variantId: number; quantity: string; unitCost: string; lineAmount: string };

function scaled(value: string, scale: number, maxWhole: number): bigint | null {
  if (!new RegExp(`^\\d{1,${maxWhole}}(?:\\.\\d{1,${scale}})?$`).test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}
function text(value: bigint, scale: number): string {
  const unit = 10n ** BigInt(scale);
  return `${value / unit}.${String(value % unit).padStart(scale, "0")}`;
}

/** Turn the typed rows into saved lines. Blank rows are skipped; a bad or repeated row makes the whole thing null. */
export function parseOrderLines(rows: { variant: string; quantity: string; cost: string }[]): OrderLine[] | null {
  const out: OrderLine[] = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (!r.variant && !r.quantity && !r.cost) continue;
    const variantId = /^[1-9]\d*$/.test(r.variant) ? Number(r.variant) : null;
    const q = scaled(r.quantity, 3, 11);
    const c = scaled(r.cost, 4, 14);
    if (variantId === null || q === null || q <= 0n || c === null || c <= 0n || seen.has(variantId)) return null;
    seen.add(variantId);
    out.push({ variantId, quantity: text(q, 3), unitCost: text(c, 4), lineAmount: text((q * c + 50000n) / 100000n, 2) });
  }
  return out.length > 0 ? out : null;
}

export const orderTotalPaise = (lines: OrderLine[]): bigint =>
  lines.reduce((s, l) => s + BigInt(l.lineAmount.replace(".", "")), 0n);
