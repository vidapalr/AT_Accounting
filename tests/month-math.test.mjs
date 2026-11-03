import test from "node:test";
import assert from "node:assert/strict";
import { monthBounds, lastFinishedMonth } from "../src/lib/month-math.ts";
test("month bounds", () => {
  assert.deepEqual(monthBounds("2026-10"), { start: "2026-10-01", end: "2026-10-31" });
  assert.equal(monthBounds("2028-02").end, "2028-02-29");
  assert.equal(monthBounds("2026-02").end, "2026-02-28");
});
test("last finished month", () => {
  assert.equal(lastFinishedMonth("2026-11-03"), "2026-10");
  assert.equal(lastFinishedMonth("2027-01-15"), "2026-12");
});
