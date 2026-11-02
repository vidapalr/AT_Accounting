/**
 * Money and quantity maths for customer returns. Pure and exact:
 * paise are bigint, quantities are thousandths (milli) as bigint.
 *
 * A return is split across a line proportionally. Values are worked out on
 * the cumulative quantity returned and the difference taken, so many small
 * returns of one line always add up to exactly the whole line, never a
 * paisa more or less.
 */

export function parseQtyMilli(value: string): bigint {
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(value)) throw new Error(`Invalid quantity: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
}

export function parsePaise(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) throw new Error(`Invalid amount: ${value}`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

/** total x part / whole, rounded half up. */
export function proportion(total: bigint, part: bigint, whole: bigint): bigint {
  if (whole <= 0n) throw new Error("Cannot divide by a zero quantity");
  return (total * part * 2n + whole) / (whole * 2n);
}

/**
 * Spread `total` over the lines in proportion to `weights` so the shares add up to `total` to the paisa
 * (largest remainder: lines with the biggest leftover fraction get the spare paise). Ties go to the earlier line.
 */
export function allocateExact(weights: bigint[], total: bigint): bigint[] {
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (sum <= 0n || total === 0n) return weights.map(() => 0n);
  const sign = total < 0n ? -1n : 1n;
  const abs = total * sign;
  const base = weights.map((w) => (abs * w) / sum);
  const rest = weights.map((w, i) => ({ i, r: (abs * w) % sum }));
  let left = abs - base.reduce((a, b) => a + b, 0n);
  rest.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of rest) {
    if (left <= 0n) break;
    base[i] += 1n;
    left -= 1n;
  }
  return base.map((v) => v * sign);
}

export type LineSale = {
  soldMilli: bigint;
  unitPricePaise: bigint;
  /** line_total from the invoice: gross less the line's own discount. */
  lineTotalPaise: bigint;
  /** sum of line_total over all lines of the invoice */
  sumLineTotalsPaise: bigint;
  /** invoice grand total (after every discount) */
  grandTotalPaise: bigint;
  totalCostPaise: bigint;
  /**
   * What the customer paid for this whole line (its share of the grand total), worked out once over all
   * the lines with allocateExact so the shares add up to the bill exactly. When absent it is computed here.
   */
  paidAllPaise?: bigint;
};

export type ReturnValues = {
  /** selling value at list price: reverses Sales */
  gross: bigint;
  /** what the customer actually paid for these pieces */
  refund: bigint;
  /** cost of these pieces when they were sold */
  cost: bigint;
};

export function returnLineValues(
  sale: LineSale,
  alreadyReturnedMilli: bigint,
  returningMilli: bigint
): ReturnValues {
  if (returningMilli <= 0n) throw new Error("Return quantity must be above zero");
  const after = alreadyReturnedMilli + returningMilli;
  if (after > sale.soldMilli) throw new Error("Cannot return more than was sold");

  const grossAll = (sale.soldMilli * sale.unitPricePaise + 500n) / 1000n;
  const paidAll =
    sale.paidAllPaise !== undefined
      ? sale.paidAllPaise
      : sale.sumLineTotalsPaise > 0n
      ? (sale.lineTotalPaise * sale.grandTotalPaise * 2n + sale.sumLineTotalsPaise) /
        (sale.sumLineTotalsPaise * 2n)
      : 0n;

  const upTo = (total: bigint, qty: bigint) =>
    qty === 0n ? 0n : proportion(total, qty, sale.soldMilli);

  const gross = upTo(grossAll, after) - upTo(grossAll, alreadyReturnedMilli);
  const refund = upTo(paidAll, after) - upTo(paidAll, alreadyReturnedMilli);
  const cost = upTo(sale.totalCostPaise, after) - upTo(sale.totalCostPaise, alreadyReturnedMilli);

  return { gross, refund: refund > gross ? gross : refund, cost };
}
