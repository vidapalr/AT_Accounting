import "server-only";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

/** The shop shows one business. Change here when more than one business sells online. */
export const SHOP_BUSINESS_ID = Number(process.env.SHOP_BUSINESS_ID ?? 1);

export async function getShopSettings(businessId = SHOP_BUSINESS_ID) {
  await connection(); // read at request time, never while the site is being built
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key IN ('shop_whatsapp')`,
    [businessId]
  );
  const map = new Map(rows.map(r => [String(r.setting_key), String(r.setting_value)]));
  return { whatsapp: map.get("shop_whatsapp") ?? "" };
}

/** Shop price for each variant: the maximum selling price entered on its newest received stock transfer. */
export async function latestPrices(variantIds: number[]): Promise<Map<number, number>> {
  const prices = new Map<number, number>();
  if (variantIds.length === 0) return prices;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT tl.variant_id, COALESCE(tl.max_selling_price, tl.suggested_selling_price) AS price
       FROM acct_stock_transfer_lines tl
       JOIN acct_stock_transfers t
         ON t.legal_business_id = tl.legal_business_id AND t.id = tl.transfer_id
      WHERE t.legal_business_id = ? AND t.status = 'RECEIVED'
        AND COALESCE(tl.max_selling_price, tl.suggested_selling_price) IS NOT NULL AND tl.variant_id IN (?)
      ORDER BY t.received_at DESC, t.id DESC`,
    [SHOP_BUSINESS_ID, variantIds]
  );
  for (const r of rows) {
    const id = Number(r.variant_id);
    if (!prices.has(id)) prices.set(id, Number(r.price));
  }
  return prices;
}

async function inStock(variantIds: number[]): Promise<Set<number>> {
  if (variantIds.length === 0) return new Set();
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT variant_id FROM acct_stock_movements
      WHERE legal_business_id = ? AND variant_id IN (?)
      GROUP BY variant_id HAVING SUM(quantity_change) > 0`,
    [SHOP_BUSINESS_ID, variantIds]
  );
  return new Set(rows.map(r => Number(r.variant_id)));
}

export type ShopVariant = { id: number; sku: string; size: string | null; color: string | null; price: number | null; available: boolean };
export type ShopProduct = {
  id: number;
  name: string;
  fabric: string | null;
  description: string | null;
  coverId: number | null;
  fromPrice: number | null;
  available: boolean;
  variants: ShopVariant[];
};

async function load(where: string, params: (string | number)[]): Promise<ShopProduct[]> {
  await connection(); // read at request time, never while the site is being built
  const [prods] = await db.execute<RowDataPacket[]>(
    `SELECT p.id, p.product_name, p.fabric, p.description,
            (SELECT m.id FROM acct_product_media m
              WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE'
              ORDER BY m.is_cover DESC, m.sort_order, m.id LIMIT 1) AS cover_id
       FROM acct_products p
      WHERE p.legal_business_id = ? AND p.status = 'ACTIVE' AND p.show_in_shop = 1 ${where}
      ORDER BY p.product_name LIMIT 200`,
    [SHOP_BUSINESS_ID, ...params]
  );
  if (prods.length === 0) return [];
  const ids = prods.map(p => Number(p.id));
  const [vars] = await db.query<RowDataPacket[]>(
    `SELECT id, product_id, sku, size_label, color_name, shop_price FROM acct_product_variants
      WHERE legal_business_id = ? AND status = 'ACTIVE' AND product_id IN (?) ORDER BY id`,
    [SHOP_BUSINESS_ID, ids]
  );
  const variantIds = vars.map(v => Number(v.id));
  const [prices, stocked] = await Promise.all([latestPrices(variantIds), inStock(variantIds)]);

  return prods.map(p => {
    const variants = vars
      .filter(v => Number(v.product_id) === Number(p.id))
      .map(v => ({
        id: Number(v.id),
        sku: String(v.sku),
        size: v.size_label ? String(v.size_label) : null,
        color: v.color_name ? String(v.color_name) : null,
        price: v.shop_price !== null && Number(v.shop_price) > 0 ? Number(v.shop_price) : (prices.get(Number(v.id)) ?? null),
        available: stocked.has(Number(v.id)),
      }));
    const priced = variants.map(v => v.price).filter((x): x is number => x !== null);
    return {
      id: Number(p.id),
      name: String(p.product_name),
      fabric: p.fabric ? String(p.fabric) : null,
      description: p.description ? String(p.description) : null,
      coverId: p.cover_id ? Number(p.cover_id) : null,
      fromPrice: priced.length ? Math.min(...priced) : null,
      available: variants.some(v => v.available),
      variants,
    };
  });
}

export const getShopProducts = () => load("", []);
export async function getShopProduct(id: number) {
  return (await load("AND p.id = ?", [id]))[0] ?? null;
}

export async function getShopMedia(productId: number) {
  await connection(); // read at request time, never while the site is being built
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT m.id, m.media_type FROM acct_product_media m
       JOIN acct_products p ON p.id = m.product_id AND p.legal_business_id = m.legal_business_id
      WHERE m.legal_business_id = ? AND m.product_id = ? AND m.status = 'ACTIVE' AND p.show_in_shop = 1
      ORDER BY m.is_cover DESC, m.sort_order, m.id LIMIT 12`,
    [SHOP_BUSINESS_ID, productId]
  );
  return rows.map(r => ({ id: Number(r.id), type: r.media_type === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const) }));
}
