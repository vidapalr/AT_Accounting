import test from "node:test";
import assert from "node:assert/strict";
import { spreadOldestFirst, maxSetoff, totalDue, netSentence } from "../src/lib/setoff-math.ts";

const bills = [
  { id: 2, date: "2026-09-10", due: 3000n },
  { id: 1, date: "2026-08-01", due: 5000n },
  { id: 3, date: "2026-10-01", due: 0n },
];

test("spreads oldest first and stops when covered", () => {
  assert.deepEqual(spreadOldestFirst(bills, 6000n), [
    { id: 1, amount: 5000n },
    { id: 2, amount: 1000n },
  ]);
});
test("refuses more than the bills hold", () => {
  assert.equal(spreadOldestFirst(bills, 8001n), null);
  assert.equal(spreadOldestFirst(bills, 0n), null);
});
test("exact total works", () => {
  assert.equal(spreadOldestFirst(bills, 8000n)?.length, 2);
  assert.equal(totalDue(bills), 8000n);
});
test("max is the smaller side", () => {
  assert.equal(maxSetoff(100n, 250n), 100n);
  assert.equal(maxSetoff(-5n, 250n), 0n);
});
test("sentence", () => {
  const f = (p) => `Rs ${p / 100n}`;
  assert.match(netSentence(10000n, 4000n, f), /Net: they owe us Rs 60/);
  assert.match(netSentence(0n, 4000n, f), /we owe them Rs 40/);
  assert.match(netSentence(100n, 100n, f), /nothing/);
});
