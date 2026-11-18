import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT,
  expenseEntry,
  gstPaymentEntry,
  purchaseReceiptEntry,
  saleInvoiceEntry,
  salesReturnEntry,
  supplierReturnEntry,
  trialBalance,
} from "../src/lib/ledger/posting-rules.ts";

const dims = { divisionId: 1, branchId: 1 };
const D = "2027-04-10";
const bal = (drafts, code) => {
  const row = trialBalance(drafts).find((r) => r.accountCode === code);
  return row ? row.debit - row.credit : 0n;
};

test("a GST month in the books: purchase, sale, returns, expenses, payment", () => {
  const drafts = [];
  // Bought 10 pieces for Rs 10,500 including 5% GST from a registered supplier: Rs 500 input credit.
  drafts.push(purchaseReceiptEntry({ id: 1, purchaseNo: "PUR-1", date: D, dims, total: "10500.00", credit: { cgst: "250.00", sgst: "250.00", igst: "0" } }));
  // Sold for Rs 21,000 including 5% GST (Rs 1,000), cost Rs 10,000; delivery Rs 118 including 18% (Rs 18).
  drafts.push(saleInvoiceEntry({
    id: 1, invoiceNo: "SA-1", date: D, dims, subtotal: "21000.00", discount: "0.00", grandTotal: "21118.00", shipping: "118.00", costOfGoodsSold: "10000.00",
    goodsTax: { cgst: "500.00", sgst: "500.00", igst: "0" }, shippingTax: { cgst: "9.00", sgst: "9.00", igst: "0" },
  }));
  assert.equal(bal(drafts, ACCOUNT.SALES), -2000000n); // Rs 20,000 net of GST
  assert.equal(bal(drafts, ACCOUNT.DELIVERY_INCOME), -10000n);
  // Customer returned one piece: Rs 2,100 back including Rs 100 GST.
  drafts.push(salesReturnEntry({
    id: 1, returnNo: "RT-1", invoiceNo: "SA-1", date: D, dims, grossValue: "2100.00", refundValue: "2100.00", restockCost: "1000.00", damagedCost: "0.00",
    tax: { cgst: "50.00", sgst: "50.00", igst: "0" }, deliveryTax: "0",
  }));
  // One piece back to the supplier at full credit: Rs 1,050 billed = Rs 1,000 stock + Rs 50 credit taken back.
  drafts.push(supplierReturnEntry({ id: 1, returnNo: "DN-1", date: D, dims, costValue: "1000.00", agreedValue: "1050.00", credit: { cgst: "25.00", sgst: "25.00", igst: "0" } }));
  // Phone bill Rs 1,180 with 18% GST (claimed); rent Rs 10,000 from an unregistered owner under reverse charge (Rs 1,800).
  drafts.push(expenseEntry({ id: 1, expenseNo: "EX-1", date: D, category: "INTERNET_PHONE", description: "Phone", amount: "1180.00", dims, gst: { mode: "ITC", amounts: { cgst: "90.00", sgst: "90.00", igst: "0" } } }));
  drafts.push(expenseEntry({ id: 2, expenseNo: "EX-2", date: D, category: "RENT", description: "Rent", amount: "10000.00", dims, gst: { mode: "RCM", amounts: { cgst: "900.00", sgst: "900.00", igst: "0" } } }));
  assert.equal(bal(drafts, "6060"), 100000n); // phone cost without GST
  assert.equal(bal(drafts, "6000"), 1000000n); // rent cost; GST is claimed back

  // Output CGST: 500 + 9 - 50 = Rs 459 (same for SGST). Input: 250 - 25 + 90 + 900 = Rs 1,215 each half.
  assert.equal(bal(drafts, ACCOUNT.GST_OUTPUT_CGST), -45900n);
  assert.equal(bal(drafts, ACCOUNT.GST_INPUT_CGST), 121500n);
  assert.equal(bal(drafts, ACCOUNT.GST_RCM_PAYABLE), -180000n);

  // Pay: output fully covered by credit (459 + 459), reverse charge Rs 1,800 in cash.
  drafts.push(gstPaymentEntry({
    id: 1, paymentNo: "GSTP-1", date: "2027-05-20", dims,
    settled: { cgst: "459.00", sgst: "459.00", igst: "0" }, credit: { cgst: "459.00", sgst: "459.00", igst: "0" },
    rcmCash: "1800.00", compositionTax: "0", interestFee: "0", cashTotal: "1800.00",
    settlement: { kind: "ACCOUNT", accountCode: "1011" },
  }));
  assert.equal(bal(drafts, ACCOUNT.GST_OUTPUT_CGST), 0n);
  assert.equal(bal(drafts, ACCOUNT.GST_RCM_PAYABLE), 0n);
  assert.equal(bal(drafts, ACCOUNT.GST_INPUT_CGST), 75600n); // Rs 756 credit carried forward
  const tb = trialBalance(drafts);
  assert.equal(tb.reduce((t, r) => t + r.debit, 0n), tb.reduce((t, r) => t + r.credit, 0n));
});

test("without GST every entry is as before", () => {
  const p = purchaseReceiptEntry({ id: 1, purchaseNo: "P", date: D, dims, total: "100.00" });
  assert.equal(p.lines.length, 2);
  const s = saleInvoiceEntry({ id: 1, invoiceNo: "S", date: D, dims, subtotal: "100.00", discount: "0.00", grandTotal: "100.00", costOfGoodsSold: "50.00" });
  assert.equal(s.lines.length, 4);
});

test("a GST payment that does not add up is refused; composition tax is a cost", () => {
  assert.throws(() => gstPaymentEntry({
    id: 2, paymentNo: "GSTP-2", date: D, dims, settled: { cgst: "100.00", sgst: "0", igst: "0" }, credit: { cgst: "0", sgst: "0", igst: "0" },
    rcmCash: "0", compositionTax: "0", interestFee: "0", cashTotal: "50.00", settlement: { kind: "ACCOUNT", accountCode: "1011" },
  }));
  const c = gstPaymentEntry({
    id: 3, paymentNo: "GSTP-3", date: D, dims, settled: { cgst: "0", sgst: "0", igst: "0" }, credit: { cgst: "0", sgst: "0", igst: "0" },
    rcmCash: "0", compositionTax: "2500.00", interestFee: "50.00", cashTotal: "2550.00", settlement: { kind: "ACCOUNT", accountCode: "1011" },
  });
  assert.equal(c.lines.find((l) => l.accountCode === ACCOUNT.GST_COMPOSITION).debit, 250000n);
});
