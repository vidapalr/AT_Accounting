/**
 * Selling price bands, worked out from the cost: pure, money in paise.
 * The same factors as stock transfers use (cost + 1% handling, then +30% minimum, +100% maximum).
 * The price typed at buying always fits inside the band: if it is below the minimum, the minimum
 * comes down to it; if it is above the maximum, the maximum goes up to it.
 */
export const BAND = { handling: 101n, min: 130n, max: 200n } as const;

const roundDiv = (n: bigint, d: bigint) => (n + d / 2n) / d;

export function priceBand(costPaise: bigint, pricePaise: bigint): { min: bigint; max: bigint; usual: bigint } {
  let min = roundDiv(costPaise * BAND.handling * BAND.min, 10000n);
  let max = roundDiv(costPaise * BAND.handling * BAND.max, 10000n);
  if (pricePaise < min) min = pricePaise;
  if (pricePaise > max) max = pricePaise;
  return { min, max, usual: pricePaise };
}

/** Unit cost with 4 decimals ("650.5000") to paise, rounded. */
export function cost4ToPaise(unitCost: string): bigint {
  const [w, f = ""] = unitCost.split(".");
  const scaled = BigInt(w) * 10000n + BigInt(f.padEnd(4, "0").slice(0, 4));
  return roundDiv(scaled, 100n);
}
