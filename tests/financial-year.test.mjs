import test from "node:test";
import assert from "node:assert/strict";
const label = (date) => { const y = Number(date.slice(0,4)), m = Number(date.slice(5,7)); const s = m >= 4 ? y : y - 1; return `${s}–${String((s+1)%100).padStart(2,"0")}`; };
test("financial year", () => {
  assert.equal(label("2026-04-01"), "2026–27");
  assert.equal(label("2027-03-31"), "2026–27");
  assert.equal(label("2026-11-02"), "2026–27");
  assert.equal(label("2027-04-01"), "2027–28");
  assert.equal(label("2099-12-31"), "2099–00");
});
