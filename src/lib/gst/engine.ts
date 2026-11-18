/**
 * GST sums (pure, no database). Money is integer paise.
 *
 * Selling prices include GST (the tag price is what the customer pays), so the tax is taken out
 * of the price: taxable value = price x 100 / (100 + rate). Same state as the business: half
 * central (CGST) and half state (SGST); another state: all integrated (IGST).
 *
 * Garments and made-ups have a price rule: 5% when the sale value is up to Rs 2,500 a piece,
 * 18% above. The sale value is the value before GST, so the piece is first tested at the lower rate.
 */
import { splitTax } from "../gst.ts";

export type GstScheme = "NOT_REGISTERED" | "REGULAR" | "COMPOSITION";

export type RateRule = {
  /** Usual rate in percent (e.g. 5). Null = not set yet (treated as 0 and flagged). */
  rate: number | null;
  /** Rate above the price limit (e.g. 18). */
  highRate?: number | null;
  /** Value before GST per piece above which the high rate applies, in paise (e.g. Rs 2,500). */
  limit?: bigint | null;
};

export type TaxSplit = { cgst: bigint; sgst: bigint; igst: bigint };
export const ZERO_TAX: TaxSplit = { cgst: 0n, sgst: 0n, igst: 0n };
export const taxTotal = (t: TaxSplit): bigint => t.cgst + t.sgst + t.igst;
export const addTax = (a: TaxSplit, b: TaxSplit): TaxSplit => ({ cgst: a.cgst + b.cgst, sgst: a.sgst + b.sgst, igst: a.igst + b.igst });

/** Basis points of a percent rate (5 -> 500, 2.5 -> 250). */
const bps = (rate: number): bigint => BigInt(Math.round(rate * 100));

/** Rounds a / b to the nearest whole number (halves away from zero). */
export function divRound(a: bigint, b: bigint): bigint {
  if (b === 0n) return 0n;
  const neg = (a < 0n) !== (b < 0n);
  const x = a < 0n ? -a : a;
  const y = b < 0n ? -b : b;
  const q = (x * 2n + y) / (y * 2n);
  return neg ? -q : q;
}

/** Tax inside a price that includes GST. */
export function taxInside(gross: bigint, rate: number): { taxable: bigint; tax: bigint } {
  if (rate <= 0 || gross === 0n) return { taxable: gross, tax: 0n };
  const taxable = divRound(gross * 10000n, 10000n + bps(rate));
  return { taxable, tax: gross - taxable };
}

/** Tax on a value before GST. */
export function taxOnTop(taxable: bigint, rate: number): bigint {
  return rate <= 0 ? 0n : divRound(taxable * bps(rate), 10000n);
}

/**
 * The rate for a piece sold at `grossPerPiece` (price including GST, after discount).
 * With a price rule, the value before GST at the usual rate decides: up to the limit, usual rate; above, the high rate.
 */
export function rateForPiece(rule: RateRule, grossPerPiece: bigint): number {
  const low = rule.rate ?? 0;
  if (rule.highRate == null || rule.limit == null) return low;
  const valueAtLow = taxInside(grossPerPiece, low).taxable;
  return valueAtLow > rule.limit ? rule.highRate : low;
}

/** Same as rateForPiece for a value that is already before GST (purchases, B2B prices). */
export function rateForValue(rule: RateRule, valuePerPiece: bigint): number {
  const low = rule.rate ?? 0;
  if (rule.highRate == null || rule.limit == null) return low;
  return valuePerPiece > rule.limit ? rule.highRate : low;
}

export function splitByState(tax: bigint, sameState: boolean): TaxSplit {
  return splitTax(tax, sameState);
}

/** Share a whole amount over parts in proportion to their weights; the last part takes any odd paise. */
export function shareOut(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((t, w) => t + w, 0n);
  if (sum === 0n || weights.length === 0) return weights.map(() => 0n);
  const out: bigint[] = [];
  let used = 0n;
  weights.forEach((w, i) => {
    if (i === weights.length - 1) out.push(total - used);
    else {
      const part = divRound(total * w, sum);
      out.push(part);
      used += part;
    }
  });
  return out;
}

export type SaleLineIn = {
  /** Line total after the line's own discount, including GST. */
  lineTotal: bigint;
  /** Quantity in thousandths (1 piece = 1000). */
  qtyMilli: bigint;
  rule: RateRule;
  hsn: string | null;
};

export type SaleLineTax = TaxSplit & { rate: number; taxable: bigint; hsn: string | null; billDiscount: bigint };

export type SaleTax = {
  kind: "PLAIN" | "TAX_INVOICE" | "BILL_OF_SUPPLY";
  lines: SaleLineTax[];
  shipping: TaxSplit & { rate: number; taxable: bigint };
  total: TaxSplit;
  taxable: bigint;
  /** Lines with no rate set (taxed at 0% until a rate is entered). */
  missingRate: number;
};

/**
 * GST on one bill. The bill discount is shared over the lines by value; delivery takes the
 * highest rate on the bill (it goes with the goods). Composition: a bill of supply with no tax.
 */
export function saleTax(input: { scheme: GstScheme; sameState: boolean; lines: SaleLineIn[]; billDiscount: bigint; shipping: bigint }): SaleTax {
  const none = (): SaleTax => ({
    kind: input.scheme === "COMPOSITION" ? "BILL_OF_SUPPLY" : "PLAIN",
    lines: input.lines.map((l) => ({ ...ZERO_TAX, rate: 0, taxable: l.lineTotal, hsn: l.hsn, billDiscount: 0n })),
    shipping: { ...ZERO_TAX, rate: 0, taxable: input.shipping },
    total: { ...ZERO_TAX },
    taxable: input.lines.reduce((t, l) => t + l.lineTotal, 0n) - input.billDiscount + input.shipping,
    missingRate: 0,
  });
  if (input.scheme !== "REGULAR") return none();

  const shares = shareOut(input.billDiscount, input.lines.map((l) => (l.lineTotal > 0n ? l.lineTotal : 0n)));
  let missingRate = 0;
  let total = { ...ZERO_TAX };
  let taxable = 0n;
  let topRate = 0;
  const lines = input.lines.map((l, i) => {
    const net = l.lineTotal - shares[i];
    const perPiece = l.qtyMilli > 0n ? divRound(net * 1000n, l.qtyMilli) : net;
    if (l.rule.rate == null) missingRate++;
    const rate = rateForPiece(l.rule, perPiece);
    const { taxable: tv, tax } = taxInside(net, rate);
    const split = splitByState(tax, input.sameState);
    total = addTax(total, split);
    taxable += tv;
    if (rate > topRate) topRate = rate;
    return { ...split, rate, taxable: tv, hsn: l.hsn, billDiscount: shares[i] };
  });
  const ship = taxInside(input.shipping, topRate);
  const shipSplit = splitByState(ship.tax, input.sameState);
  total = addTax(total, shipSplit);
  taxable += ship.taxable;
  return { kind: "TAX_INVOICE", lines, shipping: { ...shipSplit, rate: topRate, taxable: ship.taxable }, total, taxable, missingRate };
}

/**
 * GST given back on a customer return (credit note): the tax inside the money given back, at the
 * rate each item was billed at, and at the delivery rate for any delivery charge given back.
 */
export function returnTax(input: { sameState: boolean; lines: Array<{ refund: bigint; rate: number }>; delivery: bigint; deliveryRate: number }): { goods: TaxSplit; delivery: TaxSplit } {
  let goods = { ...ZERO_TAX };
  for (const l of input.lines) goods = addTax(goods, splitByState(taxInside(l.refund, l.rate).tax, input.sameState));
  return { goods, delivery: splitByState(taxInside(input.delivery, input.deliveryRate).tax, input.sameState) };
}

export type PurchaseTreatment = "NONE" | "REGULAR" | "UNREGISTERED" | "COMPOSITION";

/** How a supplier's bill is treated: only a regular GST supplier's bill carries input credit. */
export function purchaseTreatment(input: { scheme: GstScheme; supplierGstin: string | null; supplierComposition: boolean }): PurchaseTreatment {
  if (input.scheme !== "REGULAR") return "NONE";
  if (!input.supplierGstin) return "UNREGISTERED";
  return input.supplierComposition ? "COMPOSITION" : "REGULAR";
}

export type PurchaseLineIn = { amount: bigint; qtyMilli: bigint; rule: RateRule };

/**
 * GST inside a supplier's bill (line amounts include the GST charged). With a regular GST supplier the
 * tax is input credit; `billTax`, when typed from the bill, is shared over the lines in place of the
 * worked-out figure so the credit matches the supplier's bill to the paisa.
 */
export function purchaseTax(input: { treatment: PurchaseTreatment; sameState: boolean; lines: PurchaseLineIn[]; billTax?: bigint | null }): { lines: Array<TaxSplit & { rate: number }>; total: TaxSplit } {
  if (input.treatment !== "REGULAR") return { lines: input.lines.map(() => ({ ...ZERO_TAX, rate: 0 })), total: { ...ZERO_TAX } };
  const worked = input.lines.map((l) => {
    const grossPerPiece = l.qtyMilli > 0n ? divRound(l.amount * 1000n, l.qtyMilli) : l.amount;
    const rate = rateForPiece(l.rule, grossPerPiece);
    return { rate, tax: taxInside(l.amount, rate).tax };
  });
  const taxes = input.billTax != null && input.billTax >= 0n ? shareOut(input.billTax, worked.map((w) => (w.tax > 0n ? w.tax : 1n))) : worked.map((w) => w.tax);
  let total = { ...ZERO_TAX };
  const lines = worked.map((w, i) => {
    const split = splitByState(taxes[i], input.sameState);
    total = addTax(total, split);
    return { ...split, rate: w.rate };
  });
  return { lines, total };
}

/** Part of a purchase line's input credit that goes with returning part of it. */
export function creditShare(line: { amount: bigint; credit: TaxSplit }, returnedGross: bigint): TaxSplit {
  if (line.amount <= 0n) return { ...ZERO_TAX };
  const f = (x: bigint) => divRound(x * returnedGross, line.amount);
  return { cgst: f(line.credit.cgst), sgst: f(line.credit.sgst), igst: f(line.credit.igst) };
}

/** GST on an expense bill: input credit inside the bill, or reverse charge on top of it. */
export function expenseTax(input: { mode: "NONE" | "ITC" | "RCM"; amount: bigint; rate: number; sameState: boolean; typedTax?: bigint | null }): TaxSplit {
  if (input.mode === "NONE" || input.rate <= 0) return { ...ZERO_TAX };
  const tax = input.typedTax != null ? input.typedTax : input.mode === "ITC" ? taxInside(input.amount, input.rate).tax : taxOnTop(input.amount, input.rate);
  return splitByState(tax, input.sameState);
}

export type SetOff = {
  /** Credit used: from[credit kind][liability kind]. */
  used: { igst: TaxSplit; cgst: TaxSplit; sgst: TaxSplit };
  cash: TaxSplit;
  creditLeft: TaxSplit;
};

/**
 * Setting input credit against GST owed (sections 49, 49A, 49B; rule 88A): integrated credit first
 * against integrated tax, then central and state tax; then central credit against central, then
 * integrated; state credit against state, then integrated. Central and state credit never cross.
 */
export function setOff(liability: TaxSplit, credit: TaxSplit): SetOff {
  const owe = { ...liability };
  const left = { ...credit };
  const used = { igst: { ...ZERO_TAX }, cgst: { ...ZERO_TAX }, sgst: { ...ZERO_TAX } };
  const take = (from: keyof TaxSplit, to: keyof TaxSplit) => {
    const n = left[from] < owe[to] ? left[from] : owe[to];
    if (n <= 0n) return;
    left[from] -= n;
    owe[to] -= n;
    used[from][to] += n;
  };
  take("igst", "igst");
  take("igst", "cgst");
  take("igst", "sgst");
  take("cgst", "cgst");
  take("cgst", "igst");
  take("sgst", "sgst");
  take("sgst", "igst");
  return { used, cash: owe, creditLeft: left };
}

/** Composition tax for a period: rate on turnover, half central and half state. */
export function compositionTax(turnover: bigint, ratePct: number): TaxSplit {
  return splitByState(taxOnTop(turnover, ratePct), true);
}

/** Cost of one unit, to 4 decimals of a rupee, as text for a stock movement ("123.4567"). */
export function unitCost4(totalPaise: bigint, qtyMilli: bigint): string {
  if (qtyMilli <= 0n) return "0.0000";
  const v = divRound(totalPaise * 100n * 1000n, qtyMilli);
  return `${v / 10000n}.${String(v % 10000n).padStart(4, "0")}`;
}
