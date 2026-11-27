/**
 * Matching a bank account with its statement, line by line. Pure; money in paise (bigint).
 *
 * The book balance on a date = every entry on the bank's ledger account up to that date (the opening
 * balance is the first entry). Ticked balance = only the entries ticked as seen on the bank statement.
 * When everything is matched, the ticked balance equals the bank's own balance on that date.
 */

export type ReconLine = { id: number; date: string; text: string; moneyIn: bigint; moneyOut: bigint; ticked: boolean };

export type ReconView = {
  from: string; to: string;
  /** Book balance before `from` (what the account opened with for this check). */
  opening: bigint;
  /** Entries before `from` that are still not ticked (they belong to the opening but the bank has not shown them). */
  olderUnticked: ReconLine[];
  /** Entries from `from` to `to`, oldest first, with the running book balance. */
  lines: Array<ReconLine & { running: bigint }>;
  booksBalance: bigint;
  tickedBalance: bigint;
  untickedIn: bigint;
  untickedOut: bigint;
};

export function reconView(all: ReconLine[], from: string, to: string): ReconView {
  const sorted = [...all].filter((l) => l.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  let opening = 0n, ticked = 0n, untickedIn = 0n, untickedOut = 0n;
  const olderUnticked: ReconLine[] = [];
  const lines: ReconView["lines"] = [];
  for (const l of sorted) {
    const net = l.moneyIn - l.moneyOut;
    if (l.ticked) ticked += net;
    else { untickedIn += l.moneyIn; untickedOut += l.moneyOut; }
    if (l.date < from) {
      opening += net;
      if (!l.ticked) olderUnticked.push(l);
    }
  }
  let running = opening;
  for (const l of sorted) {
    if (l.date < from) continue;
    running += l.moneyIn - l.moneyOut;
    lines.push({ ...l, running });
  }
  return { from, to, opening, olderUnticked, lines, booksBalance: running, tickedBalance: ticked, untickedIn, untickedOut };
}

/** What is left to explain: the bank's balance minus the ticked balance (0 = fully matched). */
export function reconDifference(bankBalance: bigint, tickedBalance: bigint): bigint {
  return bankBalance - tickedBalance;
}
