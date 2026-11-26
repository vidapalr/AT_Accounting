import { test } from "node:test";
import assert from "node:assert/strict";
import { entryEffect, linkEffect, cardStatus, nextDayOfMonth, netWorth } from "../src/lib/personal-money.ts";

test("each entry moves the right balances", () => {
  assert.deepEqual(entryEffect("EXPENSE", 50000n), { account: -50000n, toAccount: 0n, loan: 0n, invested: 0n, income: 0n, expense: 50000n });
  assert.equal(entryEffect("TRANSFER", 1000n).toAccount, 1000n);
  // EMI of 12,000 with 2,000 interest: loan goes down by 10,000, interest counts as spending
  const emi = entryEffect("LOAN_PAID", 1200000n, 200000n);
  assert.equal(emi.account, -1200000n); assert.equal(emi.loan, -1000000n); assert.equal(emi.expense, 200000n);
  const back = entryEffect("LOAN_RECEIVED", 550000n, 50000n);
  assert.equal(back.loan, -500000n); assert.equal(back.income, 50000n);
  assert.equal(entryEffect("INVEST", 100000n).invested, 100000n);
});

test("business-linked movements", () => {
  assert.equal(linkEffect("PUT_INTO_BUSINESS", 100n), -100n);
  assert.equal(linkEffect("BUSINESS_EXPENSE_PAID", 100n), -100n);
  assert.equal(linkEffect("TAKEN_FROM_BUSINESS", 100n), 100n);
  assert.equal(linkEffect("SHOP_CASH_TAKEN_HOME", 100n), 100n);
});

test("credit card: owed, available and next due date", () => {
  assert.deepEqual(cardStatus(-3500000n, 10000000n, 5, "2026-11-26"), { owed: 3500000n, available: 6500000n, nextDue: "2026-12-05" });
  assert.equal(nextDayOfMonth(31, "2026-02-10"), "2026-02-28");
  assert.equal(nextDayOfMonth(26, "2026-11-26"), "2026-11-26");
  assert.equal(nextDayOfMonth(5, "2026-12-20"), "2027-01-05");
  assert.equal(cardStatus(500n, null, null, "2026-11-26").owed, 0n);
});

test("net worth", () => {
  assert.equal(netWorth({ accounts: 1000n, loansGiven: 500n, loansTaken: 300n, investments: 200n }), 1400n);
});

import { billCycles } from "../src/lib/personal-money.ts";
import { bankFromIfsc } from "../src/lib/ifsc.ts";

test("credit card grouped by bill cycle", () => {
  // Bill on the 15th, due on the 5th. Owed 2,000 at start (1 Oct).
  const lines = [
    { date: "2026-10-10", amount: -500000n },   // spent 5,000
    { date: "2026-10-20", amount: -300000n },   // spent 3,000 (next bill)
    { date: "2026-11-02", amount: 700000n },    // paid 7,000 from bank
    { date: "2026-11-20", amount: -100000n },   // spent 1,000 (open cycle)
  ];
  const r = billCycles({ lines, opening: -200000n, openingDate: "2026-10-01", billDay: 15, dueDay: 5, today: "2026-11-26" });
  assert.equal(r.past.length, 2);
  const [nov, oct] = r.past;
  assert.equal(oct.billOn, "2026-10-15"); assert.equal(oct.dueOn, "2026-11-05");
  assert.equal(oct.billAmount, 700000n); assert.equal(oct.paidSince, 700000n); assert.equal(oct.stillDue, 0n);
  assert.equal(nov.billOn, "2026-11-15"); assert.equal(nov.dueOn, "2026-12-05");
  assert.equal(nov.spent, 300000n); assert.equal(nov.billAmount, 300000n); assert.equal(nov.stillDue, 300000n);
  assert.equal(r.open.nextBillOn, "2026-12-15"); assert.equal(r.open.spent, 100000n); assert.equal(r.open.owedNow, 400000n);
});

test("IFSC gives the bank name", () => {
  assert.equal(bankFromIfsc("sbin0001234"), "State Bank of India");
  assert.equal(bankFromIfsc("HDFC0000001"), "HDFC Bank");
  assert.equal(bankFromIfsc("HDFC000001"), null);
});
