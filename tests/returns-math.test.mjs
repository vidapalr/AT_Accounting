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
