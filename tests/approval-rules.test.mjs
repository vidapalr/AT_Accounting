import test from "node:test";
import assert from "node:assert/strict";
import { needsApproval, firstStatus, canCheck, canFinalApprove, canReject, canCancel, rupeesToLimit, parseLimit } from "../src/lib/approval-rules.ts";

test("no limit set means nothing needs approval; the owner never needs it", () => {
  assert.equal(needsApproval("ACCOUNTANT", null, 10_000_000n), false);
  assert.equal(needsApproval("GROUP_OWNER", 100n, 10_000_000n), false);
});

test("only an amount above the limit needs approval", () => {
  assert.equal(needsApproval("ACCOUNTANT", 500000n, 500000n), false);
  assert.equal(needsApproval("ACCOUNTANT", 500000n, 500001n), true);
});

test("a cashier's request goes to the accountant first, others straight to final", () => {
  assert.equal(firstStatus("CASHIER"), "WAITING_CHECK");
  assert.equal(firstStatus("ACCOUNTANT"), "WAITING_FINAL");
  assert.equal(firstStatus("DIVISION_MANAGER"), "WAITING_FINAL");
});

test("three steps: accountant checks, then manager or owner approves; owner may skip the check", () => {
  const r = { status: "WAITING_CHECK", requestedBy: 5 };
  assert.equal(canCheck("ACCOUNTANT", 9, r), true);
  assert.equal(canFinalApprove("DIVISION_MANAGER", 8, r), false);
  assert.equal(canFinalApprove("GROUP_OWNER", 1, r), true);
  const f = { status: "WAITING_FINAL", requestedBy: 5 };
  assert.equal(canFinalApprove("DIVISION_MANAGER", 8, f), true);
  assert.equal(canFinalApprove("ACCOUNTANT", 9, f), false);
  assert.equal(canFinalApprove("CASHIER", 7, f), false);
});

test("nobody approves their own request", () => {
  const r = { status: "WAITING_FINAL", requestedBy: 8 };
  assert.equal(canFinalApprove("DIVISION_MANAGER", 8, r), false);
  assert.equal(canFinalApprove("GROUP_OWNER", 8, r), false);
  assert.equal(canCheck("ACCOUNTANT", 8, { status: "WAITING_CHECK", requestedBy: 8 }), false);
  assert.equal(canReject("DIVISION_MANAGER", 8, r), false);
});

test("decided requests can no longer be acted on; the asker can withdraw only while waiting", () => {
  const done = { status: "APPROVED", requestedBy: 5 };
  assert.equal(canFinalApprove("GROUP_OWNER", 1, done), false);
  assert.equal(canCancel(5, done), false);
  assert.equal(canCancel(5, { status: "WAITING_CHECK", requestedBy: 5 }), true);
  assert.equal(canCancel(6, { status: "WAITING_CHECK", requestedBy: 5 }), false);
});

test("limit text", () => {
  assert.equal(rupeesToLimit(""), null);
  assert.equal(rupeesToLimit("5,000"), 500000n);
  assert.equal(rupeesToLimit("10.5"), 1050n);
  assert.throws(() => rupeesToLimit("abc"));
  assert.equal(parseLimit("500000"), 500000n);
  assert.equal(parseLimit(""), null);
});
