import test from "node:test";
import assert from "node:assert/strict";
import { allowRequest, checkOrder, orderTotalPaise } from "../src/lib/shop-order-math.ts";

const good = { name: "Asha", phone: "+1 415 555 0100", email: "", country: "USA", address: "12 Main Street", city: "Austin", lines: [{ variantId: 5, qty: 2 }, { variantId: 5, qty: 1 }, { variantId: 9, qty: 1 }] };

test("a good order is cleaned and lines for the same item are merged", () => {
  const r = checkOrder(good);
  assert.equal(r.ok, true);
  assert.deepEqual(r.order.lines, [{ variantId: 5, qty: 3 }, { variantId: 9, qty: 1 }]);
});

test("bad details give a readable message", () => {
  assert.equal(checkOrder({ ...good, name: "" }).ok, false);
  assert.equal(checkOrder({ ...good, phone: "abc" }).ok, false);
  assert.equal(checkOrder({ ...good, email: "x" }).ok, false);
  assert.equal(checkOrder({ ...good, lines: [] }).ok, false);
  assert.equal(checkOrder({ ...good, lines: [{ variantId: -1, qty: 1 }, { variantId: 3, qty: 0 }] }).ok, false);
});

test("quantity is capped and totals are exact", () => {
  assert.equal(checkOrder({ ...good, lines: [{ variantId: 1, qty: 500 }] }).order.lines[0].qty, 20);
  assert.equal(orderTotalPaise([{ unitPrice: 499.5, qty: 3 }, { unitPrice: 100, qty: 1 }]), 159850n);
});

test("too many orders from one address are slowed down", () => {
  const hits = new Map();
  for (let i = 0; i < 5; i++) assert.equal(allowRequest(hits, "1.2.3.4", 1000 + i), true);
  assert.equal(allowRequest(hits, "1.2.3.4", 2000), false);
  assert.equal(allowRequest(hits, "1.2.3.4", 1000 + 11 * 60_000), true);
});
