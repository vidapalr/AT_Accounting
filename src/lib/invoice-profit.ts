/**
 * Profit on one invoice (item 1.20). Pure maths, money in rupees as numbers
 * read from the database (2 decimals), worked in paise to stay exact.
 *
 * Sale value = grand total minus delivery charge (delivery is not item profit),
 * minus any discount given later to close the bill.
 * Profit = sale value minus the cost of the items sold.
 * Percentage = profit / sale value.
 */
export type InvoiceProfit = {
  saleValue: number;
  cost: number;
  profit: number;
  /** null when the sale value is zero */
  percent: number | null;
  /** true when some items have no cost recorded, so the figure is only partial */
  costMissing: boolean;
};

const paise = (v: number | string | null | undefined): number =>
  Math.round(Number(v ?? 0) * 100);

export function invoiceProfit(input: {
  grandTotal: number | string;
  shippingCharge?: number | string | null;
  lateDiscount?: number | string | null;
  lineCosts: Array<number | string | null>;
}): InvoiceProfit {
  const saleP =
    paise(input.grandTotal) -
    paise(input.shippingCharge) -
    paise(input.lateDiscount);
  const costP = input.lineCosts.reduce<number>((s, c) => s + paise(c), 0);
  const costMissing = input.lineCosts.some((c) => c === null || c === undefined);
  const profitP = saleP - costP;
  const percent = saleP > 0 ? Math.round((profitP / saleP) * 10000) / 100 : null;
  return {
    saleValue: saleP / 100,
    cost: costP / 100,
    profit: profitP / 100,
    percent,
    costMissing,
  };
}
