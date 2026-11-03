import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";
import { resolveTierPrices, type TierPrices } from "@/lib/qty-price";

export async function loadQtyRule(businessId: number): Promise<{ off4: number; off10: number }> {
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT setting_key, setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key IN ('qty_off_4','qty_off_10')",
      [businessId]
    );
    const get = (k: string) => Number(rows.find((r) => r.setting_key === k)?.setting_value ?? 0) || 0;
    return { off4: get("qty_off_4"), off10: get("qty_off_10") };
  } catch {
    return { off4: 0, off10: 0 };
  }
}

/** Own quantity prices typed on products. Empty when migration 059 is not run yet: billing must never stop for this. */
export async function loadOwnTierPrices(businessId: number): Promise<Map<number, { p4: number | null; p10: number | null }>> {
  const out = new Map<number, { p4: number | null; p10: number | null }>();
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT id, qty_price_4, qty_price_10 FROM acct_product_variants WHERE legal_business_id = ? AND (qty_price_4 IS NOT NULL OR qty_price_10 IS NOT NULL)",
      [businessId]
    );
    for (const r of rows) out.set(Number(r.id), { p4: r.qty_price_4 === null ? null : Number(r.qty_price_4), p10: r.qty_price_10 === null ? null : Number(r.qty_price_10) });
  } catch {
    /* not set up yet */
  }
  return out;
}

export function tiersFor(usual: number | null, rule: { off4: number; off10: number }, own?: { p4: number | null; p10: number | null }): TierPrices {
  return resolveTierPrices(usual, rule.off4, rule.off10, own?.p4 ?? null, own?.p10 ?? null);
}
