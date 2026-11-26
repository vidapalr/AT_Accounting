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
