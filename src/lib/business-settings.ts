import "server-only";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

/**
 * Small per-company settings (acct_business_settings): one place to read and write them,
 * instead of each screen writing its own query.
 */

/** One setting, or "" when it is not set. */
export async function businessSetting(businessId: number, key: string): Promise<string> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = ?`,
    [businessId, key]
  );
  return String(rows[0]?.setting_value ?? "");
}

/** Several settings at once (missing keys are absent from the result). */
export async function businessSettings(businessId: number, keys: string[]): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key IN (${keys.map(() => "?").join(",")})`,
    [businessId, ...keys]
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[String(r.setting_key)] = String(r.setting_value);
  return out;
}

/** Save settings for a company (an empty value is stored as empty, not removed). */
export async function saveBusinessSettings(businessId: number, values: Record<string, string>, userId: number | null): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await db.execute(
      `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [businessId, key, value.slice(0, 255), userId]
    );
  }
}
