import test from "node:test";
import assert from "node:assert/strict";
const isLockedOut = (e, i) => e >= 5 || i >= 20;
test("lock rule", () => {
  assert.equal(isLockedOut(4, 0), false);
  assert.equal(isLockedOut(5, 0), true);
  assert.equal(isLockedOut(0, 20), true);
});
