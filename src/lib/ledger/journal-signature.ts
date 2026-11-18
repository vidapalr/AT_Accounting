/** A journal's account, amount and reporting scope all affect its meaning. */
export type SignatureLine = {
  code: string;
  debit: string;
  credit: string;
  divisionId: number | null;
  branchId: number | null;
};

/** Sort lines so harmless posting-order changes do not cause false mismatches. */
export function journalSignature(lines: SignatureLine[]): string {
  return lines.map((line) => JSON.stringify([
    line.code,
    line.debit,
    line.credit,
    line.divisionId,
    line.branchId,
  ])).sort().join(";");
}

/** Both financial-period date and line allocations must match the source. */
export function journalMatchesSource(
  expected: { entryDate: string; lines: SignatureLine[] },
  posted: { entryDate: string; lines: SignatureLine[] },
): boolean {
  return expected.entryDate === posted.entryDate &&
    journalSignature(expected.lines) === journalSignature(posted.lines);
}
