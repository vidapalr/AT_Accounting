import test from "node:test";
import assert from "node:assert/strict";
import { journalSignature, journalMatchesSource } from "../src/lib/ledger/journal-signature.ts";

const line = (overrides = {}) => ({
  code: "6030", debit: "1000.00", credit: "0.00", divisionId: 2, branchId: 3,
  ...overrides,
});

test("a journal's division and branch are part of its reconciliation signature", () => {
  const original = journalSignature([line()]);
  assert.notEqual(original, journalSignature([line({ divisionId: 9 })]));
  assert.notEqual(original, journalSignature([line({ branchId: 4 })]));
  assert.notEqual(original, journalSignature([line({ divisionId: null, branchId: null })]));
});

test("journal signature preserves duplicate lines but ignores line ordering", () => {
  const credit = line({ code: "2200", debit: "0.00", credit: "1000.00" });
  assert.equal(journalSignature([line(), credit]), journalSignature([credit, line()]));
  assert.notEqual(journalSignature([line(), credit]), journalSignature([line(), credit, credit]));
});

test("different accounts or amounts remain distinct", () => {
  const original = journalSignature([line()]);
  assert.notEqual(original, journalSignature([line({ code: "6010" })]));
  assert.notEqual(original, journalSignature([line({ debit: "999.99" })]));
});

test("changing a transaction date is detected even when amounts and accounts match", () => {
  const original = { entryDate: "2026-10-31", lines: [line()] };
  assert.ok(journalMatchesSource(original, { ...original, lines: [line()] }));
  assert.equal(journalMatchesSource(original, { ...original, entryDate: "2026-11-01" }), false);
});
