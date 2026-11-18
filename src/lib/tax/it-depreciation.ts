/**
 * Income-tax depreciation (pure): written-down value of each block of assets, year by year.
 * Different from the books' straight-line wear (asset-math.ts): tax law uses fixed rates on
 * the block's value, and half the rate for anything put to use for less than 180 days in the year.
 * Rates (Appendix I): furniture and fittings 10%, plant and machinery 15%, cars 15%,
 * computers and software 40%. The owner can change a rate on the screen.
 * Money is integer paise; depreciation is rounded to the rupee.
 */
import { roundRupee } from "../payroll/engine.ts";

export const ASSET_BLOCKS = ["FURNITURE_FITTINGS", "MACHINERY", "COMPUTERS", "VEHICLE", "OTHER"] as const;
export type AssetBlock = (typeof ASSET_BLOCKS)[number];

export const BLOCK_LABELS: Record<AssetBlock, string> = {
  FURNITURE_FITTINGS: "Furniture and fittings",
  MACHINERY: "Plant and machinery",
  COMPUTERS: "Computers and software",
  VEHICLE: "Vehicles (not for hire)",
  OTHER: "Other assets",
};

/** Default rates in percent. "Other" is treated as general plant and machinery. */
export const DEFAULT_IT_RATES: Record<AssetBlock, number> = {
  FURNITURE_FITTINGS: 10,
  MACHINERY: 15,
  COMPUTERS: 40,
  VEHICLE: 15,
  OTHER: 15,
};

export type TaxAsset = {
  block: AssetBlock;
  purchaseDate: string;
  cost: bigint;
  disposedOn: string | null;
  proceeds: bigint;
};

export type BlockYear = {
  block: AssetBlock;
  ratePct: number;
  opening: bigint;
  /** Put to use 180 days or more before 31 March: full rate. */
  additionsFull: bigint;
  /** Put to use less than 180 days before 31 March: half rate. */
  additionsHalf: bigint;
  /** Sale money received for assets of the block sold in the year. */
  sales: bigint;
  depreciation: bigint;
  closing: bigint;
  /** Sale money above the block's value: taxed as a short-term capital gain. */
  capitalGain: bigint;
};

const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;

/** Days the asset is in use in its first tax year, counting the day it was bought and 31 March. */
export function daysInUse(purchaseDate: string, taxYear: number): number {
  return dayNo(`${taxYear + 1}-03-31`) - dayNo(purchaseDate) + 1;
}

/** One block for one year. */
export function blockYear(input: {
  block: AssetBlock;
  ratePct: number;
  opening: bigint;
  additionsFull: bigint;
  additionsHalf: bigint;
  sales: bigint;
}): BlockYear {
  let full = input.opening + input.additionsFull - input.sales;
  let half = input.additionsHalf;
  let capitalGain = 0n;
  if (full < 0n) {
    // Sale money first reduces the older value, then this year's late additions.
    half += full;
    full = 0n;
    if (half < 0n) {
      capitalGain = -half;
      half = 0n;
    }
  }
  const rate = BigInt(Math.round(input.ratePct * 100));
  const depreciation = roundRupee((full * rate) / 10000n + (half * rate) / 20000n);
  return {
    block: input.block,
    ratePct: input.ratePct,
    opening: input.opening,
    additionsFull: input.additionsFull,
    additionsHalf: input.additionsHalf,
    sales: input.sales,
    depreciation,
    closing: full + half - depreciation,
    capitalGain,
  };
}

/**
 * Every block for `taxYear`, rolled forward from `opening` (the written-down values the
 * accountant gives for the first year the app is used). Assets bought before that year are
 * taken to be inside the opening values. With no opening, the roll starts at the first purchase.
 */
export function itDepreciation(input: {
  assets: TaxAsset[];
  rates?: Partial<Record<AssetBlock, number>>;
  opening: { taxYear: number; wdv: Partial<Record<AssetBlock, bigint>> } | null;
  taxYear: number;
}): { rows: BlockYear[]; firstYear: number } {
  const rates = { ...DEFAULT_IT_RATES, ...(input.rates ?? {}) };
  const yearOf = (d: string) => (Number(d.slice(5, 7)) >= 4 ? Number(d.slice(0, 4)) : Number(d.slice(0, 4)) - 1);
  const firstPurchase = input.assets.length ? Math.min(...input.assets.map((a) => yearOf(a.purchaseDate))) : input.taxYear;
  const firstYear = input.opening ? input.opening.taxYear : Math.min(firstPurchase, input.taxYear);
  const carry = new Map<AssetBlock, bigint>(ASSET_BLOCKS.map((b) => [b, input.opening?.wdv[b] ?? 0n]));
  let rows: BlockYear[] = [];
  for (let y = firstYear; y <= input.taxYear; y++) {
    rows = ASSET_BLOCKS.map((block) => {
      const mine = input.assets.filter((a) => a.block === block);
      const bought = mine.filter((a) => yearOf(a.purchaseDate) === y);
      const additionsFull = bought.filter((a) => daysInUse(a.purchaseDate, y) >= 180).reduce((t, a) => t + a.cost, 0n);
      const additionsHalf = bought.filter((a) => daysInUse(a.purchaseDate, y) < 180).reduce((t, a) => t + a.cost, 0n);
      // A sale counts only for assets that are in the block (bought in or after the first year, or in the opening value).
      const sales = mine.filter((a) => a.disposedOn && yearOf(a.disposedOn) === y).reduce((t, a) => t + a.proceeds, 0n);
      const row = blockYear({ block, ratePct: rates[block], opening: carry.get(block) ?? 0n, additionsFull, additionsHalf, sales });
      carry.set(block, row.closing);
      return row;
    });
  }
  return { rows, firstYear };
}
