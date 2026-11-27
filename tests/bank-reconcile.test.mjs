import { test } from "node:test";
import assert from "node:assert/strict";
import { reconView, reconDifference } from "../src/lib/bank-reconcile.ts";

const L = (id, date, inn, out, ticked) => ({ id, date, text: "x", moneyIn: BigInt(inn), moneyOut: BigInt(out), ticked });

test("opening balance, running balance and ticked balance", () => {
  const all = [
    L(1, "2026-10-01", 1000000, 0, true),   // opening 10,000
    L(2, "2026-10-20", 0, 200000, false),   // cheque not yet cleared
    L(3, "2026-11-02", 500000, 0, true),
    L(4, "2026-11-05", 0, 100000, true),
    L(5, "2026-11-28", 0, 50000, false),    // after the check date: left out
  ];
  const v = reconView(all, "2026-11-01", "2026-11-27");
  assert.equal(v.opening, 800000n);
  assert.deepEqual(v.olderUnticked.map((l) => l.id), [2]);
  assert.deepEqual(v.lines.map((l) => [l.id, l.running]), [[3, 1300000n], [4, 1200000n]]);
  assert.equal(v.booksBalance, 1200000n);
  assert.equal(v.tickedBalance, 1400000n);
  assert.equal(v.untickedOut, 200000n);
  // Bank shows 14,000: the unticked 2,000 cheque explains the gap between books and bank.
  assert.equal(reconDifference(1400000n, v.tickedBalance), 0n);
  assert.equal(v.booksBalance + v.untickedOut - v.untickedIn, v.tickedBalance);
});
