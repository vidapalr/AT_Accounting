import test from "node:test";
import assert from "node:assert/strict";
import { compareCashFlow } from "../src/lib/reports/cash-compare.ts";

test("compareCashFlow pairs records with books and shows the difference", () => {
  const rows = compareCashFlow(
    [{ key: "BANK:1", name: "SBI", net: 10000n }, { key: "CASH:2", name: "Shop cash", net: -500n }],
    new Map([["BANK:1", 10000n], ["CASH:2", 0n]])
  );
  assert.equal(rows[0].difference, 0n);
  assert.equal(rows[1].difference, -500n);
});

test("an account the books do not know shows its whole movement as the difference", () => {
  const rows = compareCashFlow([{ key: "BANK:9", name: "New", net: 700n }], new Map());
  assert.equal(rows[0].booksNet, 0n);
  assert.equal(rows[0].difference, 700n);
});
