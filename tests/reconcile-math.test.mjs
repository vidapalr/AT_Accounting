import test from "node:test";
import assert from "node:assert/strict";
import { compareAccounts, trialBalance } from "../src/lib/ledger/reconcile-math.ts";

test("agreeing accounts show no difference", () => {
  const rows = compareAccounts(
    [{ code: "1001", name: "Cash", net: 500n }],
    [{ code: "1001", name: "Cash", net: 500n }],
    []);
  assert.equal(rows[0].difference, 0n);
});

test("a record not yet posted shows as a difference", () => {
  const rows = compareAccounts(
    [{ code: "4000", name: "Sales", net: -900n }],
    [{ code: "4000", name: "Sales", net: -400n }],
    []);
  assert.equal(rows[0].difference, -500n);
});

test("hand-typed entries are kept apart and never count as a difference", () => {
  const rows = compareAccounts(
    [], [],
    [{ code: "3000", name: "Capital", net: -10000n }]);
  assert.equal(rows[0].difference, 0n);
  assert.equal(rows[0].other, -10000n);
});

test("accounts that appear on only one side are listed, sorted by code", () => {
  const rows = compareAccounts(
    [{ code: "5000", name: "COGS", net: 100n }],
    [{ code: "1001", name: "Cash", net: 50n }], []);
  assert.deepEqual(rows.map((r) => r.code), ["1001", "5000"]);
  assert.equal(rows[1].difference, 100n);
});

test("trial balance", () => {
  assert.equal(trialBalance(100n, 100n).balanced, true);
  assert.equal(trialBalance(100n, 90n).difference, 10n);
});
