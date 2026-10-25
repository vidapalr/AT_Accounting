import test from "node:test";
import assert from "node:assert/strict";
import { parseCounted, countDifference, isLow } from "../src/lib/stock-count-math.ts";

test("blank count means not counted; numbers are read exactly", () => {
  assert.equal(parseCounted("  "), null);
  assert.equal(parseCounted("12"), 12000n);
  assert.equal(parseCounted("2.5"), 2500n);
  assert.throws(() => parseCounted("-1"));
  assert.throws(() => parseCounted("abc"));
});

test("short, extra and matching counts", () => {
  assert.deepEqual(countDifference(10000n, 9000n), { diff: -1000n, kind: "SHORT" });
  assert.deepEqual(countDifference(10000n, 11000n), { diff: 1000n, kind: "EXTRA" });
  assert.deepEqual(countDifference(10000n, 10000n), { diff: 0n, kind: "MATCH" });
});

test("low stock needs a minimum to be set", () => {
  assert.equal(isLow(3000n, 5000n), true);
  assert.equal(isLow(5000n, 5000n), true);
  assert.equal(isLow(6000n, 5000n), false);
  assert.equal(isLow(0n, null), false);
  assert.equal(isLow(0n, 0n), false);
});
