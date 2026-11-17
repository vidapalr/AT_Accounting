import "server-only";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { shopBusinessId } from "@/lib/shop";

/**
 * Quick links in the shop header (e.g. "Sarees", "Cotton sets"): the setting shop_nav_links,
 * written as "Label|search words; Label|search words". Nothing is fixed in code.
 */
export function parseNavLinks(raw: string): Array<{ label: string; href: string }> {
  return raw
    .split(";")
    .map((part) => part.split("|").map((x) => x.trim()))
    .filter(([label, q]) => label && q)
    .slice(0, 6)
    .map(([label, q]) => ({ label, href: `/shop?q=${encodeURIComponent(q)}#products` }));
}

export async function shopNavLinks(): Promise<Array<{ label: string; href: string }>> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = 'shop_nav_links'`,
    [await shopBusinessId()]
  );
  return parseNavLinks(String(rows[0]?.setting_value ?? ""));
}
