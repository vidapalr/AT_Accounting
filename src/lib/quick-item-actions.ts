"use server";

import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { insertProduct, insertVariant } from "@/lib/product-master-core";

export type QuickItemInput = { productName: string; categoryId: number; size: string; color: string; unit: "PCS" | "SET" | "METER" };
export type QuickItemResult =
  | { ok: true; item: { id: number; sku: string; product_name: string; size_label: string | null; color_name: string | null; unit_of_measure: string }; reused: boolean }
  | { ok: false; message: string };

/**
 * New item typed on a purchase line: finds the product by name in that group (or adds it), then the
 * size / colour (or adds it), with codes and barcode given automatically. Returns the item to put on the line.
 */
export async function quickCreateItemAction(input: QuickItemInput): Promise<QuickItemResult> {
  const user = await requireAccess("purchases");
  const divisionId = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;
  const name = String(input.productName ?? "").trim().replace(/\s+/g, " ");
  const size = String(input.size ?? "").trim().slice(0, 40);
  const color = String(input.color ?? "").trim().slice(0, 80);
  const unit = ["PCS", "SET", "METER"].includes(input.unit) ? input.unit : "PCS";
  const categoryId = Number(input.categoryId);
  if (name.length < 2 || name.length > 180) return { ok: false, message: "Type the item name (at least 2 letters)." };
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) return { ok: false, message: "Choose the product group." };

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
    const [cats] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_product_categories WHERE id = ? AND legal_business_id = ? AND division_id = ? AND status = 'ACTIVE'`,
      [categoryId, businessId, divisionId]
    );
    if (cats.length !== 1) { await conn.rollback(); return { ok: false, message: "That product group is not available." }; }

    const [found] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_products WHERE legal_business_id = ? AND division_id = ? AND category_id = ? AND status = 'ACTIVE'
         AND LOWER(product_name) = LOWER(?) ORDER BY id LIMIT 1`,
      [businessId, divisionId, categoryId, name]
    );
    const productId = found[0] ? Number(found[0].id) : (await insertProduct(conn, { businessId, divisionId, userId: user.id, categoryId, name })).id;

    const [same] = await conn.execute<RowDataPacket[]>(
      `SELECT id, sku, size_label, color_name, unit_of_measure FROM acct_product_variants
        WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE'
          AND COALESCE(LOWER(size_label), '') = LOWER(?) AND COALESCE(LOWER(color_name), '') = LOWER(?) LIMIT 1`,
      [businessId, productId, size, color]
    );
    let item: { id: number; sku: string; size: string | null; color: string | null; unit: string };
    let reused = false;
    if (same[0]) {
      item = { id: Number(same[0].id), sku: String(same[0].sku), size: same[0].size_label, color: same[0].color_name, unit: String(same[0].unit_of_measure) };
      reused = true;
    } else {
      const v = await insertVariant(conn, { businessId, divisionId, userId: user.id, productId, size, color, unit });
      item = { id: v.id, sku: v.sku, size: size || null, color: color || null, unit };
    }
    await conn.commit();
    revalidatePath("/accounting/products");
    return { ok: true, reused, item: { id: item.id, sku: item.sku, product_name: name, size_label: item.size, color_name: item.color, unit_of_measure: item.unit } };
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Quick item failed", error);
    return { ok: false, message: "Could not add the item. Nothing was saved." };
  } finally {
    conn.release();
  }
}
