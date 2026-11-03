import test from "node:test";
import assert from "node:assert/strict";
import { pointsEarned, pointsValuePaise, maxPointsUsable, couponDiscountPaise, couponWithinDates } from "../src/lib/rewards-math.ts";

test("1 point per Rs 200, whole points", () => {
  assert.equal(pointsEarned(19999n), 0);
  assert.equal(pointsEarned(20000n), 1);
  assert.equal(pointsEarned(250000n), 12); // Rs 2,500 -> 12
  assert.equal(pointsEarned(-5n), 0);
});
test("200 points = Rs 50, blocks only", () => {
  assert.equal(pointsValuePaise(200), 5000n);
  assert.equal(pointsValuePaise(400), 10000n);
  assert.equal(pointsValuePaise(250), 0n);
  assert.equal(pointsValuePaise(0), 0n);
});
test("max usable: blocks, balance and bill", () => {
  assert.equal(maxPointsUsable(199, 100000n), 0);
  assert.equal(maxPointsUsable(650, 100000n), 600);
  assert.equal(maxPointsUsable(2000, 12000n), 400); // bill Rs 120 -> at most 2 blocks (Rs 100)
});
test("coupons", () => {
  const pct = { kind: "PERCENT", valuePaise: 1000n, minBillPaise: 100000n, maxDiscountPaise: 50000n };
  assert.equal(couponDiscountPaise(pct, 200000n), 20000n);
  assert.equal(couponDiscountPaise(pct, 90000n), 0n); // below minimum
  assert.equal(couponDiscountPaise(pct, 1000000n), 50000n); // capped
  const rs = { kind: "RUPEES", valuePaise: 30000n, minBillPaise: 0n, maxDiscountPaise: null };
  assert.equal(couponDiscountPaise(rs, 20000n), 20000n); // never more than the bill
});
test("coupon dates", () => {
  assert.equal(couponWithinDates("2026-11-03", "2026-11-01", "2026-11-30"), true);
  assert.equal(couponWithinDates("2026-12-01", null, "2026-11-30"), false);
  assert.equal(couponWithinDates("2026-10-01", "2026-11-01", null), false);
});
