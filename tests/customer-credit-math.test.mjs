import test from "node:test";
import assert from "node:assert/strict";
import { splitPayment, creditBalance, creditToUse } from "../src/lib/customer-credit-math.ts";

test("a payment above the bill keeps the extra as credit", () => {
  assert.deepEqual(splitPayment(500000n, 400000n), { toBill: 400000n, toCredit: 100000n });
  assert.deepEqual(splitPayment(300000n, 400000n), { toBill: 300000n, toCredit: 0n });
  assert.deepEqual(splitPayment(300000n, 0n), { toBill: 0n, toCredit: 300000n });
});

test("credit is received minus used minus paid back", () => {
  assert.equal(creditBalance([{ type: "RECEIVED", amount: 1000n }, { type: "USED", amount: 300n }, { type: "REFUNDED", amount: 200n }]), 500n);
  assert.equal(creditBalance([{ type: "RECEIVED", amount: 100n }, { type: "REFUNDED", amount: 500n }]), 0n);
  assert.equal(creditBalance([]), 0n);
});

test("a bill takes no more credit than the customer has or the bill needs", () => {
  assert.equal(creditToUse(1000n, 400n), 400n);
  assert.equal(creditToUse(300n, 400n), 300n);
  assert.equal(creditToUse(0n, 400n), 0n);
  assert.equal(creditToUse(300n, 0n), 0n);
});
