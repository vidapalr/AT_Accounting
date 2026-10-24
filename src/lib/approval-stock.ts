import "server-only";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { parseQtyMilli } from "@/lib/returns-math";

type Row = RowDataPacket & Record<string, string | number | null>;

/** Helpers for items a customer has taken home to try. Used by the approval screens and the sales action. */

export const qtyText = (milli: bigint) =>
  `${milli / 1000n}.${String(milli % 1000n).padStart(3, "0")}`;

/**
 * The per-division "With customers" place. Goods sitting there are still ours,
 * but not on the shop shelf. Created the first time it is needed.
 */
export async function ensureHoldingLocation(
  conn: PoolConnection,
  businessId: number,
  divisionId: number,
  userId: number
): Promise<number> {
  const code = `WITH-CUST-${divisionId}`;
  const read = async () => {
    const [rows] = await conn.execute<Row[]>(
      `SELECT id FROM acct_inventory_locations
       WHERE legal_business_id = ? AND location_code = ?`,
      [businessId, code]
    );
    return rows[0];
  };
  let row = await read();
  if (!row) {
    try {
      await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_inventory_locations
           (legal_business_id, division_id, branch_id, location_code, location_name,
            location_type, address, status, created_by)
         VALUES (?, ?, NULL, ?, 'With customers (on approval)', 'OTHER',
                 'Items customers have taken home to try', 'ACTIVE', ?)`,
        [businessId, divisionId, code, userId]
      );
    } catch {
      // Created a moment ago by someone else: use theirs.
    }
    row = await read();
  }
  return Number(row!.id);
}

/** Moves one item's stock from one place to another at the cost it left with. Call inside a transaction. */
export async function moveItemStock(
  conn: PoolConnection,
  m: {
    businessId: number;
    divisionId: number;
    fromLocationId: number;
    toLocationId: number;
    variantId: number;
    date: string;
    quantity: string; // plain decimal, positive
    unitCost: string;
    totalCost: string;
    handoutId: number;
    itemId: number;
    userId: number;
    remarks: string;
    /** Tells the three kinds of move apart: APPROVAL_OUT, APPROVAL_BACK, APPROVAL_KEPT. */
    sourceType: "APPROVAL_OUT" | "APPROVAL_BACK" | "APPROVAL_KEPT";
  }
): Promise<void> {
  const sql = `INSERT INTO acct_stock_movements
      (legal_business_id, division_id, location_id, variant_id, movement_date,
       movement_type, source_type, source_id, source_line_id,
       quantity_change, unit_cost, total_cost, remarks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  await conn.execute(sql, [
    m.businessId, m.divisionId, m.fromLocationId, m.variantId, m.date, "TRANSFER_OUT", m.sourceType,
    m.handoutId, m.itemId, `-${m.quantity}`, m.unitCost, m.totalCost, m.remarks, m.userId,
  ]);
  await conn.execute(sql, [
    m.businessId, m.divisionId, m.toLocationId, m.variantId, m.date, "TRANSFER_IN", m.sourceType,
    m.handoutId, m.itemId, m.quantity, m.unitCost, m.totalCost, m.remarks, m.userId,
  ]);
}

/**
 * The customer decided to keep these items and a bill is being confirmed.
 * Brings them back to the shop shelf (so the bill takes them out the normal
 * way) and marks them kept. Everything is inside the bill's transaction, so
 * if the bill fails nothing changes. Throws APPROVAL_GONE / APPROVAL_MISMATCH.
 */
export async function releaseItemsForSale(
  conn: PoolConnection,
  p: {
    businessId: number;
    divisionId: number;
    userId: number;
    shopLocationId: number;
    date: string;
    itemIds: number[];
    billedMilliByVariant: Map<number, bigint>;
  }
): Promise<number[]> {
  if (p.itemIds.length === 0) return [];
  const marks = p.itemIds.map(() => "?").join(",");
  const [items] = await conn.execute<Row[]>(
    `SELECT i.id, i.handout_id, i.variant_id, i.quantity, i.unit_cost, i.total_cost,
            h.handout_no, h.holding_location_id, h.division_id
       FROM acct_approval_items i
       JOIN acct_approval_handouts h
         ON h.id = i.handout_id AND h.legal_business_id = i.legal_business_id
      WHERE i.legal_business_id = ? AND i.status = 'OUT' AND i.id IN (${marks})
      ORDER BY i.id FOR UPDATE`,
    [p.businessId, ...p.itemIds]
  );
  if (items.length !== new Set(p.itemIds).size || items.some((i) => Number(i.division_id) !== p.divisionId)) {
    throw new Error("APPROVAL_GONE");
  }

  // The bill must include everything being kept, otherwise goods would vanish without a sale.
  const needed = new Map<number, bigint>();
  for (const i of items) {
    needed.set(Number(i.variant_id), (needed.get(Number(i.variant_id)) ?? 0n) + parseQtyMilli(String(i.quantity)));
  }
  for (const [variantId, qty] of needed) {
    if ((p.billedMilliByVariant.get(variantId) ?? 0n) < qty) throw new Error("APPROVAL_MISMATCH");
  }

  for (const i of items) {
    await moveItemStock(conn, {
      businessId: p.businessId,
      divisionId: p.divisionId,
      fromLocationId: Number(i.holding_location_id),
      toLocationId: p.shopLocationId,
      variantId: Number(i.variant_id),
      date: p.date,
      quantity: qtyText(parseQtyMilli(String(i.quantity))),
      unitCost: String(i.unit_cost),
      totalCost: String(i.total_cost),
      handoutId: Number(i.handout_id),
      itemId: Number(i.id),
      userId: p.userId,
      remarks: `Customer kept ${i.handout_no}`,
      sourceType: "APPROVAL_KEPT",
    });
  }
  await conn.execute(
    `UPDATE acct_approval_items
        SET status = 'KEPT', closed_date = ?, closed_by = ?
      WHERE legal_business_id = ? AND id IN (${marks})`,
    [p.date, p.userId, p.businessId, ...p.itemIds]
  );
  return items.map((i) => Number(i.id));
}
