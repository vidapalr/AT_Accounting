"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canWriteOffStockCount } from "@/lib/access";
import { nextCode } from "@/lib/codes";
import { UserError, applyStockDamage } from "@/lib/stock-damage";
import { parseQtyMilli } from "@/lib/returns-math";
import { countDifference, parseCounted } from "@/lib/stock-count-math";

const PAGE = "/accounting/stock-count";
type Row = RowDataPacket & Record<string, string | number | null>;

const qtyText = (milli: bigint) => {
  const abs = milli < 0n ? -milli : milli;
  return `${milli < 0n ? "-" : ""}${abs / 1000n}.${String(abs % 1000n).padStart(3, "0")}`;
};
const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function go(path: string, kind: "saved" | "error", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

/** Saves what was counted. Books quantities are read fresh here, never trusted from the form. */
export async function saveStockCountAction(formData: FormData) {
  const user = await requireAccess("stock_count");
  const businessId = user.legal_business_id;
  const locationId = Number(formData.get("location_id"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!Number.isInteger(locationId) || locationId <= 0) redirect(PAGE);
  const back = `${PAGE}?location=${locationId}`;

  const counted = new Map<number, bigint>();
  try {
    for (const [key, value] of formData.entries()) {
      const m = /^counted_(\d+)$/.exec(key);
      if (!m) continue;
      const qty = parseCounted(String(value));
      if (qty !== null) counted.set(Number(m[1]), qty);
    }
  } catch {
    go(back, "error", "Counted quantities must be plain numbers like 12 or 2.5.");
  }
  if (counted.size === 0) go(back, "error", "Type the counted quantity for at least one item.");
  if (counted.size > 500) go(back, "error", "Too many items in one count. Count a smaller group.");

  const conn = await db.getConnection();
  let countId = 0;
  try {
    await conn.beginTransaction();
    const [locs] = await conn.execute<Row[]>(
      `SELECT id, division_id FROM acct_inventory_locations
       WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [locationId, businessId]
    );
    if (!locs[0]) throw new UserError("That place is not available.");
    const divisionId = Number(locs[0].division_id);

    const ids = [...counted.keys()];
    const marks = ids.map(() => "?").join(",");
    const [books] = await conn.execute<Row[]>(
      `SELECT v.id, COALESCE(SUM(m.quantity_change), 0) AS qty
         FROM acct_product_variants v
         LEFT JOIN acct_stock_movements m
           ON m.variant_id = v.id AND m.legal_business_id = v.legal_business_id AND m.location_id = ?
        WHERE v.legal_business_id = ? AND v.division_id = ? AND v.id IN (${marks})
        GROUP BY v.id`,
      [locationId, businessId, divisionId, ...ids]
    );
    if (books.length !== ids.length) throw new UserError("One of the items does not belong to this place.");

    const countNo = await nextCode(conn, {
      table: "acct_stock_counts", column: "count_no", prefix: "CNT-", width: 4,
      where: "legal_business_id = ?", params: [businessId],
    });
    const [header] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_stock_counts
         (legal_business_id, division_id, location_id, count_no, count_date, note, counted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [businessId, divisionId, locationId, countNo, todayIso(), note || null, user.id]
    );
    countId = header.insertId;

    for (const b of books) {
      const booksMilli = String(b.qty).startsWith("-") ? 0n : parseQtyMilli(String(b.qty));
      const countedMilli = counted.get(Number(b.id))!;
      const { diff } = countDifference(booksMilli, countedMilli);
      await conn.execute(
        `INSERT INTO acct_stock_count_lines
           (legal_business_id, count_id, variant_id, books_qty, counted_qty, difference)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [businessId, countId, Number(b.id), qtyText(booksMilli), qtyText(countedMilli), qtyText(diff)]
      );
    }
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'STOCK_COUNT_SAVED', 'STOCK_COUNT', ?, ?)`,
      [businessId, user.id, countId, JSON.stringify({ items: ids.length })]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (error instanceof UserError) go(back, "error", error.message);
    console.error("Stock count save failed:", error);
    go(back, "error", "The count could not be saved. Nothing was changed.");
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?location=${locationId}&view=${countId}`);
}

/** Owner or accountant: shortages in a count become lost stock (cost goes to the damaged/lost stock account). */
export async function writeOffCountShortagesAction(formData: FormData) {
  const user = await requireAccess("stock_count");
  if (!canWriteOffStockCount(user.role)) redirect(PAGE);
  const businessId = user.legal_business_id;
  const countId = Number(formData.get("count_id"));
  if (!Number.isInteger(countId) || countId <= 0) redirect(PAGE);

  const conn = await db.getConnection();
  let locationId = 0;
  let written = 0;
  try {
    await conn.beginTransaction();
    const [counts] = await conn.execute<Row[]>(
      `SELECT id, location_id, count_no, status FROM acct_stock_counts
       WHERE id = ? AND legal_business_id = ? FOR UPDATE`,
      [countId, businessId]
    );
    const count = counts[0];
    if (!count) throw new UserError("That count was not found.");
    locationId = Number(count.location_id);
    if (count.status !== "COUNTED") throw new UserError("This count has already been settled.");

    const [lines] = await conn.execute<Row[]>(
      `SELECT id, variant_id, difference FROM acct_stock_count_lines
       WHERE legal_business_id = ? AND count_id = ? AND difference < 0 AND written_off = 0
       ORDER BY id`,
      [businessId, countId]
    );
    for (const line of lines) {
      const short = parseQtyMilli(String(line.difference).replace("-", ""));
      // Never write off more than the books now hold (sales may have happened since the count).
      const [stock] = await conn.execute<Row[]>(
        `SELECT COALESCE(SUM(quantity_change), 0) AS qty FROM acct_stock_movements
         WHERE legal_business_id = ? AND location_id = ? AND variant_id = ?`,
        [businessId, locationId, Number(line.variant_id)]
      );
      const onHand = String(stock[0].qty).startsWith("-") ? 0n : parseQtyMilli(String(stock[0].qty));
      const qty = short > onHand ? onHand : short;
      if (qty <= 0n) continue;
      const r = await applyStockDamage(conn, {
        businessId, userId: user.id, locationId, variantId: Number(line.variant_id),
        date: todayIso(), reason: "LOST", remarks: `Stock count ${count.count_no}`, qtyMilli: qty,
      });
      await conn.execute(
        `UPDATE acct_stock_count_lines SET written_off = 1, damage_id = ? WHERE id = ?`,
        [r.id, Number(line.id)]
      );
      written++;
    }
    await conn.execute(
      `UPDATE acct_stock_counts SET status = 'SETTLED', settled_by = ?, settled_at = NOW() WHERE id = ?`,
      [user.id, countId]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'STOCK_COUNT_SETTLED', 'STOCK_COUNT', ?, ?)`,
      [businessId, user.id, countId, JSON.stringify({ written_off: written })]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    const msg = error instanceof UserError ? error.message : "Could not write off the shortages. Nothing was changed.";
    if (!(error instanceof UserError)) console.error("Stock count settle failed:", error);
    go(`${PAGE}?location=${locationId || ""}&view=${countId}`, "error", msg);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/stock");
  go(`${PAGE}?location=${locationId}&view=${countId}`, "saved", `Shortages written off as lost stock (${written} item${written === 1 ? "" : "s"}). Post the pending entries on Reports.`);
}

/** Sets how many of an item should always be kept. Blank clears it. */
export async function setLowStockLevelAction(formData: FormData) {
  const user = await requireAccess("stock");
  const variantId = Number(formData.get("variant_id"));
  const raw = String(formData.get("level") ?? "").trim();
  const back = String(formData.get("back") ?? "/accounting/low-stock");
  const safeBack = back.startsWith("/accounting/low-stock") ? back : "/accounting/low-stock";
  if (!Number.isInteger(variantId) || variantId <= 0) redirect(safeBack);
  let level: string | null = null;
  try {
    if (raw !== "") level = qtyText(parseQtyMilli(raw));
  } catch {
    go(safeBack, "error", "The minimum must be a plain number like 5.");
  }
  await db.execute(
    `UPDATE acct_product_variants SET low_stock_level = ? WHERE id = ? AND legal_business_id = ?`,
    [level, variantId, user.legal_business_id]
  );
  revalidatePath("/accounting/low-stock");
  go(safeBack, "saved", level === null ? "Minimum cleared." : "Minimum saved.");
}
