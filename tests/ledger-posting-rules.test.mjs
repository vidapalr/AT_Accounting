import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCOUNT,
  parseMoney,
  formatMoney,
  saleInvoiceEntry,
  salesReceiptEntry,
  purchaseReceiptEntry,
  purchasePaymentEntry,
  expenseEntry,
  expensePaymentEntry,
  depositPaidEntry,
  depositRefundEntry,
  openingBalanceEntry,
  trialBalance,
} from "../src/lib/ledger/posting-rules.ts";

const dims = { divisionId: 1, branchId: 1 };
const bank = { kind: "ACCOUNT", accountCode: "1010" };

function byAccount(draft) {
  const out = {};
  for (const l of draft.lines) {
    out[l.accountCode] = { debit: l.debit, credit: l.credit };
  }
  return out;
}

test("money is exact in paise, including very large amounts", () => {
  assert.equal(parseMoney("11050.00"), 1105000n);
  assert.equal(parseMoney("0.5"), 50n);
  assert.equal(formatMoney(1105000n), "11050.00");
  assert.equal(formatMoney(-5n), "-0.05");
  assert.equal(
    formatMoney(parseMoney("9999999999999999.99")),
    "9999999999999999.99"
  );
  assert.throws(() => parseMoney("1.234"));
  assert.throws(() => parseMoney("-1"));
  assert.throws(() => parseMoney("abc"));
});

test("sale with discount: receivable, discount, sales, and cost of goods", () => {
  // Real shape: subtotal 47,400, discount 400, total 47,000, cost 29,500
  const d = saleInvoiceEntry({
    id: 2,
    invoiceNo: "AB_AT_AT_SA_02",
    date: "2026-10-20",
    dims,
    subtotal: "47400.00",
    discount: "400.00",
    grandTotal: "47000.00",
    costOfGoodsSold: "29500.00",
  });
  const a = byAccount(d);
  assert.equal(a[ACCOUNT.RECEIVABLES].debit, 4700000n);
  assert.equal(a[ACCOUNT.SALES_DISCOUNTS].debit, 40000n);
  assert.equal(a[ACCOUNT.SALES].credit, 4740000n);
  assert.equal(a[ACCOUNT.COGS].debit, 2950000n);
  assert.equal(a[ACCOUNT.INVENTORY].credit, 2950000n);
  assert.equal(d.lines.length, 5);
});

test("sale without discount or cost omits the zero lines", () => {
  const d = saleInvoiceEntry({
    id: 1,
    invoiceNo: "X",
    date: "2026-10-20",
    dims,
    subtotal: "100.00",
    discount: "0.00",
    grandTotal: "100.00",
    costOfGoodsSold: "0.00",
  });
  assert.deepEqual(
    d.lines.map((l) => l.accountCode).sort(),
    [ACCOUNT.RECEIVABLES, ACCOUNT.SALES].sort()
  );
});

test("an invoice whose figures do not add up is refused, not guessed at", () => {
  assert.throws(
    () =>
      saleInvoiceEntry({
        id: 1,
        invoiceNo: "BAD",
        date: "2026-10-20",
        dims,
        subtotal: "100.00",
        discount: "10.00",
        grandTotal: "95.00",
        costOfGoodsSold: "50.00",
      }),
    /does not equal total/
  );
});

test("receipts into a business bank, cash, and the investor's bank", () => {
  const into = (settlement) =>
    byAccount(
      salesReceiptEntry({
        id: 1,
        invoiceNo: "X",
        date: "2026-10-20",
        amount: "250.00",
        dims,
        settlement,
      })
    );

  assert.equal(into(bank)["1010"].debit, 25000n);
  assert.equal(into({ kind: "INVESTOR" })[ACCOUNT.INVESTOR_CAPITAL].debit, 25000n);
  assert.equal(into(bank)[ACCOUNT.RECEIVABLES].credit, 25000n);
  assert.throws(() =>
    salesReceiptEntry({
      id: 1,
      invoiceNo: "X",
      date: "2026-10-20",
      amount: "1.00",
      dims,
      settlement: { kind: "OWNER" },
    })
  );
});

test("supplier payments credit the right source", () => {
  const pay = (settlement) =>
    byAccount(
      purchasePaymentEntry({
        id: 1,
        paymentNo: "P1",
        date: "2026-10-21",
        amount: "32000.00",
        dims: { divisionId: 1, branchId: null },
        settlement,
      })
    );

  assert.equal(pay(bank)["1010"].credit, 3200000n);
  assert.equal(pay({ kind: "INVESTOR" })[ACCOUNT.INVESTOR_CAPITAL].credit, 3200000n);
  assert.equal(pay({ kind: "OWNER" })[ACCOUNT.PROPRIETOR_CAPITAL].credit, 3200000n);
  assert.equal(pay(bank)[ACCOUNT.PAYABLES].debit, 3200000n);
});

test("expenses map to their accounts and unknown categories are refused", () => {
  const e = (category) =>
    expenseEntry({
      id: 1,
      expenseNo: "E1",
      date: "2026-10-12",
      category,
      description: "x",
      amount: "550.00",
      dims,
    });

  assert.equal(byAccount(e("OFFICE_SUPPLIES"))["6070"].debit, 55000n);
  assert.equal(byAccount(e("PACKING"))["6035"].debit, 55000n);
  assert.equal(byAccount(e("MISCELLANEOUS"))["6090"].debit, 55000n);
  assert.equal(byAccount(e("RENT"))[ACCOUNT.ACCRUED_EXPENSES].credit, 55000n);
  assert.throws(() => e("HOLIDAY"), /No ledger account mapped/);
});

test("expense payment clears accrued expenses from the paying source", () => {
  const a = byAccount(
    expensePaymentEntry({
      id: 1,
      expenseNo: "E1",
      date: "2026-10-12",
      amount: "2500.00",
      dims,
      settlement: { kind: "OWNER" },
    })
  );
  assert.equal(a[ACCOUNT.ACCRUED_EXPENSES].debit, 250000n);
  assert.equal(a[ACCOUNT.PROPRIETOR_CAPITAL].credit, 250000n);
});

test("refundable shop deposit paid by the investor, then refunded", () => {
  const paid = byAccount(
    depositPaidEntry({
      id: 1,
      advanceNo: "AD1",
      date: "2026-10-12",
      amount: "50000.00",
      dims,
      settlement: { kind: "INVESTOR" },
    })
  );
  assert.equal(paid[ACCOUNT.DEPOSITS].debit, 5000000n);
  assert.equal(paid[ACCOUNT.INVESTOR_CAPITAL].credit, 5000000n);

  const refund = byAccount(
    depositRefundEntry({
      id: 2,
      advanceNo: "AD1",
      date: "2026-12-01",
      amount: "50000.00",
      dims,
      settlement: bank,
    })
  );
  assert.equal(refund["1010"].debit, 5000000n);
  assert.equal(refund[ACCOUNT.DEPOSITS].credit, 5000000n);
});

test("opening balance must balance", () => {
  const good = openingBalanceEntry({
    id: 1,
    date: "2026-10-12",
    description: "Opening",
    lines: [
      { accountCode: "1010", debit: "13234.00", credit: "0.00", dims: { divisionId: null, branchId: null }, memo: "" },
      { accountCode: "1011", debit: "10644.00", credit: "0.00", dims: { divisionId: null, branchId: null }, memo: "" },
      { accountCode: "3000", debit: "0.00", credit: "23878.00", dims: { divisionId: null, branchId: null }, memo: "" },
    ],
  });
  assert.equal(good.lines.length, 3);

  assert.throws(
    () =>
      openingBalanceEntry({
        id: 1,
        date: "2026-10-12",
        description: "Opening",
        lines: [
          { accountCode: "1010", debit: "100.00", credit: "0.00", dims: { divisionId: null, branchId: null }, memo: "" },
          { accountCode: "3000", debit: "0.00", credit: "99.00", dims: { divisionId: null, branchId: null }, memo: "" },
        ],
      }),
    /does not balance/
  );
});

test("books always satisfy: assets = liabilities + capital + profit", () => {
  const drafts = [
    openingBalanceEntry({
      id: 1,
      date: "2026-10-12",
      description: "Opening",
      lines: [
        { accountCode: "1010", debit: "1000.00", credit: "0.00", dims: { divisionId: null, branchId: null }, memo: "" },
        { accountCode: "3000", debit: "0.00", credit: "1000.00", dims: { divisionId: null, branchId: null }, memo: "" },
      ],
    }),
    purchaseReceiptEntry({ id: 1, purchaseNo: "P", date: "2026-10-16", dims: { divisionId: 1, branchId: null }, total: "5000.00" }),
    purchasePaymentEntry({ id: 1, paymentNo: "PP", date: "2026-10-16", amount: "3000.00", dims, settlement: { kind: "INVESTOR" } }),
    saleInvoiceEntry({ id: 1, invoiceNo: "S", date: "2026-10-17", dims, subtotal: "900.00", discount: "50.00", grandTotal: "850.00", costOfGoodsSold: "500.00" }),
    salesReceiptEntry({ id: 1, invoiceNo: "S", date: "2026-10-17", amount: "600.00", dims, settlement: bank }),
    expenseEntry({ id: 1, expenseNo: "E", date: "2026-10-18", category: "PACKING", description: "", amount: "120.00", dims }),
    expensePaymentEntry({ id: 1, expenseNo: "E", date: "2026-10-18", amount: "120.00", dims, settlement: { kind: "OWNER" } }),
    depositPaidEntry({ id: 1, advanceNo: "AD", date: "2026-10-12", amount: "700.00", dims, settlement: { kind: "INVESTOR" } }),
  ];

  const tb = trialBalance(drafts);
  const net = (prefix) =>
    tb
      .filter((r) => r.accountCode.startsWith(prefix))
      .reduce((s, r) => s + r.debit - r.credit, 0n);

  const assets = net("1");
  const liabilities = -net("2");
  const equity = -net("3");
  const profit = -(net("4") + net("5") + net("6")); // revenue less expenses

  assert.equal(assets, liabilities + equity + profit);

  // And the trial balance itself balances.
  const totalDebit = tb.reduce((s, r) => s + r.debit, 0n);
  const totalCredit = tb.reduce((s, r) => s + r.credit, 0n);
  assert.equal(totalDebit, totalCredit);

  // Profit = sales 850 - discounts already netted via 4200 - cost 500 - packing 120
  assert.equal(profit, parseMoney("230.00"));
});

test("set-up costs go to their own account, not the category account", () => {
  const d = expenseEntry({
    id: 1,
    expenseNo: "E1",
    date: "2026-10-12",
    category: "OFFICE_SUPPLIES",
    description: "fit-out",
    amount: "4400.00",
    dims,
    isSetupCost: true,
  });
  const a = byAccount(d);
  assert.equal(a["6900"].debit, 440000n);
  assert.equal(a["6070"], undefined);
  assert.equal(a[ACCOUNT.ACCRUED_EXPENSES].credit, 440000n);
});
