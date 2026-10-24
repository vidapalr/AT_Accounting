/**
 * Supplier statement maths (pure, no database). Money is integer paise.
 *
 * Balance > 0  we owe the supplier.
 * Balance < 0  the supplier owes us (credit from a return, not yet used or refunded).
 */

export type StatementKind = "BILL" | "RETURN" | "PAYMENT" | "REFUND";

export type StatementEvent = {
  date: string; // YYYY-MM-DD
  kind: StatementKind;
  ref: string;
  amount: bigint; // always positive
};

export type StatementRow = StatementEvent & {
  /** Change to what we owe: bills and refunds add, payments and returns take away. */
  effect: bigint;
  balance: bigint;
};

const ORDER: Record<StatementKind, number> = { BILL: 0, RETURN: 1, PAYMENT: 2, REFUND: 3 };

export function effectOf(kind: StatementKind, amount: bigint): bigint {
  return kind === "BILL" || kind === "REFUND" ? amount : -amount;
}

export function buildStatement(events: StatementEvent[]): { rows: StatementRow[]; balance: bigint } {
  const sorted = [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      ORDER[a.kind] - ORDER[b.kind] ||
      a.ref.localeCompare(b.ref)
  );
  let balance = 0n;
  const rows = sorted.map((e) => {
    const effect = effectOf(e.kind, e.amount);
    balance += effect;
    return { ...e, effect, balance };
  });
  return { rows, balance };
}

export type Ageing = {
  upTo30: bigint;
  from31to60: bigint;
  from61to90: bigint;
  over90: bigint;
  /** Payments and returns that are more than all the bills (supplier credit). */
  unusedCredit: bigint;
  totalDue: bigint;
};

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * How old is what we still owe? Payments and returns are counted against the
 * oldest bills first, and the bills left over are grouped by age.
 */
export function ageDues(
  bills: { date: string; amount: bigint }[],
  reductions: bigint,
  today: string
): Ageing {
  const out: Ageing = {
    upTo30: 0n, from31to60: 0n, from61to90: 0n, over90: 0n, unusedCredit: 0n, totalDue: 0n,
  };
  let credit = reductions < 0n ? 0n : reductions;
  const todayN = dayNumber(today);

  for (const bill of [...bills].sort((a, b) => a.date.localeCompare(b.date))) {
    const used = credit >= bill.amount ? bill.amount : credit;
    credit -= used;
    const left = bill.amount - used;
    if (left <= 0n) continue;
    const age = Math.max(0, todayN - dayNumber(bill.date));
    if (age <= 30) out.upTo30 += left;
    else if (age <= 60) out.from31to60 += left;
    else if (age <= 90) out.from61to90 += left;
    else out.over90 += left;
    out.totalDue += left;
  }
  out.unusedCredit = credit;
  return out;
}
