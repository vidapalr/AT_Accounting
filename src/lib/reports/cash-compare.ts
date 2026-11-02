export type CashTieRow = {
  key: string;
  name: string;
  /** Money in less money out worked out from the records (Account Balances page). */
  recordsNet: bigint;
  /** Movement since opening taken from posted journal entries (what Reports and the Dashboard use). */
  booksNet: bigint;
  difference: bigint;
};

/** Pure: pair each bank/cash account's records figure with its books figure. */
export function compareCashFlow(
  records: Array<{ key: string; name: string; net: bigint }>,
  books: Map<string, bigint>
): CashTieRow[] {
  return records.map((r) => {
    const booksNet = books.get(r.key) ?? 0n;
    return { key: r.key, name: r.name, recordsNet: r.net, booksNet, difference: r.net - booksNet };
  });
}

