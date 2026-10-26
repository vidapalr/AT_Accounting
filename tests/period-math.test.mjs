import test from "node:test";
import assert from "node:assert/strict";
import { generatePeriods, nextYearStart, yearLabel } from "../src/lib/period-math.ts";

test("year label and twelve months April to March", () => {
  assert.equal(yearLabel(2026), "2026-27");
  assert.equal(yearLabel(2099), "2099-00");
  const p = generatePeriods(2027);
  assert.equal(p.length, 12);
  assert.equal(p[0].start, "2027-04-01");
  assert.equal(p[11].end, "2028-03-31");
  assert.equal(p[10].end, "2028-02-29"); // leap year
});

test("next year starts the April after the latest year ends", () => {
  assert.equal(nextYearStart("2027-03-31"), 2027);
  assert.equal(nextYearStart("2028-03-31"), 2028);
});
