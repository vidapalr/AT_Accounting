/**
 * Points and coupon maths (owner's rules, 3 Nov 2026). Pure, money in paise (bigint).
 *  - Retail customers only. 1 point for every Rs 200 of the bill (without delivery), whole points only.
 *  - 200 points = Rs 50 off a later bill, used in blocks of 200 points.
 *  - Coupons: a code for Rs off or % off a whole bill.
 */
export const RUPEES_PER_POINT = 200n * 100n; // paise of bill value that earn 1 point
export const POINTS_PER_BLOCK = 200;
export const BLOCK_VALUE_PAISE = 5000n; // Rs 50

/** Points earned by a bill: (bill without delivery, less goods returned) / Rs 200, rounded down. */
export function pointsEarned(netBillPaise: bigint): number {
  return netBillPaise <= 0n ? 0 : Number(netBillPaise / RUPEES_PER_POINT);
}

/** Rupee value of using this many points. Must be a whole number of blocks; otherwise 0. */
export function pointsValuePaise(points: number): bigint {
  if (!Number.isInteger(points) || points <= 0 || points % POINTS_PER_BLOCK !== 0) return 0n;
  return BigInt(points / POINTS_PER_BLOCK) * BLOCK_VALUE_PAISE;
}

/** The most points a customer can use on a bill: whole blocks, within the balance, and never worth more than the bill. */
export function maxPointsUsable(balance: number, billPaise: bigint): number {
  if (balance < POINTS_PER_BLOCK || billPaise <= 0n) return 0;
  const byBalance = Math.floor(balance / POINTS_PER_BLOCK);
  const byBill = Number(billPaise / BLOCK_VALUE_PAISE);
  return Math.min(byBalance, byBill) * POINTS_PER_BLOCK;
}

export type CouponRule = {
  kind: "PERCENT" | "RUPEES";
  valuePaise: bigint; // Rs for RUPEES; for PERCENT the percent x 100 (10% = 1000n)
  minBillPaise: bigint;
  maxDiscountPaise: bigint | null;
};

/** Discount a coupon gives on a bill, never more than the bill. 0 if the minimum bill is not reached. */
export function couponDiscountPaise(rule: CouponRule, billPaise: bigint): bigint {
  if (billPaise <= 0n || billPaise < rule.minBillPaise) return 0n;
  let d = rule.kind === "RUPEES" ? rule.valuePaise : (billPaise * rule.valuePaise + 5000n) / 10000n;
  if (rule.maxDiscountPaise !== null && d > rule.maxDiscountPaise) d = rule.maxDiscountPaise;
  return d > billPaise ? billPaise : d;
}

export function couponWithinDates(today: string, startsOn: string | null, endsOn: string | null): boolean {
  if (startsOn && today < startsOn) return false;
  if (endsOn && today > endsOn) return false;
  return true;
}

/** Bills dated before this day earn no points (the points scheme starts the day after it was built). */
export const REWARDS_START_DATE = "2026-11-03";
