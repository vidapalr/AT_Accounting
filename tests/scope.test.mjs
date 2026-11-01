import test from "node:test";
import assert from "node:assert/strict";
import { scopeDivision, divisionSql, canUseDivision } from "../src/lib/scope.ts";

test("owner, accountant and cashier have no division limit", () => {
  for (const user of [{ scope_division_id: null }, {}, { scope_division_id: 0 }]) {
    assert.equal(scopeDivision(user), null);
    assert.deepEqual(divisionSql(user, "s.division_id"), { sql: "", params: [] });
    assert.equal(canUseDivision(user, 2), true);
  }
});

test("a manager is limited to their own division", () => {
  const mgr = { scope_division_id: 1 };
  assert.deepEqual(divisionSql(mgr, "s.division_id"), { sql: " AND s.division_id = ?", params: [1] });
  assert.equal(canUseDivision(mgr, 1), true);
  assert.equal(canUseDivision(mgr, 2), false);
  assert.equal(canUseDivision(mgr, null), false);
  assert.equal(canUseDivision(mgr, undefined), false);
});
