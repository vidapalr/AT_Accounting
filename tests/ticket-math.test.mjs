import test from "node:test";
import assert from "node:assert/strict";
import { allowedNext, cleanTicketKind, cleanTicketStatus, daysOpen, isOpenStatus } from "../src/lib/ticket-math.ts";

test("ticket moves", () => {
  assert.deepEqual(allowedNext("OPEN"), ["WORKING", "RESOLVED", "CLOSED"]);
  assert.deepEqual(allowedNext("RESOLVED"), ["OPEN", "CLOSED"]);
  assert.deepEqual(allowedNext("CLOSED"), []);
});
test("open means open or being handled", () => {
  assert.equal(isOpenStatus("WORKING"), true);
  assert.equal(isOpenStatus("RESOLVED"), false);
});
test("cleaning input", () => {
  assert.equal(cleanTicketKind("EXCHANGE"), "EXCHANGE");
  assert.equal(cleanTicketKind("zzz"), "OTHER");
  assert.equal(cleanTicketStatus("zzz"), null);
});
test("days open", () => {
  assert.equal(daysOpen("2026-11-01", "2026-11-10"), 9);
  assert.equal(daysOpen("2026-11-10", "2026-11-10"), 0);
});
