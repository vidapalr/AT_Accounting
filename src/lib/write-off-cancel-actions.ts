"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/returns";
type Row = RowDataPacket & Record<string, string | number | null>;

const done = (kind: "saved" | "error", message: string): never =>
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message.slice(0, 300))}`);

/**
 * Owner only. Cancels a damaged / lost write-off made by mistake: the pieces come back into stock
 * at the cost they left at, and the record is marked cancelled. If its journal is already posted,
 * Accounting health then shows it as "no longer valid" for the owner to reverse.
 */
export async function cancelWriteOffAction(formData: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const id = Number(formData.get("damage_id"));
  if (!Number.isInteger(id) || id <= 0) done("error", "That write-off was not found.");

  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<Row[]>(
      `SELECT id, division_id, location_id, variant_id, quantity, unit_cost, total_cost, reason, status,
              DATE_FORMAT(damage_date, '%Y-%m-%d') AS d
         FROM acct_stock_damages WHERE id = ? AND legal_business_id = ? FOR UPDATE`,
      [id, businessId]
    );
    const w = rows[0];
    if (!w) throw new Error("That write-off was not found.");
    if (w.status !== "POSTED") throw new Error("That write-off is already cancelled.");

    await conn.execute(`UPDATE acct_stock_damages SET status = 'VOID' WHERE id = ?`, [id]);
    await conn.execute(
      `INSERT INTO acct_stock_movements
         (legal_business_id, division_id, location_id, variant_id, movement_date,
          movement_type, source_type, source_id, source_line_id, quantity_change,
          unit_cost, total_cost, remarks, created_by)
       VALUES (?, ?, ?, ?, CURDATE(), 'ADJUSTMENT_IN', 'STOCK_DAMAGE_CANCEL', ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId, w.division_id, w.location_id, w.variant_id, id, id,
        String(w.quantity), String(w.unit_cost), String(w.total_cost),
        `Write-off ${id} cancelled`, user.id,
      ]
    );
    // If it came from a stock count, mark that line as no longer written off.
    await conn.execute(
      `UPDATE acct_stock_count_lines SET written_off = 0, damage_id = NULL WHERE damage_id = ? AND legal_business_id = ?`,
      [id, businessId]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'STOCK_WRITE_OFF_CANCELLED', 'STOCK_DAMAGE', ?, ?)`,
      [businessId, user.id, id, JSON.stringify({ quantity: String(w.quantity), cost: String(w.total_cost) })]
    );
    await conn.commit();
    message = `Write-off cancelled. ${String(w.quantity)} piece(s) are back in stock. If it was already in the books, open Accounting health and reverse the old entry.`;
  } catch (error) {
    await conn.rollback().catch(() => {});
    const known = error instanceof Error && /write-off/.test(error.message);
    if (!known) console.error("Cancel write-off failed:", error);
    message = known ? (error as Error).message : "Could not cancel the write-off. Nothing was changed.";
    conn.release();
    revalidatePath(PAGE);
    done("error", message);
  }
  conn.release();
  revalidatePath(PAGE);
  revalidatePath("/accounting/stock");
  done("saved", message);
}
