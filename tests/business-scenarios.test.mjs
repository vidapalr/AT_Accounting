import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT, saleInvoiceEntry, salesReceiptEntry, salesReturnEntry, salesRefundEntry, purchaseReceiptEntry,
  purchasePaymentEntry, expenseEntry, expensePaymentEntry, stockDamageEntry, ownerMoneyEntry, fundingReceiptEntry,
  cashTakenEntry, trialBalance,
} from "../src/lib/ledger/posting-rules.ts";

// Not covered here (they need the database): 4. stock transfers (no journal, stock only moves) and 10. a closed period
// blocking a backdated entry. Those are checked on the test database by hand.
// One small business year, in order. Each step is checked on its own, then the whole book is reconciled.
const dims = { divisionId: 1, branchId: 1 };
const none = { divisionId: null, branchId: null };
const bank = { kind: "ACCOUNT", accountCode: "1010" };
const cash = { kind: "ACCOUNT", accountCode: "1001" };
const D = "2026-10-28";

const drafts = [];
const step = (draft) => { drafts.push(draft); return draft; };
const net = (code) => trialBalance(drafts).filter((r) => r.accountCode === code).reduce((s, r) => s + r.debit - r.credit, 0n);
const rs = (n) => BigInt(n) * 100n;

test("1. Owner invests 1,00,000 into the business bank", () => {
  const d = step(ownerMoneyEntry({ id: 1, entryNo: "OWN-1", direction: "IN", date: D, amount: "100000.00", note: "", dims: none, settlement: bank }));
  assert.equal(net("1010"), rs(100000));
  assert.equal(net("3000"), -rs(100000));
  assert.equal(d.lines.length, 2);
});

test("2. Owner pays 10,000 rent personally: an expense, capital up, bank untouched", () => {
  step(expenseEntry({ id: 1, expenseNo: "EXP-1", date: D, category: "RENT", description: "rent", amount: "10000.00", dims }));
  step(expensePaymentEntry({ id: 1, expenseNo: "EXP-1", date: D, amount: "10000.00", dims, settlement: { kind: "OWNER" } }));
  assert.equal(net("6000"), rs(10000));
  assert.equal(net("3000"), -rs(110000));
  assert.equal(net("1010"), rs(100000), "business bank must not move");
  assert.equal(net("2200"), 0n, "nothing left owing for the rent");
});

test("3. Purchase of 50,000: 30,000 paid, 20,000 still owed", () => {
  step(purchaseReceiptEntry({ id: 1, purchaseNo: "PUR-1", date: D, dims, total: "50000.00" }));
  step(purchasePaymentEntry({ id: 1, paymentNo: "PAY-1", date: D, amount: "30000.00", dims, settlement: bank }));
  assert.equal(net("1200"), rs(50000));
  assert.equal(net("2000"), -rs(20000));
  assert.equal(net("1010"), rs(70000));
});

test("5. Retail sale: cost 500, sold for 800, paid in cash", () => {
  step(saleInvoiceEntry({ id: 1, invoiceNo: "INV-1", date: D, dims, subtotal: "800.00", discount: "0.00", grandTotal: "800.00", costOfGoodsSold: "500.00" }));
  step(salesReceiptEntry({ id: 1, invoiceNo: "INV-1", date: D, amount: "800.00", dims, settlement: cash }));
  assert.equal(net("4000"), -rs(800));
  assert.equal(net("5000"), rs(500));
  assert.equal(net("1100"), 0n);
  assert.equal(net("1001"), rs(800));
});

test("6. Bill discount: sales shown in full, discount shown separately, customer pays the lower amount", () => {
  step(saleInvoiceEntry({ id: 2, invoiceNo: "INV-2", date: D, dims, subtotal: "2000.00", discount: "200.00", grandTotal: "1800.00", costOfGoodsSold: "1000.00" }));
  step(salesReceiptEntry({ id: 2, invoiceNo: "INV-2", date: D, amount: "1800.00", dims, settlement: cash }));
  assert.equal(net("4200"), rs(200));
  assert.equal(net("1100"), 0n);
});

test("6b. A bill whose discount does not add up is refused", () => {
  assert.throws(() => saleInvoiceEntry({ id: 3, invoiceNo: "INV-3", date: D, dims, subtotal: "2000.00", discount: "200.00", grandTotal: "1900.00", costOfGoodsSold: "1000.00" }));
});

test("7. Customer returns the 800 item and is refunded: profit on it is reversed, stock back", () => {
  step(salesReturnEntry({ id: 1, returnNo: "RET-1", invoiceNo: "INV-1", date: D, dims, grossValue: "800.00", refundValue: "800.00", restockCost: "500.00", damagedCost: "0.00" }));
  step(salesRefundEntry({ id: 1, returnNo: "RET-1", date: D, amount: "800.00", dims, settlement: cash }));
  assert.equal(net("4210"), rs(800));
  assert.equal(net("5000"), rs(1000), "cost of goods: 500 + 1000 - 500 restocked");
  assert.equal(net("1100"), 0n);
  assert.equal(net("1001"), rs(1800), "800 + 1800 - 800 refunded");
});

test("8. Unsellable stock written off: loss up, stock down", () => {
  step(stockDamageEntry({ id: 1, date: D, reason: "DAMAGED", cost: "300.00", dims }));
  assert.equal(net("5150"), rs(300));
  assert.equal(net("1200"), rs(50000) - rs(500) - rs(1000) + rs(500) - rs(300));
});

test("9. Investor puts in 2,00,000: Investor Capital, not the owner's capital, not income", () => {
  step(fundingReceiptEntry({ id: 1, txNo: "FTX-1", kind: "RECEIVED", date: D, amount: "200000.00", agreementNo: "AGR-1", dims, settlement: bank }));
  assert.equal(net("3200"), -rs(200000));
  assert.equal(net("3000"), -rs(110000), "owner capital unchanged by investor money");
  assert.equal(net("1010"), rs(270000));
});

test("9b. Cash taken to the bank at day end: bank up, drawer down, nothing else", () => {
  step(cashTakenEntry({ id: 1, date: D, amount: "1500.00", to: "BANK", dims, cash, target: bank }));
  assert.equal(net("1010"), rs(271500));
  assert.equal(net("1001"), rs(300));
});

test("Whole book: every entry balanced, totals tie, profit is what the steps imply", () => {
  for (const d of drafts) {
    const dr = d.lines.reduce((s, l) => s + l.debit, 0n);
    const cr = d.lines.reduce((s, l) => s + l.credit, 0n);
    assert.equal(dr, cr, `${d.sourceType} ${d.sourceId} is not balanced`);
  }
  const tb = trialBalance(drafts);
  assert.equal(tb.reduce((s, r) => s + r.debit, 0n), tb.reduce((s, r) => s + r.credit, 0n));
  // Profit: sales 2800 - discounts 200 - returns 800 - cost 1000 - damage 300 - rent 10000 = -9500
  const profit = -(net("4000") + net("4200") + net("4210") + net("5000") + net("5150") + net("6000"));
  assert.equal(profit, -rs(9500));
  assert.equal(net("2000"), -rs(20000), "supplier still owed 20,000");
  assert.equal(ACCOUNT.INVESTOR_CAPITAL, "3200");
});
