import "server-only";
import { connection } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { bestOffer, type Offer } from "@/lib/offer-math";

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

const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/** Active offers as the maths module wants them. */
export async function loadOffers(businessId = SHOP_BUSINESS_ID): Promise<Offer[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, offer_name, channel, kind, offer_value, scope, fabric,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on, DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on, status
       FROM acct_offers WHERE legal_business_id = ? AND status = 'ACTIVE'`,
    [businessId]
  );
  if (rows.length === 0) return [];
  const [links] = await db.query<RowDataPacket[]>(
    `SELECT offer_id, product_id FROM acct_offer_products WHERE offer_id IN (?)`,
    [rows.map(r => Number(r.id))]
  );
  return rows.map(r => ({
    id: Number(r.id), name: String(r.offer_name), channel: r.channel, kind: r.kind, value: Number(r.offer_value),
    scope: r.scope, fabric: r.fabric ? String(r.fabric) : null,
    productIds: links.filter(l => Number(l.offer_id) === Number(r.id)).map(l => Number(l.product_id)),
    startsOn: r.starts_on ? String(r.starts_on) : null, endsOn: r.ends_on ? String(r.ends_on) : null, active: r.status === "ACTIVE",
  })) as Offer[];
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

export type ShopVariant = {
  id: number; sku: string; size: string | null; color: string | null; style: string | null;
  /** What the customer pays (after any online offer). */
  price: number | null;
  /** The crossed-out price, when there is a saving to show. */
  was: number | null;
  /** Price before the offer, kept on the order. */
  listPrice: number | null;
  offerName: string | null;
  photoId: number | null;
  available: boolean;
};
export type ShopProduct = {
  id: number;
  name: string;
  fabric: string | null;
  description: string | null;
  highlights: string[];
  care: string | null;
  sizeGuide: string | null;
  coverId: number | null;
  fromPrice: number | null;
  fromWas: number | null;
  offerName: string | null;
  available: boolean;
  variants: ShopVariant[];
};

async function load(where: string, params: (string | number)[]): Promise<ShopProduct[]> {
  await connection(); // read at request time, never while the site is being built
  const [prods] = await db.execute<RowDataPacket[]>(
    `SELECT p.id, p.product_name, p.fabric, p.description, p.highlights, p.care_text, p.size_guide,
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
    `SELECT id, product_id, sku, size_label, color_name, design_code, shop_price, compare_price, photo_media_id FROM acct_product_variants
      WHERE legal_business_id = ? AND status = 'ACTIVE' AND product_id IN (?) ORDER BY id`,
    [SHOP_BUSINESS_ID, ids]
  );
  const variantIds = vars.map(v => Number(v.id));
  const [prices, stocked, offers] = await Promise.all([latestPrices(variantIds), inStock(variantIds), loadOffers()]);
  const today = todayIst();

  return prods.map(p => {
    const variants = vars
      .filter(v => Number(v.product_id) === Number(p.id))
      .map(v => {
        const base = v.shop_price !== null && Number(v.shop_price) > 0 ? Number(v.shop_price) : (prices.get(Number(v.id)) ?? null);
        const hit = base === null ? null : bestOffer(offers, "ONLINE", { productId: Number(p.id), fabric: p.fabric ? String(p.fabric) : null }, BigInt(Math.round(base * 100)), today);
        const price = hit ? Number(hit.newPaise) / 100 : base;
        const compare = v.compare_price !== null && Number(v.compare_price) > 0 ? Number(v.compare_price) : null;
        const was = price !== null ? [base, compare].filter((x): x is number => x !== null && x > price).sort((a, b) => b - a)[0] ?? null : null;
        return {
          id: Number(v.id),
          sku: String(v.sku),
          size: v.size_label ? String(v.size_label) : null,
          color: v.color_name ? String(v.color_name) : null,
          style: v.design_code ? String(v.design_code) : null,
          price,
          was,
          listPrice: base,
          offerName: hit ? hit.offer.name : null,
          photoId: v.photo_media_id ? Number(v.photo_media_id) : null,
          available: stocked.has(Number(v.id)),
        };
      });
    const priced = variants.map(v => v.price).filter((x): x is number => x !== null);
    return {
      id: Number(p.id),
      name: String(p.product_name),
      fabric: p.fabric ? String(p.fabric) : null,
      description: p.description ? String(p.description) : null,
      highlights: String(p.highlights ?? "").split("\n").map((x: string) => x.trim()).filter(Boolean).slice(0, 8),
      care: p.care_text ? String(p.care_text) : null,
      sizeGuide: p.size_guide ? String(p.size_guide) : null,
      coverId: p.cover_id ? Number(p.cover_id) : null,
      fromPrice: priced.length ? Math.min(...priced) : null,
      fromWas: (variants.filter(v => v.price !== null).sort((a, b) => (a.price as number) - (b.price as number))[0]?.was) ?? null,
      offerName: variants.find(v => v.offerName)?.offerName ?? null,
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
