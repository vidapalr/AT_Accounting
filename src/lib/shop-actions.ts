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
