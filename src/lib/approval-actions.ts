"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { findOrCreateCustomer } from "@/lib/customers";
import { normalizePhone } from "@/lib/customer-phone";
import { ensureHoldingLocation, moveItemStock, qtyText } from "@/lib/approval-stock";
import { applyStockDamage, UserError } from "@/lib/stock-damage";
import { parsePaise, parseQtyMilli } from "@/lib/returns-math";

const PAGE = "/accounting/approval-items";

type Row = RowDataPacket & Record<string, string | number | null>;

const money = (paise: bigint) =>
  `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const todayIso = () => new Date().toISOString().slice(0, 10);

function go(path: string, kind: "saved" | "error", message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

function friendly(error: unknown, fallback: string): string {
  if (error instanceof UserError) return error.message;
  console.error("Items on approval failed:", error);
  if (error instanceof Error && /Invalid/.test(error.message)) return error.message;
  return fallback;
}

/** Same lock the sales screen takes, so a bill and a hand-out cannot sell the same item twice. */
async function lockBusiness(conn: PoolConnection, businessId: number) {
  await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
}

// -------------------------------------------------------------- hand out

export async function handOutItemsAction(formData: FormData) {
  const user = await requireAccess("approval_items");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const locationId = Number(text("location_id"));
  const handed = text("handed_date");
  const expectedBack = text("expected_back");
  const remarks = text("remarks").slice(0, 300);
  const name = text("customer_name").slice(0, 150);
  const phone10 = normalizePhone(text("customer_phone"));

  const back = `${PAGE}?location=${Number.isInteger(locationId) ? locationId : ""}`;
  if (!Number.isInteger(locationId) || locationId <= 0) go(PAGE, "error", "Choose where the items are.");
  if (phone10 === null) go(back, "error", "Enter the customer's 10 digit mobile number.");
  if (!validDate(handed) || handed > todayIso()) go(back, "error", "Enter a valid date, not in the future.");
  if (!validDate(expectedBack) || expectedBack < handed) go(back, "error", "Choose the day the items should come back.");

  let newId = 0;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await lockBusiness(conn, businessId);
      const [locs] = await conn.execute<Row[]>(
        `SELECT id, division_id, branch_id FROM acct_inventory_locations
         WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE' AND location_type <> 'OTHER' FOR UPDATE`,
        [locationId, businessId]
      );
      const loc = locs[0];
      if (!loc) throw new UserError("That place is not available.");
      const divisionId = Number(loc.division_id);

      const [variants] = await conn.execute<Row[]>(
        `SELECT id FROM acct_product_variants
         WHERE legal_business_id = ? AND division_id = ? AND status = 'ACTIVE'`,
        [businessId, divisionId]
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

      // Cost each item at the average cost on the shelf, the same way sales and damage do.
      const costed: { variantId: number; qtyMilli: bigint; unitCost: string; totalCost: bigint }[] = [];
      for (const w of wanted) {
        const [stock] = await conn.execute<Row[]>(
          `SELECT COALESCE(SUM(quantity_change), 0) AS qty,
                  COALESCE(SUM(CASE WHEN quantity_change > 0 THEN total_cost ELSE -total_cost END), 0) AS value
           FROM acct_stock_movements
           WHERE legal_business_id = ? AND division_id = ? AND location_id = ? AND variant_id = ?`,
          [businessId, divisionId, locationId, w.variantId]
        );
        const qtyStr = String(stock[0].qty);
        const onHand = qtyStr.startsWith("-") ? 0n : parseQtyMilli(qtyStr);
        if (onHand === 0n || w.qtyMilli > onHand) {
          throw new UserError(`Only ${qtyText(onHand)} is in stock for one of the items, so ${qtyText(w.qtyMilli)} cannot be given.`);
        }
        const stockValue = parsePaise(String(stock[0].value).replace("-", "0"));
        const cost4 = (stockValue * 100000n + onHand / 2n) / onHand; // 4 decimals
        costed.push({
          variantId: w.variantId,
          qtyMilli: w.qtyMilli,
          unitCost: `${cost4 / 10000n}.${String(cost4 % 10000n).padStart(4, "0")}`,
          totalCost: (cost4 * w.qtyMilli + 50000n) / 100000n,
        });
      }

      const customer = await findOrCreateCustomer(conn, {
        businessId, userId: user.id, name, phone10: phone10 as string,
      });
      const holdingId = await ensureHoldingLocation(conn, businessId, divisionId, user.id);

      const handoutNo = await nextCode(conn, {
        table: "acct_approval_handouts", column: "handout_no", prefix: "AP-", width: 4,
        where: "legal_business_id = ?", params: [businessId],
      });
      const [header] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_approval_handouts
           (legal_business_id, division_id, branch_id, from_location_id, holding_location_id,
            handout_no, customer_id, handed_date, expected_back, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, divisionId, loc.branch_id, locationId, holdingId,
          handoutNo, customer.id, handed, expectedBack, remarks || null, user.id,
        ]
      );
      const handoutId = header.insertId;

      for (const c of costed) {
        const [item] = await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_approval_items
             (legal_business_id, handout_id, customer_id, variant_id, quantity, unit_cost, total_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [businessId, handoutId, customer.id, c.variantId, qtyText(c.qtyMilli), c.unitCost, money(c.totalCost)]
        );
        await moveItemStock(conn, {
          businessId, divisionId, fromLocationId: locationId, toLocationId: holdingId,
          variantId: c.variantId, date: handed, quantity: qtyText(c.qtyMilli),
          unitCost: c.unitCost, totalCost: money(c.totalCost),
          handoutId, itemId: item.insertId, userId: user.id,
          remarks: `On approval ${handoutNo}`,
          sourceType: "APPROVAL_OUT",
        });
      }

      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'APPROVAL_HANDED_OUT', 'APPROVAL', ?, ?)`,
        [businessId, user.id, handoutId, JSON.stringify({ handoutNo, customerId: customer.id, expectedBack })]
      );
      await conn.commit();
      newId = handoutId;
      message = `${handoutNo} saved. ${customer.full_name} has the items until ${expectedBack}.`;
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not save. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/stock");
  go(newId === 0 ? back : PAGE, newId === 0 ? "error" : "saved", message);
}

// ------------------------------------------------------- items come back

/**
 * An item (or part of it) is back from the customer: in good condition it
 * goes back on the shelf, damaged it is written off as damaged stock.
 */
export async function receiveBackAction(formData: FormData) {
  const user = await requireAccess("approval_items");
  const businessId = user.legal_business_id;
  const itemId = Number(formData.get("item_id"));
  const outcome = String(formData.get("outcome") ?? "");
  const rawQty = String(formData.get("quantity") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  if (!Number.isInteger(itemId) || itemId <= 0) go(PAGE, "error", "Choose an item.");
  if (outcome !== "RETURNED" && outcome !== "DAMAGED") go(PAGE, "error", "Choose what happened to the item.");

  let ok = false;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await lockBusiness(conn, businessId);
      const [rows] = await conn.execute<Row[]>(
        `SELECT i.id, i.handout_id, i.customer_id, i.variant_id, i.quantity, i.unit_cost, i.total_cost,
                h.handout_no, h.division_id, h.from_location_id, h.holding_location_id
           FROM acct_approval_items i
           JOIN acct_approval_handouts h ON h.id = i.handout_id AND h.legal_business_id = i.legal_business_id
          WHERE i.id = ? AND i.legal_business_id = ? AND i.status = 'OUT' FOR UPDATE`,
        [itemId, businessId]
      );
      const item = rows[0];
      if (!item) throw new UserError("That item is no longer with the customer.");

      const total = parseQtyMilli(String(item.quantity));
      const qty = rawQty === "" ? total : parseQtyMilli(rawQty);
      if (qty <= 0n || qty > total) throw new UserError(`Enter a quantity between 0 and ${qtyText(total)}.`);

      // Part of the line: the rest stays out, the returned part becomes its own closed line.
      let closeId = itemId;
      let unitCost = String(item.unit_cost);
      let lineCost = String(item.total_cost);
      if (qty < total) {
        const cost4 = BigInt(unitCost.replace(".", "")); // unit cost with 4 decimals
        const partCost = (cost4 * qty + 50000n) / 100000n;
        const restCost = parsePaise(lineCost) - partCost;
        lineCost = money(partCost);
        await conn.execute(
          `UPDATE acct_approval_items SET quantity = ?, total_cost = ? WHERE id = ? AND legal_business_id = ?`,
          [qtyText(total - qty), money(restCost), itemId, businessId]
        );
        const [part] = await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_approval_items
             (legal_business_id, handout_id, customer_id, variant_id, quantity, unit_cost, total_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [businessId, item.handout_id, item.customer_id, item.variant_id, qtyText(qty), unitCost, lineCost]
        );
        closeId = part.insertId;
      }

      const today = todayIso();
      await moveItemStock(conn, {
        businessId,
        divisionId: Number(item.division_id),
        fromLocationId: Number(item.holding_location_id),
        toLocationId: Number(item.from_location_id),
        variantId: Number(item.variant_id),
        date: today,
        quantity: qtyText(qty),
        unitCost,
        totalCost: lineCost,
        handoutId: Number(item.handout_id),
        itemId: closeId,
        userId: user.id,
        remarks: `Back from customer ${item.handout_no}`,
        sourceType: "APPROVAL_BACK",
      });

      if (outcome === "DAMAGED") {
        await applyStockDamage(conn, {
          businessId,
          userId: user.id,
          locationId: Number(item.from_location_id),
          variantId: Number(item.variant_id),
          date: today,
          reason: "DAMAGED",
          remarks: `Came back damaged from customer (${item.handout_no})`,
          qtyMilli: qty,
        });
      }

      await conn.execute(
        `UPDATE acct_approval_items SET status = ?, closed_date = ?, closed_by = ?, note = ?
          WHERE id = ? AND legal_business_id = ?`,
        [outcome, today, user.id, note || null, closeId, businessId]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, ?, 'APPROVAL', ?, ?)`,
        [
          businessId, user.id,
          outcome === "DAMAGED" ? "APPROVAL_RETURNED_DAMAGED" : "APPROVAL_RETURNED",
          item.handout_id, JSON.stringify({ itemId: closeId, quantity: qtyText(qty), note }),
        ]
      );
      await conn.commit();
      ok = true;
      message =
        outcome === "DAMAGED"
          ? "Recorded as damaged. It is taken out of stock as damaged stock."
          : "Back on the shelf.";
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not save. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/stock");
  go(PAGE, ok ? "saved" : "error", message);
}
