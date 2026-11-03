/** Quantity prices: 1-3 pieces = usual price, 4-9 = second price, 10 or more = third price. */
export type Tier = 1 | 4 | 10;

export function tierFor(quantity: number): Tier {
  if (quantity >= 10) return 10;
  if (quantity >= 4) return 4;
  return 1;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type TierPrices = { p4: number | null; p10: number | null };

/**
 * The price per piece for 4-9 and for 10 or more. A price typed on the product wins;
 * otherwise the percentage rule is taken off the usual price; otherwise there is none.
 */
export function resolveTierPrices(
  usual: number | null,
  offPercent4: number,
  offPercent10: number,
  own4: number | null,
  own10: number | null
): TierPrices {
  const fromRule = (pct: number) => (usual != null && pct > 0 ? round2(usual * (1 - pct / 100)) : null);
  return { p4: own4 ?? fromRule(offPercent4), p10: own10 ?? fromRule(offPercent10) };
}

/** What to put in the price box for this quantity. A missing tier falls back to the one below it. */
export function priceForQuantity(usual: number | null, tiers: TierPrices | undefined, quantity: number): number | null {
  const tier = tierFor(quantity);
  if (tier === 10) return tiers?.p10 ?? tiers?.p4 ?? usual;
  if (tier === 4) return tiers?.p4 ?? usual;
  return usual;
}
