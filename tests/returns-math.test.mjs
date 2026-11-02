import test from "node:test";
import assert from "node:assert/strict";
import { parseQtyMilli, parsePaise, proportion, returnLineValues } from "../src/lib/returns-math.ts";

// Invoice 7 shape: 3 lines, 4,050 of discount on 17,650, customer paid 13,600
const sale = {
  soldMilli: 3000n,
  unitPricePaise: 70000n,          // 700.00
  lineTotalPaise: 210000n,         // 2,100.00 (no line discount)
  sumLineTotalsPaise: 1765000n,    // 17,650.00
  grandTotalPaise: 1360000n,       // 13,600.00
  totalCostPaise: 117000n,         // 1,170.00
};

test("quantities and money parse exactly", () => {
  assert.equal(parseQtyMilli("2.5"), 2500n);
  assert.equal(parsePaise("12.30"), 1230n);
  assert.throws(() => parseQtyMilli("1.2345"));
  assert.throws(() => parseQtyMilli("-1"));
  assert.throws(() => parsePaise("1.234"));
});

test("a return refunds the share the customer actually paid, not the list price", () => {
  const v = returnLineValues(sale, 0n, 1000n);
  assert.equal(v.gross, 70000n);                 // one piece at 700.00
  // 2100 * 13600/17650 = 1618.13 for the line; a third of it is 539.38
  assert.equal(v.refund, 53938n);
  assert.equal(v.cost, 39000n);
});

test("many small returns add up to exactly the whole line", () => {
  let returned = 0n;
  let gross = 0n, refund = 0n, cost = 0n;
  for (const q of [1000n, 1000n, 1000n]) {
    const v = returnLineValues(sale, returned, q);
    gross += v.gross; refund += v.refund; cost += v.cost;
    returned += q;
  }
  const whole = returnLineValues(sale, 0n, 3000n);
  assert.equal(gross, whole.gross);
  assert.equal(refund, whole.refund);
  assert.equal(cost, whole.cost);
  assert.equal(cost, 117000n);
});

test("cannot return more than was sold, or nothing", () => {
  assert.throws(() => returnLineValues(sale, 2500n, 1000n), /more than was sold/);
  assert.throws(() => returnLineValues(sale, 0n, 0n));
});

test("odd paise never drift across uneven splits", () => {
  const odd = { ...sale, soldMilli: 7000n, totalCostPaise: 100003n };
  let returned = 0n, cost = 0n;
  for (const q of [1500n, 2500n, 3000n]) {
    cost += returnLineValues(odd, returned, q).cost;
    returned += q;
  }
  assert.equal(cost, 100003n);
  assert.equal(proportion(10n, 1n, 3n), 3n);
});

import { allocateExact } from "../src/lib/returns-math.ts";

test("allocateExact: shares always add up to the total to the paisa", () => {
  const shares = allocateExact([10000n, 10000n, 10000n], 10000n); // 100.00 over three equal lines
  assert.equal(shares.reduce((a, b) => a + b, 0n), 10000n);
  assert.deepEqual(shares, [3334n, 3333n, 3333n]);
  const odd = allocateExact([333n, 777n, 1234n, 56n], 98765n);
  assert.equal(odd.reduce((a, b) => a + b, 0n), 98765n);
  assert.deepEqual(allocateExact([5n, 5n], 0n), [0n, 0n]);
  assert.deepEqual(allocateExact([0n, 0n], 100n), [0n, 0n]);
});

test("whole-bill return refunds exactly what the customer paid, whatever the rounding", () => {
  // three lines of 33.33 sold at a 10.00 bill discount: customer paid 89.99
  const lines = [3333n, 3333n, 3333n];
  const grand = 8999n;
  const shares = allocateExact(lines, grand);
  let refunded = 0n;
  lines.forEach((lt, i) => {
    const v = returnLineValues(
      { soldMilli: 1000n, unitPricePaise: lt, lineTotalPaise: lt, sumLineTotalsPaise: 9999n, grandTotalPaise: grand, totalCostPaise: 1000n, paidAllPaise: shares[i] },
      0n, 1000n
    );
    refunded += v.refund;
  });
  assert.equal(refunded, grand);
});

test("delivery charge: handed back in proportion only when chosen, never inside the goods refund", () => {
  const base = { soldMilli: 2000n, unitPricePaise: 50000n, lineTotalPaise: 100000n, sumLineTotalsPaise: 100000n, grandTotalPaise: 100000n, totalCostPaise: 60000n, paidAllPaise: 100000n };
  const off = returnLineValues(base, 0n, 1000n);
  assert.equal(off.delivery, 0n);
  assert.equal(off.refund, 50000n);
  const on = returnLineValues({ ...base, deliveryAllPaise: 45000n }, 0n, 1000n);
  assert.equal(on.delivery, 22500n);   // half the delivery for one of two pieces
  assert.equal(on.refund, 50000n);     // goods refund unchanged
  const rest = returnLineValues({ ...base, deliveryAllPaise: 45000n }, 1000n, 1000n);
  assert.equal(on.delivery + rest.delivery, 45000n);
});
