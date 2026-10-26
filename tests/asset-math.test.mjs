import test from "node:test";
import assert from "node:assert/strict";
import { cumulativeDepreciation, depreciationDue, monthsToRun, monthEnd, nextMonth } from "../src/lib/asset-math.ts";

test("same wear every month and the odd paise land in the last month", () => {
  // Rs 10,000.01 over 3 months, nothing left over
  const cost = 1000001n;
  assert.equal(cumulativeDepreciation(cost, 0n, 3, 1), 333333n);
  assert.equal(cumulativeDepreciation(cost, 0n, 3, 2), 666666n);
  assert.equal(cumulativeDepreciation(cost, 0n, 3, 3), 1000001n);
  assert.equal(cumulativeDepreciation(cost, 0n, 3, 9), 1000001n);
});
test("leftover value is never depreciated", () => {
  assert.equal(cumulativeDepreciation(120000n, 20000n, 10, 10), 100000n);
});
test("a month's charge covers what is missing so a late asset catches up", () => {
  const a = { purchaseMonth: "2026-04", cost: 1200000n, salvage: 0n, lifeMonths: 12, chargedSoFar: 0n };
  assert.equal(depreciationDue(a, "2026-04"), 100000n);
  assert.equal(depreciationDue(a, "2026-06"), 300000n); // April to June at once
  assert.equal(depreciationDue({ ...a, chargedSoFar: 300000n }, "2026-07"), 100000n);
  assert.equal(depreciationDue(a, "2026-03"), 0n); // before it was bought
  assert.equal(depreciationDue({ ...a, chargedSoFar: 1200000n }, "2028-01"), 0n);
});
test("months to run start after the last run", () => {
  assert.deepEqual(monthsToRun("2026-04", null, "2026-06"), ["2026-04", "2026-05", "2026-06"]);
  assert.deepEqual(monthsToRun("2026-04", "2026-11", "2027-02"), ["2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthsToRun("2026-04", "2026-06", "2026-06"), []);
  assert.equal(nextMonth("2026-12"), "2027-01");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
});
