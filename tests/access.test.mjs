import test from "node:test";
import assert from "node:assert/strict";
import { canAccess, canOpenPath, featureForPath, homePath, ASSIGNABLE_ROLES } from "../src/lib/access.ts";

test("owner can open everything, including unlisted pages", () => {
  for (const p of ["/dashboard", "/users", "/accounting/opening-balances", "/funding/agreements/3"]) {
    assert.equal(canOpenPath("GROUP_OWNER", p), true, p);
  }
});

test("cashier gets sales and returns only", () => {
  assert.equal(canOpenPath("CASHIER", "/accounting/sales"), true);
  assert.equal(canOpenPath("CASHIER", "/accounting/sales/12"), true);
  assert.equal(canOpenPath("CASHIER", "/accounting/returns"), true);
  for (const p of ["/dashboard", "/accounting/reports", "/accounting/purchases", "/accounting/expenses", "/users", "/accounting/journals"]) {
    assert.equal(canOpenPath("CASHIER", p), false, p);
  }
  assert.equal(homePath("CASHIER"), "/accounting/sales");
});

test("accountant gets operations and reports but nothing that posts or sets up", () => {
  for (const p of ["/dashboard", "/accounting/reports", "/accounting/sales", "/accounting/purchases/4/payments", "/accounting/expenses/2", "/accounting/products"]) {
    assert.equal(canOpenPath("ACCOUNTANT", p), true, p);
  }
  for (const p of ["/users", "/accounting/opening-balances", "/accounting/periods", "/accounting/journals", "/funding", "/group", "/accounting/bank-accounts", "/accounting/chart-of-accounts"]) {
    assert.equal(canOpenPath("ACCOUNTANT", p), false, p);
  }
  assert.equal(homePath("ACCOUNTANT"), "/dashboard");
});

test("unlisted paths and look-alike prefixes are not opened to staff", () => {
  assert.equal(featureForPath("/accounting/salesx"), null);
  assert.equal(canOpenPath("ACCOUNTANT", "/accounting/sales-evil"), false);
  assert.equal(canOpenPath("CASHIER", "/accounting/sales-purchase-report"), false);
});

test("investor and lender roles cannot open anything yet", () => {
  for (const role of ["INVESTOR", "LENDER", "DIVISION_MANAGER"]) {
    assert.equal(canAccess(role, "dashboard"), false);
    assert.equal(canAccess(role, "sales"), false);
  }
  assert.deepEqual(ASSIGNABLE_ROLES, ["ACCOUNTANT", "CASHIER", "AUDITOR"]);
});

test("supplier returns are for owner and accountant; free stock can be asked by cashier but approved only by owner and accountant", async () => {
  const { canApproveFreeStock } = await import("../src/lib/access.ts");
  for (const p of ["/accounting/supplier-returns", "/accounting/supplier-returns/4", "/accounting/supplier-statement"]) {
    assert.equal(canOpenPath("ACCOUNTANT", p), true, p);
    assert.equal(canOpenPath("CASHIER", p), false, p);
  }
  assert.equal(canOpenPath("CASHIER", "/accounting/free-stock"), true);
  assert.equal(canOpenPath("ACCOUNTANT", "/accounting/free-stock"), true);
  assert.equal(canApproveFreeStock("CASHIER"), false);
  assert.equal(canApproveFreeStock("ACCOUNTANT"), true);
  assert.equal(canApproveFreeStock("GROUP_OWNER"), true);
  assert.equal(canApproveFreeStock("INVESTOR"), false);
});

test("items on approval are open to staff; only owner and accountant can join customers", async () => {
  const { canMergeCustomers } = await import("../src/lib/access.ts");
  for (const role of ["GROUP_OWNER", "ACCOUNTANT", "CASHIER"]) {
    assert.equal(canOpenPath(role, "/accounting/approval-items"), true, role);
  }
  assert.equal(canOpenPath("INVESTOR", "/accounting/approval-items"), false);
  assert.equal(canMergeCustomers("CASHIER"), false);
  assert.equal(canMergeCustomers("ACCOUNTANT"), true);
  assert.equal(canMergeCustomers("GROUP_OWNER"), true);
});

test("auditor can only look: reports, ledger lines, change history and account balances", () => {
  for (const p of ["/accounting/reports", "/accounting/account-balances", "/accounting/audit/ledger", "/accounting/audit/changes"]) {
    assert.equal(canOpenPath("AUDITOR", p), true, p);
  }
  for (const p of ["/dashboard", "/accounting/sales", "/accounting/sales/12", "/accounting/invoices", "/accounting/purchases", "/accounting/expenses",
    "/accounting/journals", "/accounting/journals/3", "/accounting/chart-of-accounts", "/accounting/opening-balances", "/accounting/stock-count",
    "/accounting/cash-closing", "/accounting/customers", "/users", "/funding", "/group"]) {
    assert.equal(canOpenPath("AUDITOR", p), false, p);
  }
  assert.equal(homePath("AUDITOR"), "/accounting/reports");
  assert.equal(canOpenPath("ACCOUNTANT", "/accounting/audit/ledger"), false);
});
