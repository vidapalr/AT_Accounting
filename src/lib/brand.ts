import "server-only";

import { cache } from "react";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";
import { currentBusinessId } from "@/lib/tenant";
import { BRAND_KEYS, brandFrom, type Brand } from "@/lib/brand-core";

export type { Brand } from "@/lib/brand-core";

/** The brand of one business, read from the database. */
export async function loadBrand(businessId: number, pool: Pool | PoolConnection = db): Promise<Brand> {
  const [biz] = await pool.execute<RowDataPacket[]>(
    `SELECT legal_name, trading_name FROM acct_legal_businesses WHERE id = ?`,
    [businessId]
  );
  const keys = Object.values(BRAND_KEYS);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key IN (${keys.map(() => "?").join(",")})`,
    [businessId, ...keys]
  );
  const settings: Record<string, string> = {};
  for (const r of rows) settings[String(r.setting_key)] = String(r.setting_value);
  return brandFrom((biz[0] ?? {}) as { legal_name?: string | null; trading_name?: string | null }, settings);
}

/** The brand of a business, read once per request. */
export const getBrand = cache(async (businessId?: number): Promise<Brand> =>
  loadBrand(businessId ?? (await currentBusinessId()))
);
