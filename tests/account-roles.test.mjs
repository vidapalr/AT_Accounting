import test from "node:test";
import assert from "node:assert/strict";
import { ACCOUNT_ROLES, buildCodeMap, mappingProblems, mapDraftCodes, standardCoder } from "../src/lib/ledger/account-roles.ts";
import { ACCOUNT } from "../src/lib/ledger/posting-rules.ts";

const draft = { sourceType: "SALES_INVOICE", sourceId: 1, entryDate: "2026-11-01", description: "x",
  lines: [{ accountCode: ACCOUNT.RECEIVABLES, debit: 100n, credit: 0n, divisionId: 1, branchId: 1, memo: "" },
          { accountCode: ACCOUNT.SALES, debit: 0n, credit: 100n, divisionId: 1, branchId: 1, memo: "" }] };

test("every posting role has a standard code and a label", () => {
  assert.ok(ACCOUNT_ROLES.length >= 30);
  for (const r of ACCOUNT_ROLES) assert.ok(r.standardCode && r.label, r.key);
  assert.ok(ACCOUNT_ROLES.some((r) => r.key === "EXPENSE_RENT"));
});

test("no mapping keeps drafts exactly as they are", () => {
  assert.equal(mapDraftCodes(draft, buildCodeMap([])), draft);
  assert.equal(standardCoder(new Map())("4000"), "4000");
});

test("a mapped role posts to the company's account and reports read it back as standard", () => {
  const map = buildCodeMap([{ role: "SALES", code: "4100" }, { role: "NOT_A_ROLE", code: "9" }]);
  const out = mapDraftCodes(draft, map);
  assert.deepEqual(out.lines.map((l) => l.accountCode), [ACCOUNT.RECEIVABLES, "4100"]);
  const std = standardCoder(map);
  assert.equal(std("4100"), ACCOUNT.SALES);
  assert.equal(std(ACCOUNT.SALES), "moved:4000");
  assert.equal(std("1100"), "1100");
});

test("two roles on one account, or taking another role's standard code, is refused", () => {
  assert.equal(mappingProblems(buildCodeMap([{ role: "SALES", code: "4100" }, { role: "DELIVERY_INCOME", code: "4100" }])).length, 1);
  assert.equal(mappingProblems(buildCodeMap([{ role: "SALES", code: ACCOUNT.DELIVERY_INCOME }])).length, 1);
  assert.equal(mappingProblems(buildCodeMap([{ role: "SALES", code: "4100" }])).length, 0);
});
