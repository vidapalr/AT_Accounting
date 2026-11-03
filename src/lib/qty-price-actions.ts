"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const PAGE = "/accounting/products/quantity-prices";

export async function saveQtyPricesAction(form: FormData) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;

  const percent = (name: string): string => {
    const t = String(form.get(name) ?? "").trim().replace(/,/g, "");
    if (t === "") return "0";
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(t) || Number(t) >= 90) redirect(`${PAGE}?result=invalid`);
    return String(Number(t));
  };
  const off4 = percent("off4");
  const off10 = percent("off10");

  const updates: Array<[string | null, string | null, number]> = [];
  const own = new Map<number, { p4?: string | null; p10?: string | null }>();
  for (const [key, raw] of form.entries()) {
    const m = /^(p4|p10)_(\d+)$/.exec(key);
    if (!m) continue;
    const text = String(raw).trim().replace(/,/g, "");
    let value: string | null = null;
    if (text !== "") {
      if (!/^\d{1,9}(\.\d{1,2})?$/.test(text) || Number(text) <= 0) redirect(`${PAGE}?result=invalid`);
      value = text;
    }
    const id = Number(m[2]);
    const cur = own.get(id) ?? {};
    cur[m[1] as "p4" | "p10"] = value;
    own.set(id, cur);
  }
  for (const [id, v] of own) updates.push([v.p4 ?? null, v.p10 ?? null, id]);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, value] of [["qty_off_4", off4], ["qty_off_10", off10]] as const) {
      await conn.execute(
        `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [businessId, key, value, user.id]
      );
    }
    for (const [p4, p10, id] of updates) {
      await conn.execute(
        "UPDATE acct_product_variants SET qty_price_4 = ?, qty_price_10 = ? WHERE id = ? AND legal_business_id = ?",
        [p4, p10, id, businessId]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Quantity prices failed:", error);
    redirect(`${PAGE}?result=failed`);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/sales");
  redirect(`${PAGE}?result=saved`);
}
