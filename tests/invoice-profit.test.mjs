import test from "node:test";
import assert from "node:assert/strict";
import { invoiceProfit } from "../src/lib/invoice-profit.ts";

test("profit excludes delivery and uses cost", () => {
  const r = invoiceProfit({ grandTotal: "1200.00", shippingCharge: "200.00", lineCosts: ["600.00", "100.00"] });
  assert.equal(r.saleValue, 1000);
  assert.equal(r.cost, 700);
  assert.equal(r.profit, 300);
  assert.equal(r.percent, 30);
  assert.equal(r.costMissing, false);
});
test("late discount lowers profit", () => {
  const r = invoiceProfit({ grandTotal: 1000, lateDiscount: 100, lineCosts: [700] });
  assert.equal(r.profit, 200);
  assert.equal(r.percent, 22.22);
});
test("missing cost is flagged", () => {
  const r = invoiceProfit({ grandTotal: 500, lineCosts: [null, 100] });
  assert.equal(r.costMissing, true);
});
test("zero sale has no percent", () => {
  assert.equal(invoiceProfit({ grandTotal: 0, lineCosts: [] }).percent, null);
});
