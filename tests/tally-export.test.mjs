import test from "node:test";
import assert from "node:assert/strict";
import { tallyVoucherType, tallyGroup, xmlEscape, tallyVouchersXml, tallyLedgersXml } from "../src/lib/export/tally.ts";

const journal = {
  journalNo: "AG-JV-1", date: "2026-10-21", sourceType: "SALES_RECEIPT", description: "Receipt for Ram & Sons <test>",
  lines: [
    { accountCode: "1010", accountName: "Bank - Current Account", debitPaise: 120000n, creditPaise: 0n, memo: "" },
    { accountCode: "1100", accountName: "Trade Receivables", debitPaise: 0n, creditPaise: 120000n, memo: "" },
  ],
};

test("entries are filed under Tally voucher names", () => {
  assert.equal(tallyVoucherType("SALES_INVOICE"), "Sales");
  assert.equal(tallyVoucherType("SALES_RECEIPT"), "Receipt");
  assert.equal(tallyVoucherType("PURCHASE_PAYMENT"), "Payment");
  assert.equal(tallyVoucherType("SUPPLIER_RETURN"), "Debit Note");
  assert.equal(tallyVoucherType("STOCK_DAMAGE"), "Journal");
  assert.equal(tallyVoucherType(null), "Journal");
});

test("accounts go to the right Tally groups", () => {
  assert.equal(tallyGroup("1010", "ASSET"), "Bank Accounts");
  assert.equal(tallyGroup("1100", "ASSET"), "Sundry Debtors");
  assert.equal(tallyGroup("2000", "LIABILITY"), "Sundry Creditors");
  assert.equal(tallyGroup("4000", "REVENUE"), "Sales Accounts");
  assert.equal(tallyGroup("6000", "EXPENSE"), "Indirect Expenses");
  assert.equal(tallyGroup("5000", "EXPENSE"), "Direct Expenses");
});

test("text is made safe for XML", () => {
  assert.equal(xmlEscape(`A & B <c> "d" 'e'`), "A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;");
  assert.equal(xmlEscape("x\u0001y"), "xy");
});

test("a debit is negative and marked deemed positive; a credit is positive", () => {
  const xml = tallyVouchersXml([journal]);
  assert.match(xml, /<ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>-1200\.00<\/AMOUNT>/);
  assert.match(xml, /<ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE>\s*<AMOUNT>1200\.00<\/AMOUNT>/);
  assert.match(xml, /<DATE>20261021<\/DATE>/);
  assert.match(xml, /VCHTYPE="Receipt"/);
  assert.match(xml, /Ram &amp; Sons &lt;test&gt;/);
});

test("an entry that does not balance is refused", () => {
  const bad = { ...journal, lines: [journal.lines[0]] };
  assert.throws(() => tallyVouchersXml([bad]), /does not balance/);
});

test("ledger masters list every account with its group", () => {
  const xml = tallyLedgersXml([{ code: "1010", name: "Bank - Current Account", type: "ASSET" }]);
  assert.match(xml, /<PARENT>Bank Accounts<\/PARENT>/);
  assert.match(xml, /<REPORTNAME>All Masters<\/REPORTNAME>/);
});
