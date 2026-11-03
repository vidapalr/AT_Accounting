"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";
import { checkRewards, pointsBalance } from "@/lib/rewards-data";
import { parseWhere } from "@/lib/offer-where";
import { maxPointsUsable } from "@/lib/rewards-math";
import type { RowDataPacket } from "mysql2";

const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export type RewardPreview = {
  ok: boolean;
  message: string;
  customerName?: string;
  balance: number;
  /** Most points that can be used on this bill. */
  maxPoints: number;
  pointsUsed: number;
  pointsDiscount: number;
  couponDiscount: number;
  /** True for a retail customer on file (wholesale customers do not earn points). */
  retail: boolean;
  /** Points earned so far, and used so far. */
  earnedTotal: number;
  usedTotal: number;
};

/** For the billing screen: what the customer has, and what the chosen points and coupon are worth on this bill. */
export async function previewRewardsAction(input: { phone: string; pointsUsed: number; couponCode: string; billAmount: number; branchId?: number }): Promise<RewardPreview> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const phone = normalizePhone(String(input.phone ?? ""));
  const billPaise = BigInt(Math.max(0, Math.round(Number(input.billAmount) * 100)));
  let customerId: number | null = null;
  let customerName: string | undefined;
  if (phone) {
    const [c] = await db.execute<RowDataPacket[]>(
      `SELECT id, full_name FROM acct_customers WHERE legal_business_id = ? AND phone = ? LIMIT 1`, [businessId, phone]);
    if (c[0]) { customerId = Number(c[0].id); customerName = String(c[0].full_name); }
  }
  const points = Math.max(0, Math.floor(Number(input.pointsUsed) || 0));
  const branchId = Number.isSafeInteger(input.branchId) && Number(input.branchId) > 0 ? Number(input.branchId) : null;
  let divisionId: number | null = null;
  if (branchId) {
    const [b] = await db.execute<RowDataPacket[]>(`SELECT division_id FROM acct_branches WHERE legal_business_id = ? AND id = ?`, [businessId, branchId]);
    divisionId = b[0] ? Number(b[0].division_id) : null;
  }
  let info = { retail: false, earnedTotal: 0, usedTotal: 0 };
  if (customerId) {
    try {
      const pb = await pointsBalance(db, businessId, customerId);
      info = { retail: pb.retail, earnedTotal: pb.earned, usedTotal: pb.used };
    } catch { /* points tables not there yet */ }
  }
  let r: Awaited<ReturnType<typeof checkRewards>>;
  try {
    r = await checkRewards(db, { businessId, customerId, pointsUsed: points, couponCode: String(input.couponCode ?? "").slice(0, 30), billPaise, today: todayIso(), branchId, divisionId });
  } catch {
    return { ok: false, message: "Points and coupons are not set up yet (database file 063_rewards).", customerName, balance: 0, maxPoints: 0, pointsUsed: 0, pointsDiscount: 0, couponDiscount: 0, ...info };
  }
  if (!r.ok) return { ok: false, message: r.error, customerName, balance: r.balance, maxPoints: maxPointsUsable(r.balance, billPaise), pointsUsed: 0, pointsDiscount: 0, couponDiscount: 0, ...info };
  return {
    ok: true, message: r.message, customerName, balance: r.balance, maxPoints: maxPointsUsable(r.balance, billPaise - r.couponDiscountPaise),
    pointsUsed: r.pointsUsed, pointsDiscount: Number(r.pointsDiscountPaise) / 100, couponDiscount: Number(r.couponDiscountPaise) / 100, ...info,
  };
}

const PAGE = "/accounting/offers/coupons";
const back = (kind: "saved" | "error", text: string): never => redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);

export async function createCouponAction(formData: FormData) {
  const user = await requireAccess("products");
  const get = (n: string) => String(formData.get(n) ?? "").trim();
  const code = get("code").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  const kind = get("kind") === "PERCENT" ? "PERCENT" : "RUPEES";
  const value = Number(get("value"));
  const minBill = Number(get("min_bill") || 0);
  const maxDisc = get("max_discount") ? Number(get("max_discount")) : null;
  const starts = /^\d{4}-\d{2}-\d{2}$/.test(get("starts_on")) ? get("starts_on") : null;
  const ends = /^\d{4}-\d{2}-\d{2}$/.test(get("ends_on")) ? get("ends_on") : null;
  if (code.length < 3) return back("error", "Write a code of at least 3 letters or numbers, for example DIWALI10.");
  if (!Number.isFinite(value) || value <= 0 || (kind === "PERCENT" && value > 90)) return back("error", kind === "PERCENT" ? "Percent must be between 1 and 90." : "Write the rupees off.");
  if (!Number.isFinite(minBill) || minBill < 0 || (maxDisc !== null && (!Number.isFinite(maxDisc) || maxDisc <= 0))) return back("error", "Check the minimum bill and the most discount.");
  if (starts && ends && ends < starts) return back("error", "The end date is before the start date.");
  const where = await parseWhere(user.legal_business_id, get("works_at"));
  if (!where) return back("error", "Choose where the coupon works (a branch or all branches).");
  const base = [user.legal_business_id, code, kind, value, minBill, maxDisc, starts, ends, get("once") === "1" ? 1 : 0, user.id];
  try {
    try {
      await db.execute(
        `INSERT INTO acct_coupons (legal_business_id, code, kind, value, min_bill, max_discount, starts_on, ends_on, once_per_customer, created_by, division_id, branch_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [...base, where.divisionId, where.branchId]);
    } catch (inner) {
      // Migration 064 not run yet: only an "everywhere" coupon can be saved.
      if ((inner as { code?: string }).code === "ER_DUP_ENTRY" || where.divisionId || where.branchId) throw inner;
      await db.execute(
        `INSERT INTO acct_coupons (legal_business_id, code, kind, value, min_bill, max_discount, starts_on, ends_on, once_per_customer, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, base);
    }
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") return back("error", "That code already exists. Choose another.");
    throw e;
  }
  revalidatePath(PAGE);
  return back("saved", `Coupon ${code} created.`);
}

export async function setCouponStatusAction(formData: FormData) {
  const user = await requireAccess("products");
  const id = Number(formData.get("coupon_id"));
  const status = String(formData.get("status")) === "ACTIVE" ? "ACTIVE" : "PAUSED";
  await db.execute(`UPDATE acct_coupons SET status = ? WHERE legal_business_id = ? AND id = ?`, [status, user.legal_business_id, id]);
  revalidatePath(PAGE);
  return back("saved", status === "ACTIVE" ? "Coupon switched on." : "Coupon paused.");
}
