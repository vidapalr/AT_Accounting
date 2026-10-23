import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/customer-phone";
import { parseStockMessage, type ParsedLine } from "@/lib/stock-message";

type Conn = Pool | PoolConnection;

export type Reporter = {
  id: number;
  name: string;
  locationId: number;
  divisionId: number | null;
};

/** Who is this phone number? Only registered, active staff may send stock reports. */
export async function findReporterByPhone(
  conn: Conn,
  businessId: number,
  rawPhone: string
): Promise<Reporter | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT r.id, r.full_name, r.location_id, l.division_id
       FROM acct_stock_reporters r
       LEFT JOIN acct_inventory_locations l
         ON l.legal_business_id = r.legal_business_id AND l.id = r.location_id
      WHERE r.legal_business_id = ? AND r.phone = ? AND r.status = 'ACTIVE'`,
    [businessId, phone]
  );
  const r = rows[0];
  return r
    ? { id: Number(r.id), name: String(r.full_name), locationId: Number(r.location_id), divisionId: r.division_id ? Number(r.division_id) : null }
    : null;
}

/** Turn the item code the employee typed into a product variant of this division. */
async function resolveVariant(
  conn: Conn,
  businessId: number,
  divisionId: number | null,
  token: string
): Promise<number | null> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM acct_product_variants
      WHERE legal_business_id = ? AND status = 'ACTIVE'
        AND (? IS NULL OR division_id = ?)
        AND (UPPER(sku) = UPPER(?) OR barcode = ?)
      LIMIT 2`,
    [businessId, divisionId, divisionId, token, token]
  );
  return rows.length === 1 ? Number(rows[0].id) : null;
}

/**
 * Save every line of a message as a draft. A line we cannot understand is saved
 * too, with the reason, so nothing an employee sent is silently lost.
 */
export async function saveStockDrafts(input: {
  businessId: number;
  source: "WHATSAPP" | "PASTED";
  reporter: Reporter;
  text: string;
  waMessageId?: string | null;
}): Promise<{ saved: number; problems: number }> {
  const parsed: ParsedLine[] = parseStockMessage(input.text);
  let saved = 0;
  let problems = 0;

  for (const line of parsed) {
    let variantId: number | null = null;
    let problem = line.problem;

    if (!problem && line.item) {
      variantId = await resolveVariant(db, input.businessId, input.reporter.divisionId, line.item);
      if (variantId === null) problem = `No product found for "${line.item}".`;
    }

    const [res] = await db.execute<import("mysql2").ResultSetHeader>(
      `INSERT IGNORE INTO acct_stock_drafts
         (legal_business_id, division_id, source, wa_message_id, reporter_id, reporter_name,
          location_id, raw_line, action, variant_id, quantity, price, note, problem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.businessId, input.reporter.divisionId, input.source, input.waMessageId ?? null,
        input.reporter.id, input.reporter.name, input.reporter.locationId, line.raw,
        line.action, variantId, line.quantity, line.price, line.note, problem,
      ]
    );
    if (res.affectedRows === 1) {
      saved += 1;
      if (problem) problems += 1;
    }
  }
  return { saved, problems };
}
