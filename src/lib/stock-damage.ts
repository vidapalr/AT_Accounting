import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { parsePaise, parseQtyMilli } from "@/lib/returns-math";

type Row = RowDataPacket & Record<string, string | number | null>;

export class UserError extends Error {}

const money = (paise: bigint) =>
  `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
const qtyText = (milli: bigint) =>
  `${milli / 1000n}.${String(milli % 1000n).padStart(3, "0")}`;

/** Writes one damaged/lost record and its stock movement. Call inside a transaction. */
export async function applyStockDamage(
  conn: PoolConnection,
  input: {
    businessId: number;
    userId: number;
    locationId: number;
    variantId: number;
    date: string;
    reason: "DAMAGED" | "LOST" | "OTHER";
    remarks: string;
    qtyMilli: bigint;
  }
): Promise<{ qtyMilli: bigint; totalCost: bigint; id: number }> {
  const { businessId, locationId, variantId, date, reason, remarks, qtyMilli } = input;
  const user = { id: input.userId };
  const [locs] = await conn.execute<Row[]>(
    `SELECT id, division_id, branch_id FROM acct_inventory_locations
     WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE' FOR UPDATE`,
    [locationId, businessId]
  );
  const loc = locs[0];
  if (!loc) throw new UserError("That location is not available.");

  const [variants] = await conn.execute<Row[]>(
    `SELECT id FROM acct_product_variants
     WHERE id = ? AND legal_business_id = ? AND division_id = ?`,
    [variantId, businessId, loc.division_id]
  );
  if (variants.length !== 1) throw new UserError("That product does not belong to this location's division.");

  // Same valuation the sales screen uses: average cost of what is on hand.
  const [stock] = await conn.execute<Row[]>(
    `SELECT COALESCE(SUM(quantity_change), 0) AS qty,
            COALESCE(SUM(CASE WHEN quantity_change > 0 THEN total_cost ELSE -total_cost END), 0) AS value
     FROM acct_stock_movements
     WHERE legal_business_id = ? AND division_id = ? AND location_id = ? AND variant_id = ?`,
    [businessId, loc.division_id, locationId, variantId]
  );
  const onHand = parseQtyMilli(String(stock[0].qty).replace("-", "0"));
  const stockValue = parsePaise(String(stock[0].value).replace("-", "0"));
  if (String(stock[0].qty).startsWith("-") || qtyMilli > onHand || onHand === 0n) {
    throw new UserError(`Only ${qtyText(onHand)} on hand at this location.`);
  }

  const cost4 = (stockValue * 100000n + onHand / 2n) / onHand; // unit cost, 4 decimals
  const totalCost = (cost4 * qtyMilli + 50000n) / 100000n;
  const unitCost = `${cost4 / 10000n}.${String(cost4 % 10000n).padStart(4, "0")}`;

  const [header] = await conn.execute<ResultSetHeader>(
    `INSERT INTO acct_stock_damages
       (legal_business_id, division_id, branch_id, location_id, variant_id, damage_date,
        quantity, unit_cost, total_cost, reason, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId, loc.division_id, loc.branch_id, locationId, variantId, date,
      qtyText(qtyMilli), unitCost, money(totalCost), reason, remarks || null, user.id,
    ]
  );
  await conn.execute(
    `INSERT INTO acct_stock_movements
       (legal_business_id, division_id, location_id, variant_id, movement_date,
        movement_type, source_type, source_id, source_line_id, quantity_change,
        unit_cost, total_cost, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, 'ADJUSTMENT_OUT', 'STOCK_DAMAGE', ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId, loc.division_id, locationId, variantId, date, header.insertId, header.insertId,
      `-${qtyText(qtyMilli)}`, unitCost, money(totalCost),
      `Stock ${reason.toLowerCase()}${remarks ? `: ${remarks}` : ""}`.slice(0, 500), user.id,
    ]
  );
  await conn.execute(
    `INSERT INTO acct_audit_events
       (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'STOCK_DAMAGE_RECORDED', 'STOCK_DAMAGE', ?, ?)`,
    [businessId, user.id, header.insertId, JSON.stringify({ quantity: qtyText(qtyMilli), cost: money(totalCost) })]
  );
  return { qtyMilli, totalCost, id: header.insertId };
}
