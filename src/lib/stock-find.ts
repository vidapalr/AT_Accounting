import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { parsePaise, parseQtyMilli } from "@/lib/returns-math";
import { UserError } from "@/lib/stock-damage";

type Row = RowDataPacket & Record<string, string | number | null>;

const money = (paise: bigint) => `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
const qtyText = (milli: bigint) => `${milli / 1000n}.${String(milli % 1000n).padStart(3, "0")}`;

/**
 * Adds extra counted stock to the books at the item's last buying cost (or, if it was never bought,
 * the average cost of what is on hand). Call inside a transaction.
 */
export async function applyStockFind(
  conn: PoolConnection,
  input: { businessId: number; userId: number; locationId: number; variantId: number; date: string; remarks: string; qtyMilli: bigint }
): Promise<{ id: number; totalCost: bigint }> {
  const { businessId, locationId, variantId, date, remarks, qtyMilli } = input;
  if (qtyMilli <= 0n) throw new UserError("Nothing extra to add.");
  const [locs] = await conn.execute<Row[]>(
    `SELECT id, division_id, branch_id FROM acct_inventory_locations
      WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE' FOR UPDATE`,
    [locationId, businessId]
  );
  const loc = locs[0];
  if (!loc) throw new UserError("That location is not available.");

  let cost4: bigint | null = null;
  const [last] = await conn.execute<Row[]>(
    `SELECT unit_cost FROM acct_stock_movements
      WHERE legal_business_id = ? AND division_id = ? AND variant_id = ? AND movement_type = 'PURCHASE_RECEIPT' AND unit_cost > 0
      ORDER BY movement_date DESC, id DESC LIMIT 1`,
    [businessId, loc.division_id, variantId]
  );
  if (last[0]) {
    const m = /^(\d+)(?:\.(\d{1,4}))?/.exec(String(last[0].unit_cost));
    if (m) cost4 = BigInt(m[1]) * 10000n + BigInt((m[2] ?? "").padEnd(4, "0"));
  }
  if (cost4 === null) {
    const [stock] = await conn.execute<Row[]>(
      `SELECT COALESCE(SUM(quantity_change), 0) AS qty,
              COALESCE(SUM(CASE WHEN quantity_change > 0 THEN total_cost ELSE -total_cost END), 0) AS value
         FROM acct_stock_movements
        WHERE legal_business_id = ? AND division_id = ? AND variant_id = ?`,
      [businessId, loc.division_id, variantId]
    );
    const onHand = String(stock[0].qty).startsWith("-") ? 0n : parseQtyMilli(String(stock[0].qty));
    const value = String(stock[0].value).startsWith("-") ? 0n : parsePaise(String(stock[0].value));
    if (onHand > 0n && value > 0n) cost4 = (value * 100000n + onHand / 2n) / onHand;
  }
  if (cost4 === null || cost4 <= 0n) {
    throw new UserError("This item has no buying cost on record, so the extra cannot be valued. Record its purchase first.");
  }
  const totalCost = (cost4 * qtyMilli + 50000n) / 100000n;
  const unitCost = `${cost4 / 10000n}.${String(cost4 % 10000n).padStart(4, "0")}`;

  const [header] = await conn.execute<ResultSetHeader>(
    `INSERT INTO acct_stock_finds
       (legal_business_id, division_id, branch_id, location_id, variant_id, find_date, quantity, unit_cost, total_cost, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, loc.division_id, loc.branch_id, locationId, variantId, date, qtyText(qtyMilli), unitCost, money(totalCost), remarks || null, input.userId]
  );
  await conn.execute(
    `INSERT INTO acct_stock_movements
       (legal_business_id, division_id, location_id, variant_id, movement_date,
        movement_type, source_type, source_id, source_line_id, quantity_change,
        unit_cost, total_cost, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, 'ADJUSTMENT_IN', 'STOCK_FIND', ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, loc.division_id, locationId, variantId, date, header.insertId, header.insertId,
     qtyText(qtyMilli), unitCost, money(totalCost), `Stock found${remarks ? `: ${remarks}` : ""}`.slice(0, 500), input.userId]
  );
  await conn.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'STOCK_FIND_RECORDED', 'STOCK_FIND', ?, ?)`,
    [businessId, input.userId, header.insertId, JSON.stringify({ quantity: qtyText(qtyMilli), cost: money(totalCost) })]
  );
  return { id: header.insertId, totalCost };
}
