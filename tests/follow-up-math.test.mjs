import test from "node:test";
import assert from "node:assert/strict";
import { addDays, bucketOf, cleanKind, dayOk } from "../src/lib/follow-up-math.ts";

test("follow-ups fall under the right heading", () => {
  assert.equal(bucketOf("2026-11-09", "2026-11-10"), "overdue");
  assert.equal(bucketOf("2026-11-10", "2026-11-10"), "today");
  assert.equal(bucketOf("2026-11-17", "2026-11-10"), "week");
  assert.equal(bucketOf("2026-11-18", "2026-11-10"), "later");
});
test("adding days crosses month ends", () => {
  assert.equal(addDays("2026-11-28", 5), "2026-12-03");
});
test("day and kind checks", () => {
  assert.equal(dayOk("2026-02-30"), false);
  assert.equal(dayOk("2026-11-10"), true);
  assert.equal(cleanKind("CALL"), "CALL");
  assert.equal(cleanKind("x"), "NOTE");
});
