import { test } from "node:test";
import assert from "node:assert/strict";

import { netBalance, balanceWords, balanceBreakdown, balanceTotals, ZERO_PARTS } from "../src/lib/customer-balance-math.ts";

const fmt = (p) => `₹${p / 100n}`;
const parts = (o) => ({ ...ZERO_PARTS, ...o });

test("a return bigger than the unpaid bill: we owe the difference, not both", () => {
  const p = parts({ billsDue: 10000n, returnOwed: 67000n });
  assert.equal(netBalance(p), -57000n);
  assert.equal(balanceWords(netBalance(p), fmt), "You owe them ₹570");
  assert.match(balanceBreakdown(p, fmt), /unpaid bills ₹100, less returns not yet given back ₹670/);
});

test("customer who is also a supplier: only the bigger side shows", () => {
  const p = parts({ billsDue: 680000n, supplierOwed: 17553500n });
  assert.equal(netBalance(p), -16873500n);
  assert.equal(balanceWords(netBalance(p), fmt), "You owe them ₹168735");
});

test("credit held reduces what they owe; settled shows nothing", () => {
  assert.equal(netBalance(parts({ billsDue: 50000n, creditHeld: 20000n })), 30000n);
  assert.equal(balanceWords(0n, fmt), "Nothing owed either way");
  assert.equal(balanceBreakdown(parts({ billsDue: 50000n }), fmt), "");
});

test("dashboard totals count each person once, on one side", () => {
  const t = balanceTotals([
    parts({ billsDue: 10000n, returnOwed: 67000n }),        // we owe her 570
    parts({ billsDue: 680000n, supplierOwed: 17553500n }),  // set off 6,800 against supplier
    parts({ billsDue: 1265000n }),                           // owes 12,650
    parts({ billsDue: 500000n, supplierOwed: 200000n }),     // owes 3,000 after setting off 2,000
  ]);
  assert.equal(t.owedToUs, 1265000n + 300000n);
  assert.equal(t.owedToCustomers, 57000n);
  assert.equal(t.supplierSetoff, 680000n + 200000n);
});

import { salesBreakdown } from "../src/lib/reports/profit-levels.ts";
test("dashboard explains negative net sales: returns from earlier bills count today", () => {
  const f = (p) => `₹${p / 100n}`;
  const r = salesBreakdown({ sales: 130000n, discounts: 215000n, returns: 215000n }, f);
  assert.equal(r.line, "Sales ₹1300 · returns ₹2150");
  assert.equal(r.returnsExceedSales, true);
  assert.equal(salesBreakdown({ sales: 130000n, discounts: 0n, returns: 0n }, f).line, "After discounts and returns");
  assert.equal(salesBreakdown({ sales: 130000n, discounts: 15000n, returns: 5000n }, f).line, "Sales ₹1300 · returns ₹50 · discounts ₹100");
});
