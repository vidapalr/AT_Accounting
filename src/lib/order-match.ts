/**
 * Does what we bought match what we ordered? (item 2.9)
 * Compares order lines with purchase lines, item by item. A small difference
 * (up to TOLERANCE_PERCENT of the ordered figure) still counts as a match.
 * Amounts are worked in thousandths / paise-like integers to stay exact.
 */
export const TOLERANCE_PERCENT = 2;

export type MatchLine = { variantId: number; label: string; qty: string | number; unitCost: string | number };
export type MatchRow = {
  label: string;
  orderedQty: number; boughtQty: number;
  orderedCost: number; boughtCost: number;
  status: "OK" | "QTY" | "PRICE" | "BOTH" | "NOT_ORDERED" | "NOT_BOUGHT";
};

const milli = (v: string | number) => Math.round(Number(v) * 1000);
const within = (ordered: number, actual: number) =>
  Math.abs(actual - ordered) * 100 <= Math.abs(ordered) * TOLERANCE_PERCENT;

export function matchOrder(ordered: MatchLine[], bought: MatchLine[]): MatchRow[] {
  const sum = (ls: MatchLine[]) => {
    const m = new Map<number, { label: string; qty: number; amount: number }>();
    for (const l of ls) {
      const e = m.get(l.variantId) ?? { label: l.label, qty: 0, amount: 0 };
      e.qty += milli(l.qty);
      e.amount += milli(l.qty) * milli(l.unitCost); // thousandths x thousandths
      m.set(l.variantId, e);
    }
    return m;
  };
  const o = sum(ordered), b = sum(bought);
  const rows: MatchRow[] = [];
  for (const id of new Set([...o.keys(), ...b.keys()])) {
    const x = o.get(id), y = b.get(id);
    const oq = x ? x.qty : 0, bq = y ? y.qty : 0;
    const oc = x && x.qty ? Math.round(x.amount / x.qty) : 0;
    const bc = y && y.qty ? Math.round(y.amount / y.qty) : 0;
    let status: MatchRow["status"];
    if (!x) status = "NOT_ORDERED";
    else if (!y) status = "NOT_BOUGHT";
    else {
      const qOk = within(oq, bq), pOk = within(oc, bc);
      status = qOk && pOk ? "OK" : !qOk && !pOk ? "BOTH" : !qOk ? "QTY" : "PRICE";
    }
    rows.push({ label: (x ?? y)!.label, orderedQty: oq / 1000, boughtQty: bq / 1000, orderedCost: oc / 1000, boughtCost: bc / 1000, status });
  }
  return rows;
}

export const MATCH_WORDS: Record<MatchRow["status"], string> = {
  OK: "Matches",
  QTY: "Different quantity",
  PRICE: "Different price",
  BOTH: "Different quantity and price",
  NOT_ORDERED: "Not on the order",
  NOT_BOUGHT: "Ordered but not on this bill",
};
