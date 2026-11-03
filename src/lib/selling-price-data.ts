import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/lib/db";

export type PriceOverride = { min: number | null; max: number | null; suggested: number | null };

/** Own prices typed by the owner. Empty if migration 060 is not run: billing must never stop for this. */
export async function loadPriceOverrides(businessId: number): Promise<Map<number, PriceOverride>> {
  const out = new Map<number, PriceOverride>();
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      "SELECT variant_id, min_price, max_price, suggested_price FROM acct_selling_prices WHERE legal_business_id = ?",
      [businessId]
    );
    const n = (v: unknown) => (v === null ? null : Number(v));
    for (const r of rows) out.set(Number(r.variant_id), { min: n(r.min_price), max: n(r.max_price), suggested: n(r.suggested_price) });
  } catch {
    /* not set up yet */
  }
  return out;
}
