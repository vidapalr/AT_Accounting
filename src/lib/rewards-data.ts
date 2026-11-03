import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { worksAt } from "@/lib/offer-where";
import {
  REWARDS_START_DATE, couponDiscountPaise, couponWithinDates, maxPointsUsable, pointsValuePaise, type CouponRule,
} from "@/lib/rewards-math";

type Q = Pool | PoolConnection;
const paise = (v: unknown) => BigInt(Math.round(Number(v ?? 0) * 100));

/** Points a retail customer has: earned on their posted bills (less goods returned) minus points already used. */
export async function pointsBalance(q: Q, businessId: number, customerId: number): Promise<{ retail: boolean; balance: number; earned: number; used: number }> {
  const [c] = await q.execute<RowDataPacket[]>(
    `SELECT customer_type FROM acct_customers WHERE legal_business_id = ? AND id = ?`, [businessId, customerId]);
  if (!c[0] || c[0].customer_type !== "RETAIL") return { retail: false, balance: 0, earned: 0, used: 0 };
  const [e] = await q.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(FLOOR(GREATEST(0, s.grand_total - s.shipping_charge - COALESCE(r.ret, 0)) / 200)), 0) AS pts
       FROM acct_sales_headers s
       LEFT JOIN (SELECT sale_id, SUM(refund_value - COALESCE(delivery_value, 0)) AS ret
                    FROM acct_sales_returns WHERE legal_business_id = ? AND status = 'POSTED' GROUP BY sale_id) r ON r.sale_id = s.id
      WHERE s.legal_business_id = ? AND s.customer_id = ? AND s.status = 'POSTED' AND s.is_estimate = 0
        AND s.invoice_date >= ?`,
    [businessId, businessId, customerId, REWARDS_START_DATE]);
  const [u] = await q.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(w.points_used), 0) AS pts
       FROM acct_sale_rewards w JOIN acct_sales_headers s ON s.id = w.sale_id
      WHERE w.legal_business_id = ? AND w.customer_id = ? AND s.status = 'POSTED'`,
    [businessId, customerId]);
  const earned = Number(e[0]?.pts ?? 0), used = Number(u[0]?.pts ?? 0);
  return { retail: true, balance: Math.max(0, earned - used), earned, used };
}

export type CouponRow = { divisionId: number | null; branchId: number | null; id: number; code: string; rule: CouponRule; startsOn: string | null; endsOn: string | null; oncePerCustomer: boolean; active: boolean };

export async function findCoupon(q: Q, businessId: number, rawCode: string): Promise<CouponRow | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const cols = `id, code, kind, value, min_bill, max_discount, DATE_FORMAT(starts_on, '%Y-%m-%d') AS s, DATE_FORMAT(ends_on, '%Y-%m-%d') AS e,
            once_per_customer, status`;
  let r: RowDataPacket[];
  try {
    [r] = await q.execute<RowDataPacket[]>(`SELECT ${cols}, division_id, branch_id FROM acct_coupons WHERE legal_business_id = ? AND code = ?`, [businessId, code]);
  } catch {
    // Migration 064 not run yet: the coupon works everywhere.
    [r] = await q.execute<RowDataPacket[]>(`SELECT ${cols} FROM acct_coupons WHERE legal_business_id = ? AND code = ?`, [businessId, code]);
  }
  const x = r[0];
  if (!x) return null;
  return {
    divisionId: x.division_id ? Number(x.division_id) : null, branchId: x.branch_id ? Number(x.branch_id) : null,
    id: Number(x.id), code: String(x.code), startsOn: x.s ? String(x.s) : null, endsOn: x.e ? String(x.e) : null,
    oncePerCustomer: Number(x.once_per_customer) === 1, active: x.status === "ACTIVE",
    rule: {
      kind: x.kind === "PERCENT" ? "PERCENT" : "RUPEES",
      valuePaise: x.kind === "PERCENT" ? BigInt(Math.round(Number(x.value) * 100)) : paise(x.value),
      minBillPaise: paise(x.min_bill), maxDiscountPaise: x.max_discount === null ? null : paise(x.max_discount),
    },
  };
}

export type RewardCheck =
  | { ok: true; balance: number; pointsUsed: number; pointsDiscountPaise: bigint; couponId: number | null; couponDiscountPaise: bigint; message: string }
  | { ok: false; error: string; balance: number };

/**
 * Check points and coupon for one bill. `billPaise` is the items total after line discounts (before any bill discount).
 * Same checks run when previewing on screen and again when the bill is saved.
 */
export async function checkRewards(q: Q, input: {
  businessId: number; customerId: number | null; pointsUsed: number; couponCode: string; billPaise: bigint; today: string;
  /** The branch (and its division) the bill is made at: a coupon can be limited to one branch or one division. */
  branchId: number | null; divisionId: number | null;
}): Promise<RewardCheck> {
  let balance = 0;
  let retail = false;
  if (input.customerId) {
    const b = await pointsBalance(q, input.businessId, input.customerId);
    balance = b.balance; retail = b.retail;
  }
  let couponDisc = 0n, couponId: number | null = null;
  const code = input.couponCode.trim();
  if (code) {
    const c = await findCoupon(q, input.businessId, code);
    if (!c || !c.active) return { ok: false, error: "That coupon code is not valid.", balance };
    if (!worksAt(c, { branchId: input.branchId, divisionId: input.divisionId })) return { ok: false, error: "That coupon does not work at this branch.", balance };
    if (!couponWithinDates(input.today, c.startsOn, c.endsOn)) return { ok: false, error: "That coupon is not running today.", balance };
    if (c.oncePerCustomer) {
      if (!input.customerId) return { ok: false, error: "Add the customer's mobile number first. This coupon can be used once per customer.", balance };
      const [used] = await q.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS n FROM acct_sale_rewards w JOIN acct_sales_headers s ON s.id = w.sale_id
          WHERE w.legal_business_id = ? AND w.coupon_id = ? AND w.customer_id = ? AND s.status = 'POSTED'`,
        [input.businessId, c.id, input.customerId]);
      if (Number(used[0]?.n ?? 0) > 0) return { ok: false, error: "This customer has already used that coupon.", balance };
    }
    couponDisc = couponDiscountPaise(c.rule, input.billPaise);
    if (couponDisc <= 0n) return { ok: false, error: "The bill is below the minimum for that coupon.", balance };
    couponId = c.id;
  }
  let pointsDisc = 0n;
  if (input.pointsUsed > 0) {
    if (!input.customerId || !retail) return { ok: false, error: "Points are only for retail customers with a mobile number.", balance };
    pointsDisc = pointsValuePaise(input.pointsUsed);
    if (pointsDisc <= 0n) return { ok: false, error: "Points are used in blocks of 200 (200 points = ₹50).", balance };
    if (input.pointsUsed > balance) return { ok: false, error: "The customer does not have that many points.", balance };
    if (input.pointsUsed > maxPointsUsable(balance, input.billPaise - couponDisc)) return { ok: false, error: "Those points are worth more than the bill.", balance };
  }
  const parts = [
    couponId ? `coupon ₹${(Number(couponDisc) / 100).toLocaleString("en-IN")}` : "",
    input.pointsUsed > 0 ? `${input.pointsUsed} points ₹${(Number(pointsDisc) / 100).toLocaleString("en-IN")}` : "",
  ].filter(Boolean);
  return { ok: true, balance, pointsUsed: input.pointsUsed, pointsDiscountPaise: pointsDisc, couponId, couponDiscountPaise: couponDisc, message: parts.length ? `Applied: ${parts.join(" + ")}.` : "" };
}

export async function recordRewards(conn: PoolConnection, input: {
  businessId: number; saleId: number; customerId: number | null; check: Extract<RewardCheck, { ok: true }>;
}) {
  if (input.check.pointsUsed <= 0 && !input.check.couponId) return;
  await conn.execute(
    `INSERT INTO acct_sale_rewards (sale_id, legal_business_id, customer_id, points_used, points_discount, coupon_id, coupon_discount)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE points_used = VALUES(points_used), points_discount = VALUES(points_discount),
       coupon_id = VALUES(coupon_id), coupon_discount = VALUES(coupon_discount)`,
    [input.saleId, input.businessId, input.customerId, input.check.pointsUsed,
     Number(input.check.pointsDiscountPaise) / 100, input.check.couponId, Number(input.check.couponDiscountPaise) / 100]);
}
