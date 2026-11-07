import "server-only";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

type Row = RowDataPacket;

export async function getSettings(businessId: number): Promise<Record<string, string>> {
  const [rows] = await db.execute<Row[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key LIKE 'wa_broadcast_%'`, [businessId]);
  return Object.fromEntries(rows.map((r) => [String(r.setting_key), String(r.setting_value ?? "")]));
}

/** Looks up the product behind the chosen arrivals and the photo to put at the top of the message. */
export async function loadArrival(businessId: number, ids: number[]) {
  if (ids.length === 0) return { error: "No arrival chosen." as const };
  const [ev] = await db.execute<Row[]>(
    `SELECT DISTINCT product_id FROM acct_stock_events WHERE legal_business_id = ? AND id IN (${ids.map(() => "?").join(",")})`, [businessId, ...ids]);
  if (ev.length !== 1) return { error: "Choose the arrivals of one product at a time." as const };
  const productId = Number(ev[0].product_id);
  const [prod] = await db.execute<Row[]>(
    `SELECT product_name, fabric, show_in_shop FROM acct_products WHERE legal_business_id = ? AND id = ?`, [businessId, productId]);
  if (!prod[0]) return { error: "Product not found." as const };
  const [img] = await db.execute<Row[]>(
    `SELECT id FROM acct_product_media WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE' AND media_type = 'IMAGE' AND mime_type IN ('image/jpeg','image/png')
      ORDER BY is_cover DESC, sort_order, id LIMIT 1`, [businessId, productId]);
  const name = String(prod[0].product_name);
  const label = prod[0].fabric ? `${name} (${String(prod[0].fabric)})` : name;
  return {
    productId, label, shopOn: Number(prod[0].show_in_shop) === 1,
    imageId: img[0] ? Number(img[0].id) : null,
  };
}

export async function sentToday(businessId: number): Promise<number> {
  const [r] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM acct_wa_broadcast_recipients WHERE legal_business_id = ? AND status = 'SENT' AND sent_at >= CURDATE()`, [businessId]);
  return Number(r[0]?.n ?? 0);
}

/** Customers who agreed to offers, have a proper mobile number, and have not been sent this arrival yet. */
export async function audienceFor(businessId: number, key: string) {
  const [rows] = await db.execute<Row[]>(
    `SELECT c.id, c.full_name, c.phone,
            EXISTS (SELECT 1 FROM acct_wa_broadcast_recipients r
                     WHERE r.legal_business_id = c.legal_business_id AND r.customer_id = c.id AND r.event_key = ?
                       AND r.status IN ('QUEUED','SENDING','SENT')) AS got
       FROM acct_customers c
      WHERE c.legal_business_id = ? AND c.status = 'ACTIVE' AND c.whatsapp_opt_in = 1 AND c.phone REGEXP '^[6-9][0-9]{9}$'
      ORDER BY c.id`, [key, businessId]);
  const todo = rows.filter((r) => !Number(r.got));
  return { todo: todo.map((r) => ({ id: Number(r.id), name: String(r.full_name), phone: String(r.phone) })), alreadyGot: rows.length - todo.length };
}

