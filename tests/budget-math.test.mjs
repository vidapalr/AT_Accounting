import test from "node:test";
import assert from "node:assert/strict";
import { monthRange, reached, expenseVerdict, salesVerdict, sumBudgets, sourceLink } from "../src/lib/budget-math.ts";

test("month range", () => {
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.equal(monthRange("2026-13"), null);
  assert.equal(monthRange("x"), null);
});
test("percent reached", () => {
  assert.equal(reached(50n, 200n), 25);
  assert.equal(reached(5n, 0n), null);
});
test("verdicts", () => {
  assert.equal(expenseVerdict(101n, 100n), "over");
  assert.equal(expenseVerdict(95n, 100n), "watch");
  assert.equal(expenseVerdict(10n, 100n), "ok");
  assert.equal(expenseVerdict(10n, 0n), "none");
  assert.equal(salesVerdict(100n, 100n, false), "ok");
  assert.equal(salesVerdict(50n, 100n, false), "watch");
  assert.equal(salesVerdict(50n, 100n, true), "over");
});
test("sums and links", () => {
  assert.deepEqual(sumBudgets([{ sales: 1n, expenses: 2n }, { sales: 3n, expenses: 4n }]), { sales: 4n, expenses: 6n });
  assert.equal(sourceLink("SALES_INVOICE", 7), "/accounting/sales/7");
  assert.equal(sourceLink("OWNER_MONEY", 7), null);
});
import { rupeesToPaise } from "../src/lib/budget-math.ts";
test("rupees to paise", () => {
  assert.equal(rupeesToPaise("1,50,000"), 15000000n);
  assert.equal(rupeesToPaise("2500.5"), 250050n);
  assert.equal(rupeesToPaise(""), 0n);
  assert.equal(rupeesToPaise("abc"), null);
  assert.equal(rupeesToPaise("-5"), null);
});
