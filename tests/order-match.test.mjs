import test from "node:test";
import assert from "node:assert/strict";
import { matchOrder } from "../src/lib/order-match.ts";
const L = (variantId, qty, unitCost) => ({ variantId, label: "v" + variantId, qty, unitCost });
test("same items match", () => {
  assert.equal(matchOrder([L(1, 10, 100)], [L(1, 10, 100)])[0].status, "OK");
});
test("2% tolerance", () => {
  assert.equal(matchOrder([L(1, 100, 100)], [L(1, 98, "102.00")])[0].status, "OK");
  assert.equal(matchOrder([L(1, 100, 100)], [L(1, 97, 100)])[0].status, "QTY");
  assert.equal(matchOrder([L(1, 100, 100)], [L(1, 100, 110)])[0].status, "PRICE");
  assert.equal(matchOrder([L(1, 100, 100)], [L(1, 90, 110)])[0].status, "BOTH");
});
test("extra and missing items", () => {
  const r = matchOrder([L(1, 5, 10)], [L(2, 5, 10)]);
  assert.deepEqual(r.map(x => x.status).sort(), ["NOT_BOUGHT", "NOT_ORDERED"]);
});
