export type Budget = { sales: bigint; expenses: bigint };

export const ZERO_BUDGET: Budget = { sales: 0n, expenses: 0n };

/** "2026-11" -> first and last day of that month. Null when it is not a real month. */
export function monthRange(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** Whole percent of the budget reached. Null when no budget is set. */
export function reached(actual: bigint, budget: bigint): number | null {
  if (budget <= 0n) return null;
  return Number((actual * 100n) / budget);
}

export type Verdict = "none" | "ok" | "watch" | "over";

/** Sales: below target is "watch" until the month is over. Expenses: over the limit is "over". */
export function expenseVerdict(actual: bigint, limit: bigint): Verdict {
  const p = reached(actual, limit);
  if (p === null) return "none";
  if (p > 100) return "over";
  if (p >= 90) return "watch";
  return "ok";
}
export function salesVerdict(actual: bigint, target: bigint, monthOver: boolean): Verdict {
  const p = reached(actual, target);
  if (p === null) return "none";
  if (p >= 100) return "ok";
  return monthOver ? "over" : "watch";
}

/** Add branch budgets up for a division or the group. */
export function sumBudgets(list: Budget[]): Budget {
  return list.reduce((a, b) => ({ sales: a.sales + b.sales, expenses: a.expenses + b.expenses }), ZERO_BUDGET);
}

/** Where a ledger entry came from, as a page the owner can open. */
export function sourceLink(type: string, id: number | null): string | null {
  if (!id) return null;
  switch (type) {
    case "SALES_INVOICE": case "SALES_RECEIPT": case "SALES_RETURN": case "SALES_REFUND": return `/accounting/sales/${id}`;
    case "EXPENSE": case "EXPENSE_PAYMENT": return `/accounting/expenses/${id}`;
    default: return null;
  }
}

/** Rupees typed in a box ("1,50,000" or "2500.50") -> paise. Empty is 0; anything else odd is null. */
export function rupeesToPaise(text: string): bigint | null {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return 0n;
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  return BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
}
