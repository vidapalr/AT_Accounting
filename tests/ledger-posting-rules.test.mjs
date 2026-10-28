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

import { salesReturnEntry, salesRefundEntry, stockDamageEntry } from "../src/lib/ledger/posting-rules.ts";

test("return of resellable goods: sale reversed, stock restored, cost reversed", () => {
  // 2 pieces sold at 700 gross, 8% of the invoice was discount -> customer paid 1288
  const d = salesReturnEntry({
    id: 1, returnNo: "R1", invoiceNo: "I1", date: "2026-10-23", dims,
    grossValue: "1400.00", refundValue: "1288.00",
    restockCost: "780.00", damagedCost: "0.00",
  });
  const a = byAccount(d);
  assert.equal(a["4210"].debit, 140000n);
  assert.equal(a["4200"].credit, 11200n);
  assert.equal(a["1100"].credit, 128800n);
  assert.equal(a["1200"].debit, 78000n);
  assert.equal(a["5000"].credit, 78000n);
  assert.equal(a["5150"], undefined);
});

test("return of damaged goods: cost moves from cost of goods to damaged stock, no restock", () => {
  const a = byAccount(
    salesReturnEntry({
      id: 1, returnNo: "R2", invoiceNo: "I1", date: "2026-10-23", dims,
      grossValue: "700.00", refundValue: "700.00",
      restockCost: "0.00", damagedCost: "390.00",
    })
  );
  assert.equal(a["5150"].debit, 39000n);
  assert.equal(a["5000"].credit, 39000n);
  assert.equal(a["1200"], undefined);
});

test("a refund larger than the selling value is refused", () => {
  assert.throws(() =>
    salesReturnEntry({
      id: 1, returnNo: "R3", invoiceNo: "I1", date: "2026-10-23", dims,
      grossValue: "100.00", refundValue: "101.00", restockCost: "0.00", damagedCost: "0.00",
    })
  );
});

test("refund pays the customer back from the right source", () => {
  const out = (settlement) =>
    byAccount(salesRefundEntry({ id: 1, returnNo: "R1", date: "2026-10-23", amount: "500.00", dims, settlement }));
  assert.equal(out(bank)["1100"].debit, 50000n);
  assert.equal(out(bank)["1010"].credit, 50000n);
  assert.equal(out({ kind: "INVESTOR" })["3200"].credit, 50000n);
  assert.throws(() => out({ kind: "OWNER" }));
});

test("damaged stock write-off reduces inventory and gross profit", () => {
  const a = byAccount(stockDamageEntry({ id: 1, date: "2026-10-23", reason: "DAMAGED", cost: "1950.00", dims }));
  assert.equal(a["5150"].debit, 195000n);
  assert.equal(a["1200"].credit, 195000n);
});

import { setupCapitalisationEntry } from "../src/lib/ledger/posting-rules.ts";

test("set-up costs move from expense to an asset so profit is not reduced", () => {
  const drafts = [
    expenseEntry({ id: 1, expenseNo: "E1", date: "2026-10-12", category: "MISCELLANEOUS", description: "", amount: "25000.00", dims, isSetupCost: true }),
    setupCapitalisationEntry({ id: 1, expenseNo: "E1", date: "2026-10-12", amount: "25000.00", dims }),
  ];
  const tb = Object.fromEntries(trialBalance(drafts).map((r) => [r.accountCode, r.debit - r.credit]));
  assert.equal(tb["1320"], 2500000n);   // carried as an asset
  assert.equal(tb["6900"], 0n);          // nothing left in expenses
  assert.equal(tb["2200"], -2500000n);   // still owed to whoever paid
});

import { salesSettlementDiscountEntry } from "../src/lib/ledger/posting-rules.ts";

test("a settlement discount books a sales discount and clears what the customer owed", () => {
  const d = salesSettlementDiscountEntry({ id: 9, invoiceNo: "INV-9", date: "2026-10-24", amount: "50.00", dims });
  const a = byAccount(d);
  assert.equal(a["4200"].debit, 5000n);
  assert.equal(a["1100"]?.credit ?? a[Object.keys(a).find((k) => k !== "4200")].credit, 5000n);
  assert.equal(d.lines.reduce((s, l) => s + l.debit - l.credit, 0n), 0n);
});

import { auditorAdjustmentEntry } from "../src/lib/ledger/posting-rules.ts";

test("an auditor adjustment posts exactly the lines given and must balance", () => {
  const d = auditorAdjustmentEntry({
    id: 1, adjustmentNo: "ADJ-0001", date: "2026-10-25", reason: "Rent booked as miscellaneous",
    lines: [
      { accountCode: "6000", debit: "500.00", credit: "", memo: "", dims },
      { accountCode: "6090", debit: "", credit: "500.00", memo: "", dims },
    ],
  });
  const a = byAccount(d);
  assert.equal(a["6000"].debit, 50000n);
  assert.equal(a["6090"].credit, 50000n);
  assert.equal(d.sourceType, "AUDITOR_ADJUSTMENT");
  assert.throws(() => auditorAdjustmentEntry({
    id: 2, adjustmentNo: "ADJ-0002", date: "2026-10-25", reason: "x",
    lines: [
      { accountCode: "6000", debit: "500.00", credit: "", memo: "", dims },
      { accountCode: "6090", debit: "", credit: "400.00", memo: "", dims },
    ],
  }), /does not balance/);
});

import { partySetoffEntry } from "../src/lib/ledger/posting-rules.ts";

test("a set-off lowers payables and receivables by the same amount, with no cash or bank", () => {
  const d = partySetoffEntry({
    id: 1, setoffNo: "SO-0001", date: "2026-10-26", partyName: "Test",
    payableParts: [{ amount: "900.00", dims }],
    receivableParts: [{ amount: "400.00", dims }, { amount: "500.00", dims }],
  });
  assert.equal(d.sourceType, "PARTY_SETOFF");
  assert.equal(d.lines.reduce((s, l) => s + l.debit - l.credit, 0n), 0n);
  assert.deepEqual([...new Set(d.lines.map((l) => l.accountCode))].sort(), ["1100", "2000"]);
  assert.throws(() => partySetoffEntry({
    id: 2, setoffNo: "SO-2", date: "2026-10-26", partyName: "x",
    payableParts: [{ amount: "10.00", dims }], receivableParts: [{ amount: "9.00", dims }],
  }));
});

import { fixedAssetPurchaseEntry, assetDepreciationEntry, assetDisposalEntry } from "../src/lib/ledger/posting-rules.ts";

test("fixed assets: purchase, monthly wear and a sale at a loss all balance on the right accounts", () => {
  const bank = { kind: "ACCOUNT", accountCode: "1010" };
  const buy = fixedAssetPurchaseEntry({ id: 1, assetNo: "FA-1", name: "Racks", date: "2026-07-10", cost: "120000.00", dims, settlement: bank });
  assert.deepEqual(buy.lines.map((l) => l.accountCode).sort(), ["1010", "1500"]);
  const dep = assetDepreciationEntry({ id: 1, period: "2026-07", date: "2026-07-31", total: "2000.00", dims });
  assert.deepEqual(dep.lines.map((l) => l.accountCode).sort(), ["1510", "6100"]);
  const loss = assetDisposalEntry({ id: 1, assetNo: "FA-1", name: "Racks", date: "2026-10-10", cost: "120000.00", accumulated: "6000.00", proceeds: "90000.00", dims, proceedsSettlement: bank });
  assert.equal(loss.lines.find((l) => l.accountCode === "6110").debit, 2400000n);
  const gain = assetDisposalEntry({ id: 2, assetNo: "FA-2", name: "PC", date: "2026-10-10", cost: "50000.00", accumulated: "10000.00", proceeds: "45000.00", dims, proceedsSettlement: bank });
  assert.equal(gain.lines.find((l) => l.accountCode === "6110").credit, 500000n);
  const scrap = assetDisposalEntry({ id: 3, assetNo: "FA-3", name: "Old", date: "2026-10-10", cost: "10000.00", accumulated: "10000.00", proceeds: "0", dims, proceedsSettlement: null });
  assert.equal(scrap.lines.length, 2);
  assert.throws(() => assetDisposalEntry({ id: 4, assetNo: "FA-4", name: "x", date: "2026-10-10", cost: "10.00", accumulated: "0", proceeds: "5.00", dims, proceedsSettlement: null }));
});

import { staffAdvanceEntry } from "../src/lib/ledger/posting-rules.ts";

test("a staff advance is an asset paid from cash or bank, not an expense", () => {
  const d = staffAdvanceEntry({ id: 1, advanceNo: "ADV-0001", employeeName: "Test", date: "2026-10-26", amount: "5000.00", dims, settlement: { kind: "ACCOUNT", accountCode: "1000" } });
  assert.deepEqual(d.lines.map((l) => l.accountCode).sort(), ["1000", "1330"]);
  assert.equal(d.lines.find((l) => l.accountCode === "1330").debit, 500000n);
});

import { ownerMoneyEntry as _owner } from "../src/lib/ledger/posting-rules.ts";
test("owner money in debits the bank and credits Proprietor Capital; out is the reverse", () => {
  const base = { id: 1, entryNo: "OWN-0001", date: "2026-10-28", amount: "516.00", note: "", dims: { divisionId: null, branchId: null }, settlement: { kind: "ACCOUNT", accountCode: "1010" } };
  const inn = _owner({ ...base, direction: "IN" });
  assert.equal(inn.lines[0].accountCode, "1010"); assert.equal(inn.lines[0].debit, 51600n);
  assert.equal(inn.lines[1].accountCode, "3000"); assert.equal(inn.lines[1].credit, 51600n);
  const out = _owner({ ...base, direction: "OUT" });
  assert.equal(out.lines[0].accountCode, "3000"); assert.equal(out.lines[0].debit, 51600n);
  assert.equal(out.lines[1].accountCode, "1010"); assert.equal(out.lines[1].credit, 51600n);
});

import { cashTakenEntry as _taken } from "../src/lib/ledger/posting-rules.ts";
test("cash taken to the bank: bank up, cash down; taken by owner: capital down, cash down", () => {
  const base = { id: 1, date: "2026-10-28", amount: "500.00", dims: { divisionId: null, branchId: null }, cash: { kind: "ACCOUNT", accountCode: "1000" } };
  const b = _taken({ ...base, to: "BANK", target: { kind: "ACCOUNT", accountCode: "1010" } });
  assert.equal(b.lines[0].accountCode, "1010"); assert.equal(b.lines[0].debit, 50000n);
  assert.equal(b.lines[1].accountCode, "1000"); assert.equal(b.lines[1].credit, 50000n);
  const o = _taken({ ...base, to: "OWNER", target: null });
  assert.equal(o.lines[0].accountCode, "3000"); assert.equal(o.lines[1].accountCode, "1000");
});

import { fundingReceiptEntry as _fund } from "../src/lib/ledger/posting-rules.ts";
test("investor money received: bank up, Investor Capital up; repaid is the reverse", () => {
  const base = { id: 1, txNo: "FTX-0001", date: "2026-10-28", amount: "100000.00", agreementNo: "AGR-1", dims: { divisionId: 1, branchId: 1 }, settlement: { kind: "ACCOUNT", accountCode: "1010" } };
  const r = _fund({ ...base, kind: "RECEIVED" });
  assert.equal(r.lines[0].accountCode, "1010"); assert.equal(r.lines[1].accountCode, "3200"); assert.equal(r.lines[1].credit, 10000000n);
  const p = _fund({ ...base, kind: "REPAID" });
  assert.equal(p.lines[0].accountCode, "3200"); assert.equal(p.lines[1].accountCode, "1010");
});
