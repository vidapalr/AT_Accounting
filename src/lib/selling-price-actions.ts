"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const PAGE = "/accounting/products/selling-prices";

/** Saves the owner's own minimum, maximum and usual price for each product size/colour. Empty boxes mean "use the stock price". */
export async function saveSellingPricesAction(form: FormData) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;

  const rows = new Map<number, { min: string | null; max: string | null; sug: string | null }>();
  for (const [key, raw] of form.entries()) {
    const m = /^(min|max|sug)_(\d+)$/.exec(key);
    if (!m) continue;
    const text = String(raw).trim().replace(/,/g, "");
    let value: string | null = null;
    if (text !== "") {
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) redirect(`${PAGE}?result=invalid`);
      value = text;
    }
    const id = Number(m[2]);
    const cur = rows.get(id) ?? { min: null, max: null, sug: null };
    cur[m[1] as "min" | "max" | "sug"] = value;
    rows.set(id, cur);
  }
  for (const r of rows.values()) {
    if (r.min !== null && r.max !== null && Number(r.min) > Number(r.max)) redirect(`${PAGE}?result=order`);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const [id, r] of rows) {
      if (r.min === null && r.max === null && r.sug === null) {
        await conn.execute("DELETE FROM acct_selling_prices WHERE legal_business_id = ? AND variant_id = ?", [businessId, id]);
      } else {
        await conn.execute(
          `INSERT INTO acct_selling_prices (legal_business_id, variant_id, min_price, max_price, suggested_price, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE min_price = VALUES(min_price), max_price = VALUES(max_price),
                                   suggested_price = VALUES(suggested_price), updated_by = VALUES(updated_by)`,
          [businessId, id, r.min, r.max, r.sug, user.id]
        );
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Selling prices failed:", error);
    redirect(`${PAGE}?result=failed`);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/sales");
  revalidatePath("/shop");
  redirect(`${PAGE}?result=saved`);
}
