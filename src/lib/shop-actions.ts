"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";

export async function toggleShopAction(formData: FormData) {
  const user = await requireAccess("products");
  const id = Number(formData.get("product_id"));
  if (Number.isSafeInteger(id) && id > 0) {
    await db.execute(
      `UPDATE acct_products SET show_in_shop = 1 - show_in_shop WHERE id = ? AND legal_business_id = ?`,
      [id, user.legal_business_id]
    );
  }
  revalidatePath("/shop");
  redirect(`/accounting/catalogue/${id}`);
}

export async function saveShopWhatsappAction(formData: FormData) {
  const user = await requireAccess("products");
  const phone = normalizePhone(String(formData.get("whatsapp") ?? ""));
  if (!phone) redirect("/accounting/catalogue?shop=invalid");
  await db.execute(
    `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
     VALUES (?, 'shop_whatsapp', ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [user.legal_business_id, phone, user.id]
  );
  revalidatePath("/shop");
  redirect("/accounting/catalogue?shop=saved");
}

/** Switch many products on or off for the online shop at once. */
export async function bulkShopAction(formData: FormData) {
  const user = await requireAccess("products");
  const mode = String(formData.get("mode") ?? "");
  const businessId = user.legal_business_id;
  let changed = 0;

  if (mode === "SHOW_IN_STOCK" || mode === "SHOW_ALL") {
    const stockRule =
      mode === "SHOW_IN_STOCK"
        ? `AND (SELECT COALESCE(SUM(sm.quantity_change), 0)
                  FROM acct_stock_movements sm
                  JOIN acct_product_variants v
                    ON v.id = sm.variant_id AND v.legal_business_id = sm.legal_business_id
                 WHERE v.product_id = p.id AND sm.legal_business_id = p.legal_business_id) > 0`
        : "";
    const [res] = await db.execute<import("mysql2").ResultSetHeader>(
      `UPDATE acct_products p SET p.show_in_shop = 1
        WHERE p.legal_business_id = ? AND p.status = 'ACTIVE' AND p.show_in_shop = 0 ${stockRule}`,
      [businessId]
    );
    changed = res.affectedRows;
  } else if (mode === "HIDE_ALL") {
    const [res] = await db.execute<import("mysql2").ResultSetHeader>(
      `UPDATE acct_products SET show_in_shop = 0 WHERE legal_business_id = ? AND show_in_shop = 1`,
      [businessId]
    );
    changed = res.affectedRows;
  } else {
    redirect("/accounting/catalogue?shop=invalid-bulk");
  }

  revalidatePath("/shop");
  redirect(`/accounting/catalogue?shop=bulk&n=${changed}&m=${mode}`);
}

/** Save the shop price of many sizes/colours in one go. A blank box clears the price. */
export async function saveShopPricesAction(formData: FormData) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const updates: Array<[string | null, number]> = [];

  for (const [key, raw] of formData.entries()) {
    const m = /^price_(\d+)$/.exec(key);
    if (!m) continue;
    const text = String(raw).trim().replace(/,/g, "");
    if (text === "") {
      updates.push([null, Number(m[1])]);
    } else if (/^\d{1,9}(\.\d{1,2})?$/.test(text) && Number(text) > 0) {
      updates.push([text, Number(m[1])]);
    } else {
      redirect("/accounting/catalogue/prices?result=invalid");
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const [price, id] of updates) {
      await conn.execute(
        `UPDATE acct_product_variants SET shop_price = ? WHERE id = ? AND legal_business_id = ?`,
        [price, id, businessId]
      );
    }
    await conn.commit();
  } catch {
    await conn.rollback();
    redirect("/accounting/catalogue/prices?result=failed");
  } finally {
    conn.release();
  }
  revalidatePath("/shop");
  redirect("/accounting/catalogue/prices?result=saved");
}
