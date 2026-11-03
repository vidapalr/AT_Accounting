import test from "node:test";
import assert from "node:assert/strict";
import { tierFor, resolveTierPrices, priceForQuantity } from "../src/lib/qty-price.ts";

test("tiers", () => {
  assert.equal(tierFor(1), 1); assert.equal(tierFor(3), 1); assert.equal(tierFor(3.5), 1);
  assert.equal(tierFor(4), 4); assert.equal(tierFor(9), 4); assert.equal(tierFor(10), 10); assert.equal(tierFor(25), 10);
});
test("own price beats rule, rule beats nothing", () => {
  assert.deepEqual(resolveTierPrices(1000, 5, 10, null, null), { p4: 950, p10: 900 });
  assert.deepEqual(resolveTierPrices(1000, 5, 10, 940, null), { p4: 940, p10: 900 });
  assert.deepEqual(resolveTierPrices(1000, 0, 0, null, null), { p4: null, p10: null });
  assert.deepEqual(resolveTierPrices(null, 5, 10, null, 800), { p4: null, p10: 800 });
  assert.deepEqual(resolveTierPrices(999, 5, 10, null, null), { p4: 949.05, p10: 899.1 });
});
test("price for quantity falls back to the tier below", () => {
  const t = { p4: 950, p10: null };
  assert.equal(priceForQuantity(1000, t, 2), 1000);
  assert.equal(priceForQuantity(1000, t, 4), 950);
  assert.equal(priceForQuantity(1000, t, 12), 950);
  assert.equal(priceForQuantity(null, undefined, 12), null);
});
