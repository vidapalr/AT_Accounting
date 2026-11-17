import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";

/**
 * Which business (company) a request belongs to.
 *
 * Each company is a row in acct_legal_businesses. A web address (host) is linked to a company in
 * acct_business_hosts (migration 083), so one copy of the app can serve many companies:
 *   accounting.acme.in -> business 7, shop.acme.in -> business 7.
 * When the address is not listed (or before migration 083), the default business is used:
 * DEFAULT_BUSINESS_ID if set, otherwise the first business in the database. With one company,
 * nothing needs to be set.
 */

type Queryable = Pool | PoolConnection;

let defaultId: number | null = null;

/** The business used when an address is not linked to one. */
export async function defaultBusinessId(pool: Queryable = db): Promise<number> {
  const fromEnv = Number(process.env.DEFAULT_BUSINESS_ID ?? process.env.SHOP_BUSINESS_ID ?? "");
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  if (defaultId !== null) return defaultId;
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT MIN(id) AS id FROM acct_legal_businesses`);
  const id = Number(rows[0]?.id ?? 0);
  if (!id) throw new Error("No business has been set up yet. Run scripts/setup-business.mjs first.");
  defaultId = id;
  return id;
}

/** The host name of this request, lower case, without the port. */
export async function requestHost(): Promise<string> {
  const h = await headers();
  return (h.get("host") ?? "").split(":")[0].trim().toLowerCase();
}

/** The business linked to a host name, or the default business. */
export async function businessIdForHost(host: string, pool: Queryable = db): Promise<number> {
  if (host) {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT legal_business_id FROM acct_business_hosts WHERE host = ? AND status = 'ACTIVE' LIMIT 1`,
        [host]
      );
      if (rows[0]) return Number(rows[0].legal_business_id);
    } catch (error) {
      if (!isMissingTable(error)) throw error;
    }
  }
  return defaultBusinessId(pool);
}

/** The business of the current request (once per request). */
export const currentBusinessId = cache(async (): Promise<number> => businessIdForHost(await requestHost()));

/** Every business that is set up, for scheduled jobs that run for all companies. */
export async function allBusinessIds(pool: Queryable = db): Promise<number[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(`SELECT id FROM acct_legal_businesses ORDER BY id`);
  return rows.map((r) => Number(r.id));
}

/** The business whose WhatsApp number received a message (setting wa_phone_number_id), or null. */
export async function businessIdForWhatsAppNumber(phoneNumberId: string | null | undefined, pool: Queryable = db): Promise<number | null> {
  if (!phoneNumberId) return null;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT legal_business_id FROM acct_business_settings WHERE setting_key = 'wa_phone_number_id' AND setting_value = ? LIMIT 1`,
    [phoneNumberId]
  );
  return rows[0] ? Number(rows[0].legal_business_id) : null;
}

/** The public https address of this request, e.g. https://accounting.example.com (localhost stays http). */
export async function requestOrigin(): Promise<string> {
  const host = (await headers()).get("host") ?? "";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  return `${local || process.env.NODE_ENV !== "production" ? "http" : "https"}://${host}`;
}
