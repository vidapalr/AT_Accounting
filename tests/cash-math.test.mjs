import test from "node:test";
import assert from "node:assert/strict";
import { expectedCash, cashDifference, parseRupees, paiseText } from "../src/lib/cash-math.ts";

test("expected cash is opening plus in, minus out and minus cash taken away", () => {
  assert.equal(expectedCash({ opening: 500000n, cashIn: 1250000n, cashOut: 300050n, takenOut: 1000000n }), 449950n);
});

test("difference is counted minus expected", () => {
  assert.equal(cashDifference(449950n, 449950n), 0n);
  assert.equal(cashDifference(449950n, 449000n), -950n);
  assert.equal(cashDifference(449950n, 450000n), 50n);
});

test("rupee text becomes exact paise and bad text is refused", () => {
  assert.equal(parseRupees("1,250.5"), 125050n);
  assert.equal(parseRupees("0"), 0n);
  assert.equal(parseRupees("99.99"), 9999n);
  for (const bad of ["", "-5", "1.234", "abc", "1e3"]) assert.throws(() => parseRupees(bad), bad);
  assert.equal(paiseText(-950n), "-9.50");
  assert.equal(paiseText(5n), "0.05");
});
