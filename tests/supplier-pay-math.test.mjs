import test from "node:test";
import assert from "node:assert/strict";
import { allocateOldestFirst, checkManualParts } from "../src/lib/supplier-pay-math.ts";

const bills = [
  { id: 1, due: 1000000n },
  { id: 2, due: 5000000n },
  { id: 3, due: 4000000n },
];

test("26,000 against 1 lakh owed fills the oldest bill first", () => {
  const r = allocateOldestFirst(bills, 2600000n);
  assert.deepEqual(r.allocations, [
    { id: 1, amount: 1000000n },
    { id: 2, amount: 1600000n },
  ]);
  assert.equal(r.leftover, 0n);
});

test("paying more than owed leaves a remainder", () => {
  const r = allocateOldestFirst(bills, 11000000n);
  assert.equal(r.leftover, 1000000n);
  assert.equal(r.allocations.length, 3);
});

test("bills with nothing due are skipped", () => {
  const r = allocateOldestFirst([{ id: 1, due: 0n }, { id: 2, due: 500n }], 300n);
  assert.deepEqual(r.allocations, [{ id: 2, amount: 300n }]);
});

test("manual parts must add up and stay within each bill", () => {
  assert.equal(checkManualParts(bills, [{ id: 2, amount: 2600000n }], 2600000n), "ok");
  assert.equal(checkManualParts(bills, [{ id: 1, amount: 2000000n }], 2000000n), "too-much-on-bill");
  assert.equal(checkManualParts(bills, [{ id: 1, amount: 100n }], 200n), "total-differs");
  assert.equal(checkManualParts(bills, [{ id: 9, amount: 100n }], 100n), "unknown-bill");
});
