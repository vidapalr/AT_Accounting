import "server-only";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

import { nextBarcode, nextCode } from "@/lib/codes";

const optional = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * Adds a product (its code is given automatically). Inside the caller's transaction, with the
 * business row locked so two people never get the same code. Used by the Products screen and by
 * New item on a purchase.
 */
export async function insertProduct(conn: PoolConnection, p: {
  businessId: number; divisionId: number; userId: number; categoryId: number; name: string;
  brand?: string; fabric?: string; design?: string; description?: string;
}): Promise<{ id: number; code: string }> {
  const code = await nextCode(conn, { table: "acct_products", column: "product_code", prefix: "PRD-", width: 4, where: "legal_business_id = ?", params: [p.businessId] });
  const [created] = await conn.execute<ResultSetHeader>(
    `INSERT INTO acct_products (legal_business_id, division_id, category_id, product_code, product_name, brand_name, fabric, design_name, description, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    [p.businessId, p.divisionId, p.categoryId, code, p.name, optional(p.brand), optional(p.fabric), optional(p.design), optional(p.description), p.userId]
  );
  await conn.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'PRODUCT_CREATED', 'PRODUCT', ?, ?)`,
    [p.businessId, p.userId, created.insertId, JSON.stringify({ division_id: p.divisionId, category_id: p.categoryId, product_code: code, product_name: p.name })]
  );
  return { id: created.insertId, code };
}

/**
 * Adds a size / colour of a product (SKU, barcode and design code given automatically).
 * Inside the caller's transaction, with the business row locked.
 */
export async function insertVariant(conn: PoolConnection, v: {
  businessId: number; divisionId: number; userId: number; productId: number;
  size?: string; color?: string; unit: "PCS" | "SET" | "METER"; designCode?: string;
}): Promise<{ id: number; sku: string; barcode: string }> {
  const sku = await nextCode(conn, { table: "acct_product_variants", column: "sku", prefix: "SKU-", width: 5, where: "legal_business_id = ?", params: [v.businessId] });
  const barcode = await nextBarcode(conn);
  const designCode = optional(v.designCode) ?? (await nextCode(conn, { table: "acct_product_variants", column: "design_code", prefix: "DSN-", width: 4, where: "legal_business_id = ?", params: [v.businessId] }));
  const [created] = await conn.execute<ResultSetHeader>(
    `INSERT INTO acct_product_variants (legal_business_id, division_id, product_id, sku, barcode, size_label, color_name, design_code, unit_of_measure, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
    [v.businessId, v.divisionId, v.productId, sku, barcode, optional(v.size), optional(v.color), designCode, v.unit, v.userId]
  );
  await conn.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'PRODUCT_VARIANT_CREATED', 'PRODUCT_VARIANT', ?, ?)`,
    [v.businessId, v.userId, created.insertId, JSON.stringify({ product_id: v.productId, sku, size: optional(v.size), color: optional(v.color), unit: v.unit })]
  );
  return { id: created.insertId, sku, barcode };
}
