"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canApproveFreeStock } from "@/lib/access";
import { nextCode } from "@/lib/codes";
import { UserError } from "@/lib/stock-damage";
import { parsePaise, parseQtyMilli } from "@/lib/returns-math";

const PAGE = "/accounting/free-stock";

type Row = RowDataPacket & Record<string, string | number | null>;

const money = (paise: bigint) =>
  `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
const qtyText = (milli: bigint) =>
  `${milli / 1000n}.${String(milli % 1000n).padStart(3, "0")}`;
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const todayIso = () => new Date().toISOString().slice(0, 10);

function go(path: string, kind: "saved" | "error", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

function friendly(error: unknown, fallback: string): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof Error && /Invalid/.test(error.message)) return error.message;
  return fallback;
}

/**
 * Takes the stock out at average cost (the same valuation the sales and damage
 * screens use) and records the cost on the lines. Call inside a transaction,
 * with the entry row already locked.
 */
async function issueStock(
  conn: PoolConnection,
  entry: { id: number; entryNo: string; businessId: number; divisionId: number; locationId: number; date: string },
  userId: number
): Promise<bigint> {
  const [lines] = await conn.execute<Row[]>(
    `SELECT id, variant_id, quantity FROM acct_free_stock_lines
     WHERE legal_business_id = ? AND free_stock_id = ? ORDER BY id`,
    [entry.businessId, entry.id]
  );
  if (lines.length === 0) throw new UserError("This entry has no items.");

  let total = 0n;
  for (const line of lines) {
    const qtyMilli = parseQtyMilli(String(line.quantity));
    const [stock] = await conn.execute<Row[]>(
      `SELECT COALESCE(SUM(quantity_change), 0) AS qty,
              COALESCE(SUM(CASE WHEN quantity_change > 0 THEN total_cost ELSE -total_cost END), 0) AS value
       FROM acct_stock_movements
       WHERE legal_business_id = ? AND division_id = ? AND location_id = ? AND variant_id = ?`,
      [entry.businessId, entry.divisionId, entry.locationId, line.variant_id]
    );
    const qtyTextOnHand = String(stock[0].qty);
    const onHand = qtyTextOnHand.startsWith("-") ? 0n : parseQtyMilli(qtyTextOnHand);
    if (onHand === 0n || qtyMilli > onHand) {
      throw new UserError(`Only ${qtyText(onHand)} is in stock for one of the items, so it cannot be given.`);
    }
    const stockValue = parsePaise(String(stock[0].value).replace("-", "0"));
    const cost4 = (stockValue * 100000n + onHand / 2n) / onHand; // unit cost, 4 decimals
    const lineTotal = (cost4 * qtyMilli + 50000n) / 100000n;
    const unitCost = `${cost4 / 10000n}.${String(cost4 % 10000n).padStart(4, "0")}`;

    await conn.execute(
      `UPDATE acct_free_stock_lines SET unit_cost = ?, total_cost = ? WHERE id = ? AND legal_business_id = ?`,
      [unitCost, money(lineTotal), line.id, entry.businessId]
    );
    await conn.execute(
      `INSERT INTO acct_stock_movements
         (legal_business_id, division_id, location_id, variant_id, movement_date,
          movement_type, source_type, source_id, source_line_id,
          quantity_change, unit_cost, total_cost, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, 'ADJUSTMENT_OUT', 'FREE_STOCK', ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.businessId, entry.divisionId, entry.locationId, line.variant_id, entry.date,
        entry.id, line.id, `-${qtyText(qtyMilli)}`, unitCost, money(lineTotal),
        `Free stock ${entry.entryNo}`, userId,
      ]
    );
    total += lineTotal;
  }
  await conn.execute(
    `UPDATE acct_free_stock SET total_cost = ? WHERE id = ? AND legal_business_id = ?`,
    [money(total), entry.id, entry.businessId]
  );
  return total;
}

// --------------------------------------------------------------- request

export async function giveStockFreeAction(formData: FormData) {
  const user = await requireAccess("free_stock");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const locationId = Number(text("location_id"));
  const date = text("given_date");
  const reason = text("reason").slice(0, 300);
  const customerId = Number(text("customer_id")) || null;
  let givenTo = text("given_to").slice(0, 150);

  const back = `${PAGE}?location=${Number.isInteger(locationId) ? locationId : ""}`;
  if (!Number.isInteger(locationId) || locationId <= 0) go(PAGE, "error", "Choose where the stock is.");
  if (!validDate(date) || date > todayIso()) go(back, "error", "Enter a valid date, not in the future.");
  if (reason.length < 3) go(back, "error", "Write a short reason, for example: gift to a customer.");

  const approver = canApproveFreeStock(user.role);
  let newId = 0;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const [locs] = await conn.execute<Row[]>(
        `SELECT id, division_id, branch_id FROM acct_inventory_locations
         WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE' FOR UPDATE`,
        [locationId, businessId]
      );
      const loc = locs[0];
      if (!loc) throw new UserError("That place is not available.");

      if (customerId !== null) {
        const [cust] = await conn.execute<Row[]>(
          `SELECT full_name FROM acct_customers WHERE id = ? AND legal_business_id = ?`,
          [customerId, businessId]
        );
        if (!cust[0]) throw new UserError("That customer was not found.");
        if (givenTo === "") givenTo = String(cust[0].full_name).slice(0, 150);
      }
      if (givenTo === "") throw new UserError("Write who the stock is going to.");

      const [variants] = await conn.execute<Row[]>(
        `SELECT id FROM acct_product_variants
         WHERE legal_business_id = ? AND division_id = ? AND status = 'ACTIVE'`,
        [businessId, loc.division_id]
      );
      const allowed = new Set(variants.map((v) => Number(v.id)));

      const wanted: { variantId: number; qtyMilli: bigint }[] = [];
      for (const [key, value] of formData.entries()) {
        const match = /^qty_(\d+)$/.exec(key);
        if (!match) continue;
        const raw = String(value).trim();
        if (raw === "" || Number(raw) === 0) continue;
        const variantId = Number(match[1]);
        if (!allowed.has(variantId)) throw new UserError("One of the items does not belong to this place's division.");
        const qtyMilli = parseQtyMilli(raw);
        if (qtyMilli <= 0n) throw new UserError("Quantities must be above zero.");
        wanted.push({ variantId, qtyMilli });
      }
      if (wanted.length === 0) throw new UserError("Enter a quantity for at least one item.");

      // Tell the person straight away if the stock is not there (approval checks again).
      for (const w of wanted) {
        const [stock] = await conn.execute<Row[]>(
          `SELECT COALESCE(SUM(quantity_change), 0) AS qty FROM acct_stock_movements
           WHERE legal_business_id = ? AND division_id = ? AND location_id = ? AND variant_id = ?`,
          [businessId, loc.division_id, locationId, w.variantId]
        );
        const text = String(stock[0].qty);
        const onHand = text.startsWith("-") ? 0n : parseQtyMilli(text);
        if (w.qtyMilli > onHand) {
          throw new UserError(`Only ${qtyText(onHand)} is in stock for one of the items, so ${qtyText(w.qtyMilli)} cannot be given.`);
        }
      }

      const entryNo = await nextCode(conn, {
        table: "acct_free_stock", column: "entry_no", prefix: "FS-", width: 4,
        where: "legal_business_id = ?", params: [businessId],
      });
      const [header] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_free_stock
           (legal_business_id, division_id, branch_id, location_id, entry_no, given_date,
            given_to, customer_id, reason, status, requested_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, loc.division_id, loc.branch_id, locationId, entryNo, date,
          givenTo, customerId, reason, approver ? "APPROVED" : "WAITING", user.id,
        ]
      );
      const id = header.insertId;
      for (const w of wanted) {
        await conn.execute(
          `INSERT INTO acct_free_stock_lines (legal_business_id, free_stock_id, variant_id, quantity)
           VALUES (?, ?, ?, ?)`,
          [businessId, id, w.variantId, qtyText(w.qtyMilli)]
        );
      }

      if (approver) {
        const cost = await issueStock(
          conn,
          { id, entryNo, businessId, divisionId: Number(loc.division_id), locationId, date },
          user.id
        );
        await conn.execute(
          `UPDATE acct_free_stock SET approved_by = ?, approved_at = NOW() WHERE id = ? AND legal_business_id = ?`,
          [user.id, id, businessId]
        );
        message = `${entryNo} saved. Stock given free, cost ₹${money(cost)} booked as a business expense.`;
      } else {
        message = `${entryNo} sent for approval. Stock changes only after the owner or accountant approves.`;
      }

      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, ?, 'FREE_STOCK', ?, ?)`,
        [businessId, user.id, approver ? "FREE_STOCK_GIVEN" : "FREE_STOCK_REQUESTED", id, JSON.stringify({ entryNo, givenTo, reason })]
      );
      await conn.commit();
      newId = id;
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not save. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  go(newId === 0 ? back : PAGE, newId === 0 ? "error" : "saved", message);
}

// --------------------------------------------------------------- approve

export async function approveFreeStockAction(formData: FormData) {
  const user = await requireAccess("free_stock");
  if (!canApproveFreeStock(user.role)) go(PAGE, "error", "Only the owner or accountant can approve.");
  const businessId = user.legal_business_id;
  const entryId = Number(formData.get("entry_id"));
  if (!Number.isInteger(entryId) || entryId <= 0) go(PAGE, "error", "Choose an entry.");

  let ok = false;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.execute<Row[]>(
        `SELECT id, entry_no, division_id, location_id, status,
                DATE_FORMAT(given_date, '%Y-%m-%d') AS d
         FROM acct_free_stock WHERE id = ? AND legal_business_id = ? FOR UPDATE`,
        [entryId, businessId]
      );
      const entry = rows[0];
      if (!entry || entry.status !== "WAITING") throw new UserError("That entry is not waiting for approval.");

      const cost = await issueStock(
        conn,
        {
          id: entryId, entryNo: String(entry.entry_no), businessId,
          divisionId: Number(entry.division_id), locationId: Number(entry.location_id), date: String(entry.d),
        },
        user.id
      );
      await conn.execute(
        `UPDATE acct_free_stock SET status = 'APPROVED', approved_by = ?, approved_at = NOW()
         WHERE id = ? AND legal_business_id = ?`,
        [user.id, entryId, businessId]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'FREE_STOCK_APPROVED', 'FREE_STOCK', ?, ?)`,
        [businessId, user.id, entryId, JSON.stringify({ cost: money(cost) })]
      );
      await conn.commit();
      ok = true;
      message = `${entry.entry_no} approved. Cost ₹${money(cost)} booked as a business expense.`;
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not approve. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  go(PAGE, ok ? "saved" : "error", message);
}

// ---------------------------------------------------------------- reject

export async function rejectFreeStockAction(formData: FormData) {
  const user = await requireAccess("free_stock");
  if (!canApproveFreeStock(user.role)) go(PAGE, "error", "Only the owner or accountant can reject.");
  const businessId = user.legal_business_id;
  const entryId = Number(formData.get("entry_id"));
  const why = String(formData.get("reject_reason") ?? "").trim().slice(0, 300);
  if (!Number.isInteger(entryId) || entryId <= 0) go(PAGE, "error", "Choose an entry.");

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE acct_free_stock SET status = 'REJECTED', approved_by = ?, approved_at = NOW(), reject_reason = ?
     WHERE id = ? AND legal_business_id = ? AND status = 'WAITING'`,
    [user.id, why || null, entryId, businessId]
  );
  if (result.affectedRows !== 1) go(PAGE, "error", "That entry is not waiting for approval.");
  await db.execute(
    `INSERT INTO acct_audit_events
       (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'FREE_STOCK_REJECTED', 'FREE_STOCK', ?, ?)`,
    [businessId, user.id, entryId, JSON.stringify({ reason: why })]
  );
  revalidatePath(PAGE);
  go(PAGE, "saved", "Request turned down. Stock was not changed.");
}
