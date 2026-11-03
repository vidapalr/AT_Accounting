import test from "node:test";
import assert from "node:assert/strict";
import { bestOffer, offerApplies, priceAfter } from "../src/lib/offer-math.ts";

const base = { id: 1, name: "Diwali", channel: "BOTH", kind: "PERCENT", value: 10, scope: "ALL", fabric: null, productIds: [], startsOn: "2026-10-20", endsOn: "2026-11-05", active: true };

test("each kind of offer gives the right price in paise", () => {
  assert.equal(priceAfter(100000n, { kind: "PERCENT", value: 10 }), 90000n);
  assert.equal(priceAfter(99900n, { kind: "PERCENT", value: 12.5 }), 87413n);
  assert.equal(priceAfter(100000n, { kind: "AMOUNT_OFF", value: 150 }), 85000n);
  assert.equal(priceAfter(100000n, { kind: "AMOUNT_OFF", value: 5000 }), 0n);
  assert.equal(priceAfter(100000n, { kind: "FIXED_PRICE", value: 799 }), 79900n);
  assert.equal(priceAfter(100000n, { kind: "FIXED_PRICE", value: 1500 }), 100000n); // never raises the price
});

test("channel, dates, scope and pause decide if an offer applies", () => {
  const t = { productId: 7, fabric: "Cotton" };
  assert.equal(offerApplies(base, "ONLINE", t, "2026-10-27"), true);
  assert.equal(offerApplies({ ...base, channel: "STORE" }, "ONLINE", t, "2026-10-27"), false);
  assert.equal(offerApplies({ ...base, channel: "ONLINE" }, "STORE", t, "2026-10-27"), false);
  assert.equal(offerApplies(base, "ONLINE", t, "2026-11-06"), false);
  assert.equal(offerApplies(base, "ONLINE", t, "2026-10-19"), false);
  assert.equal(offerApplies({ ...base, active: false }, "ONLINE", t, "2026-10-27"), false);
  assert.equal(offerApplies({ ...base, scope: "FABRIC", fabric: "cotton" }, "ONLINE", t, "2026-10-27"), true);
  assert.equal(offerApplies({ ...base, scope: "FABRIC", fabric: "Silk" }, "ONLINE", t, "2026-10-27"), false);
  assert.equal(offerApplies({ ...base, scope: "PRODUCTS", productIds: [7] }, "ONLINE", t, "2026-10-27"), true);
  assert.equal(offerApplies({ ...base, scope: "PRODUCTS", productIds: [8] }, "ONLINE", t, "2026-10-27"), false);
});

test("the best single offer wins and offers never stack", () => {
  const t = { productId: 7, fabric: null };
  const offers = [base, { ...base, id: 2, name: "Flat 200", kind: "AMOUNT_OFF", value: 200 }];
  const r = bestOffer(offers, "ONLINE", t, 100000n, "2026-10-27");
  assert.equal(r.offer.name, "Flat 200");
  assert.equal(r.newPaise, 80000n);
  assert.equal(r.offPaise, 20000n);
  assert.equal(bestOffer([], "ONLINE", t, 100000n, "2026-10-27"), null);
});

test("an offer can be limited to one branch or one division (store); branch offers never show online", () => {
  const t = { productId: 7, fabric: null };
  const store = { ...base, channel: "STORE" };
  const kapra = { branchId: 1, divisionId: 1 };
  const other = { branchId: 2, divisionId: 1 };
  const elsewhere = { branchId: 9, divisionId: 2 };
  assert.equal(offerApplies({ ...store, branchId: 1, divisionId: 1 }, "STORE", t, "2026-10-27", kapra), true);
  assert.equal(offerApplies({ ...store, branchId: 1, divisionId: 1 }, "STORE", t, "2026-10-27", other), false);
  assert.equal(offerApplies({ ...store, divisionId: 1 }, "STORE", t, "2026-10-27", other), true); // whole division
  assert.equal(offerApplies({ ...store, divisionId: 1 }, "STORE", t, "2026-10-27", elsewhere), false);
  assert.equal(offerApplies(store, "STORE", t, "2026-10-27", elsewhere), true); // everywhere (old offers)
  assert.equal(offerApplies({ ...base, channel: "BOTH", branchId: 1, divisionId: 1 }, "ONLINE", t, "2026-10-27"), false);
  assert.equal(offerApplies({ ...base, channel: "BOTH", divisionId: 1 }, "ONLINE", t, "2026-10-27"), true);
  assert.equal(offerApplies({ ...store, branchId: 1, divisionId: 1 }, "STORE", t, "2026-10-27"), false); // branch unknown
});
