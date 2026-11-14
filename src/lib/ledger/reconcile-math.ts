/**
 * Books check, account by account. Pure maths (no database), money in paise (bigint).
 * "Net" means debit minus credit, so a positive number is a debit balance.
 */
export type AccountNet = { code: string; name: string; net: bigint };

export type ReconcileRow = {
  code: string;
  name: string;
  /** What the records say the account should hold. */
  expected: bigint;
  /** What the books hold from entries made out of those records. */
  booked: bigint;
  /** Entries typed by hand: opening balances, auditor adjustments, other journals. */
  other: bigint;
  /** expected - booked. Not zero means some record is waiting, was changed after posting, or is no longer valid. */
  difference: bigint;
};

export function compareAccounts(expected: AccountNet[], booked: AccountNet[], other: AccountNet[]): ReconcileRow[] {
  const names = new Map<string, string>();
  const sum = (list: AccountNet[]) => {
    const m = new Map<string, bigint>();
    for (const a of list) {
      m.set(a.code, (m.get(a.code) ?? 0n) + a.net);
      if (!names.has(a.code) || a.name) names.set(a.code, a.name || names.get(a.code) || "");
    }
    return m;
  };
  const e = sum(expected), b = sum(booked), o = sum(other);
  const codes = [...new Set([...e.keys(), ...b.keys(), ...o.keys()])].sort();
  return codes.map((code) => {
    const ex = e.get(code) ?? 0n, bk = b.get(code) ?? 0n, ot = o.get(code) ?? 0n;
    return { code, name: names.get(code) ?? "", expected: ex, booked: bk, other: ot, difference: ex - bk };
  });
}

/** The books are in balance when total debits equal total credits. */
export function trialBalance(totalDebit: bigint, totalCredit: bigint) {
  return { totalDebit, totalCredit, difference: totalDebit - totalCredit, balanced: totalDebit === totalCredit };
}
