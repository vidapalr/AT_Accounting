import "server-only";
import type { PoolConnection } from "mysql2/promise";

import { cost4ToPaise, priceBand } from "@/lib/pricing-rules";
import { isMissingTable } from "@/lib/db-errors";

const rupees = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

/**
 * The selling price typed on a purchase line becomes the item's price everywhere (bills, stock moves,
 * website unless it has its own price): usual price as typed, minimum and maximum worked out from this
 * purchase's cost (see pricing-rules). Lines with no price typed leave the item's prices as they are.
 * Inside the purchase's transaction.
 */
export async function saveBuyingPrices(conn: PoolConnection, businessId: number, userId: number,
  lines: Array<{ variantId: number; unitCost: string; pricePaise: bigint | null }>): Promise<void> {
  for (const l of lines) {
    if (l.pricePaise === null || l.pricePaise <= 0n) continue;
    const band = priceBand(cost4ToPaise(l.unitCost), l.pricePaise);
    try {
      await conn.execute(
        `INSERT INTO acct_selling_prices (legal_business_id, variant_id, min_price, max_price, suggested_price, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE min_price = VALUES(min_price), max_price = VALUES(max_price),
                                 suggested_price = VALUES(suggested_price), updated_by = VALUES(updated_by)`,
        [businessId, l.variantId, rupees(band.min), rupees(band.max), rupees(band.usual), userId]
      );
    } catch (e) {
      if (isMissingTable(e)) return; // selling prices not set up yet (migration 060)
      throw e;
    }
  }
}
