import test from "node:test";
import assert from "node:assert/strict";
import { isMissingTable } from "../src/lib/db-errors.ts";

test("only a missing table counts as migration-not-run", () => {
  assert.equal(isMissingTable({ code: "ER_NO_SUCH_TABLE" }), true);
  assert.equal(isMissingTable({ errno: 1146 }), true);
  assert.equal(isMissingTable({ code: "ECONNREFUSED" }), false);
  assert.equal(isMissingTable({ code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 }), false);
  assert.equal(isMissingTable(new Error("boom")), false);
  assert.equal(isMissingTable(null), false);
});
