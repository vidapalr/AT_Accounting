import { NextRequest, NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const user = await requireGroupOwner();
    const legalBusinessId = user.legal_business_id;
    const params = request.nextUrl.searchParams;
    const locationId = Number(params.get("locationId"));
    const variantId = Number(params.get("variantId"));
    const page = Number(params.get("page") ?? "1");
    const scope = params.get("scope");

    if (![locationId, variantId, page].every(n => Number.isSafeInteger(n) && n > 0) ||
        page > 10000 || !["CENTRAL", "BRANCH"].includes(scope ?? "")) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const locationRule = scope === "CENTRAL"
      ? "l.location_type IN ('CENTRAL_WAREHOUSE', 'WAREHOUSE') AND l.branch_id IS NULL"
      : "l.branch_id IS NOT NULL";

    const [valid] = await db.execute<RowDataPacket[]>(
      `SELECT l.id FROM acct_inventory_locations l
       JOIN acct_product_variants v ON v.legal_business_id = l.legal_business_id
         AND v.division_id = l.division_id AND v.id = ?
       WHERE l.legal_business_id = ? AND l.division_id = 1 AND l.id = ? AND ${locationRule}
       LIMIT 1`, [variantId, legalBusinessId, locationId],
    );
    if (valid.length !== 1) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Older schemas may use different timestamp column names.
    const [columns] = await db.execute<RowDataPacket[]>(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acct_stock_movements'
         AND COLUMN_NAME IN ('movement_date','posted_at','created_at')`,
    );
    const present = new Set(columns.map(c => String(c.COLUMN_NAME)));
    const dateCol = ["movement_date", "posted_at", "created_at"].find(c => present.has(c));
    const dateSql = dateCol ? `DATE_FORMAT(m.${dateCol}, '%Y-%m-%d %H:%i')` : "NULL";
    const [countRows] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM acct_stock_movements
       WHERE legal_business_id = ? AND division_id = 1 AND location_id = ? AND variant_id = ?`,
      [legalBusinessId, locationId, variantId],
    );
    const total = Number(countRows[0]?.total ?? 0);
    const limit = 50;
    const offset = (page - 1) * limit;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT m.id, m.movement_type, m.quantity_change, m.source_type,
              m.source_id, m.source_line_id, ${dateSql} AS event_date
       FROM acct_stock_movements m
       WHERE m.legal_business_id = ? AND m.division_id = 1
         AND m.location_id = ? AND m.variant_id = ?
       ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      [legalBusinessId, locationId, variantId, limit, offset],
    );
    return NextResponse.json({
      total: String(total), hasMore: offset + rows.length < total,
      rows: rows.map(r => ({
        id: Number(r.id), movement_type: String(r.movement_type),
        quantity_change: String(r.quantity_change),
        source_type: r.source_type == null ? null : String(r.source_type),
        source_id: r.source_id == null ? null : String(r.source_id),
        source_line_id: r.source_line_id == null ? null : String(r.source_line_id),
        event_date: r.event_date == null ? null : String(r.event_date),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Let Next.js handle prerender interruptions and authentication redirects.
    unstable_rethrow(error);
    console.error("Inventory history error", error);
    return NextResponse.json({ error: "Unable to load stock history" }, { status: 500 });
  }
}
