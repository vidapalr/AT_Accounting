import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT,
  supplierReturnEntry,
  supplierRefundEntry,
  freeStockEntry,
  trialBalance,
} from "../src/lib/ledger/posting-rules.ts";
import { buildStatement, ageDues } from "../src/lib/supplier-statement.ts";
import { profitByScope } from "../src/lib/reports/profit-levels.ts";

const dims = { divisionId: 1, branchId: null };

function byAccount(draft) {
  const out = {};
  for (const l of draft.lines) out[l.accountCode] = { debit: l.debit, credit: l.credit };
  return out;
}

test("supplier return at full value lowers what we owe and takes stock out at cost", () => {
  const d = supplierReturnEntry({
    id: 1, returnNo: "DN-0001", date: "2026-10-24", dims,
    costValue: "3000.00", agreedValue: "3000.00",
  });
  const a = byAccount(d);
  assert.equal(a[ACCOUNT.PAYABLES].debit, 300000n);
  assert.equal(a[ACCOUNT.INVENTORY].credit, 300000n);
  assert.equal(a[ACCOUNT.SUPPLIER_RETURN_LOSS], undefined);
  assert.equal(d.lines.length, 2);
});

test("a shortfall against cost is shown as a loss, not hidden", () => {
  const d = supplierReturnEntry({
    id: 2, returnNo: "DN-0002", date: "2026-10-24", dims,
    costValue: "3000.00", agreedValue: "2500.50",
  });
  const a = byAccount(d);
  assert.equal(a[ACCOUNT.PAYABLES].debit, 250050n);
  assert.equal(a[ACCOUNT.SUPPLIER_RETURN_LOSS].debit, 49950n);
  assert.equal(a[ACCOUNT.INVENTORY].credit, 300000n);
});

test("the supplier cannot be credited for more than the goods cost", () => {
  assert.throws(() =>
    supplierReturnEntry({
      id: 3, returnNo: "DN-0003", date: "2026-10-24", dims,
      costValue: "100.00", agreedValue: "100.01",
    })
  );
});

test("a supplier refund puts money in the account and clears the supplier's credit", () => {
  const d = supplierRefundEntry({
    id: 1, date: "2026-10-25", amount: "1200.00", dims,
    settlement: { kind: "ACCOUNT", accountCode: "1010" },
  });
  const a = byAccount(d);
  assert.equal(a["1010"].debit, 120000n);
  assert.equal(a[ACCOUNT.PAYABLES].credit, 120000n);
});

test("return then refund nets the supplier account to zero and the cash comes back", () => {
  const ret = supplierReturnEntry({
    id: 1, returnNo: "DN-0001", date: "2026-10-24", dims,
    costValue: "500.00", agreedValue: "500.00",
  });
  const refund = supplierRefundEntry({
    id: 1, date: "2026-10-25", amount: "500.00", dims,
    settlement: { kind: "ACCOUNT", accountCode: "1010" },
  });
  const tb = Object.fromEntries(trialBalance([ret, refund]).map((r) => [r.accountCode, r]));
  assert.equal(tb[ACCOUNT.PAYABLES].debit, tb[ACCOUNT.PAYABLES].credit);
});

test("free stock is always a business expense at cost", () => {
  const d = freeStockEntry({
    id: 1, entryNo: "FS-0001", date: "2026-10-24", cost: "850.00",
    givenTo: "Ravi (sample)", dims: { divisionId: 1, branchId: 2 },
  });
  const a = byAccount(d);
  assert.equal(a[ACCOUNT.GIFTS].debit, 85000n);
  assert.equal(a[ACCOUNT.INVENTORY].credit, 85000n);
  assert.equal(d.sourceType, "FREE_STOCK");
});

test("statement runs a balance: bill, return, payment, refund", () => {
  const { rows, balance } = buildStatement([
    { date: "2026-10-02", kind: "PAYMENT", ref: "P1", amount: 400000n },
    { date: "2026-10-01", kind: "BILL", ref: "B1", amount: 1000000n },
    { date: "2026-10-03", kind: "RETURN", ref: "DN-1", amount: 700000n },
    { date: "2026-10-04", kind: "REFUND", ref: "R1", amount: 50000n },
  ]);
  assert.deepEqual(rows.map((r) => r.kind), ["BILL", "PAYMENT", "RETURN", "REFUND"]);
  assert.equal(rows[1].balance, 600000n);
  assert.equal(rows[2].balance, -100000n); // supplier now owes us
  assert.equal(balance, -50000n);
});

test("ageing counts payments and returns against the oldest bills first", () => {
  const ageing = ageDues(
    [
      { date: "2026-06-01", amount: 100000n }, // 145 days old on 24 Oct
      { date: "2026-09-01", amount: 200000n }, // 53 days
      { date: "2026-10-20", amount: 300000n }, // 4 days
    ],
    150000n,
    "2026-10-24"
  );
  assert.equal(ageing.over90, 0n); // oldest bill fully covered
  assert.equal(ageing.from31to60, 150000n); // 200000 - 50000 left over
  assert.equal(ageing.upTo30, 300000n);
  assert.equal(ageing.totalDue, 450000n);
  assert.equal(ageing.unusedCredit, 0n);
});

test("credit bigger than all bills is reported as unused credit", () => {
  const ageing = ageDues([{ date: "2026-10-01", amount: 100000n }], 250000n, "2026-10-24");
  assert.equal(ageing.totalDue, 0n);
  assert.equal(ageing.unusedCredit, 150000n);
});

test("free stock lowers operating profit and a supplier-return loss lowers gross profit", () => {
  const L = (accountCode, debit, credit) => ({
    accountCode, divisionId: 1, branchId: 1, debit: BigInt(debit * 100), credit: BigInt(credit * 100),
  });
  const rows = profitByScope(
    [L("4000", 0, 1000), L("5000", 400, 0), L("5160", 20, 0), L("6045", 50, 0)],
    new Map([[1, 1]])
  );
  const g = rows[0].figures;
  assert.equal(g.gross, 58000n); // 1000 - 400 - 20
  assert.equal(g.operating, 53000n); // gross - 50 free stock
});
