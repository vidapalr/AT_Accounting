import test from "node:test";
import assert from "node:assert/strict";
import { profitByScope, balanceSheet } from "../src/lib/reports/profit-levels.ts";

const L = (accountCode, debit, credit, divisionId = 1, branchId = 1) => ({
  accountCode, divisionId, branchId, debit: BigInt(debit * 100), credit: BigInt(credit * 100),
});

test("gross, operating and net are separate, and set-up costs only affect net", () => {
  const rows = profitByScope(
    [
      L("4000", 0, 1000), L("4200", 100, 0), L("5000", 400, 0),
      L("6070", 50, 0), L("6900", 300, 0),
    ],
    new Map([[1, 1]])
  );
  const g = rows[0].figures;
  assert.equal(g.gross, 50000n);      // 1000 - 100 - 400
  assert.equal(g.operating, 45000n);  // gross - 50
  assert.equal(g.net, 15000n);        // operating - 300 set-up
});

test("branches roll up to their division and the group, with no double counting", () => {
  const rows = profitByScope(
    [
      L("4000", 0, 100, 1, 1), L("4000", 0, 200, 1, 2),
      L("4000", 0, 50, 2, 3),
      L("6090", 30, 0, 1, null), // division-level expense
      L("6090", 10, 0, null, null), // group-level expense
    ],
    new Map([[1, 1], [2, 1], [3, 2]])
  );
  const pick = (scope, id) =>
    rows.find((r) => r.scope === scope && (scope === "DIVISION" ? r.divisionId === id : r.branchId === id)).figures;

  assert.equal(pick("BRANCH", 1).sales, 10000n);
  assert.equal(pick("BRANCH", 2).sales, 20000n);
  assert.equal(pick("DIVISION", 1).sales, 30000n);
  assert.equal(pick("DIVISION", 1).operating, 30000n - 3000n);
  assert.equal(pick("DIVISION", 2).sales, 5000n);
  const group = rows[0].figures;
  assert.equal(group.sales, 35000n);
  assert.equal(group.operating, 35000n - 3000n - 1000n);
  // Branch lines are not counted again at division level.
  assert.equal(rows.filter((r) => r.scope === "GROUP").length, 1);
});

test("balance sheet balances: assets = liabilities + capital + profit", () => {
  const sheet = balanceSheet([
    { accountCode: "1010", debit: 100000n, credit: 20000n },
    { accountCode: "1200", debit: 50000n, credit: 0n },
    { accountCode: "2000", debit: 0n, credit: 30000n },
    { accountCode: "3200", debit: 0n, credit: 90000n },
    { accountCode: "4000", debit: 0n, credit: 40000n },
    { accountCode: "5000", debit: 30000n, credit: 0n },
  ]);
  assert.equal(sheet.totalAssets, 130000n);
  assert.equal(sheet.profitToDate, 10000n);
  assert.equal(sheet.totalAssets, sheet.totalLiabilitiesAndCapital);
});
