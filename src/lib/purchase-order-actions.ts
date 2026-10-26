"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { getActiveDivisionId } from "@/lib/division-context";
import { parseOrderLines } from "@/lib/po-math";

const PAGE = "/accounting/purchase-orders";
const isRedirect = (e: unknown) =>
  typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT");
class Stop extends Error {}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

async function run(back: string, work: (conn: PoolConnection) => Promise<string>): Promise<never> {
  const conn = await db.getConnection();
  let target = `${back}?error=${encodeURIComponent("Something went wrong. Nothing was saved.")}`;
  try {
    await conn.beginTransaction();
    target = await work(conn);
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isRedirect(error)) throw error;
    if (error instanceof Stop) target = `${back}?error=${encodeURIComponent(error.message)}`;
    else console.error("Purchase order action failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  redirect(target);
}

/** Write a new order, or change an open one (the items are replaced by what is on the form). */
export async function savePurchaseOrderAction(form: FormData): Promise<void> {
  const user = await requireAccess("purchases");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const orderId = Number(text(form, "order_id")) || 0;
  const back = orderId ? `${PAGE}/${orderId}` : `${PAGE}/new`;

  const supplierId = Number(text(form, "supplier_id"));
  const locationId = Number(text(form, "location_id"));
  const orderDate = text(form, "order_date");
  const expected = text(form, "expected_date");
  const remarks = text(form, "remarks").slice(0, 500);
  const rows = Array.from({ length: 100 }, (_, i) => ({
    variant: text(form, `line_${i}_variant`), quantity: text(form, `line_${i}_quantity`), cost: text(form, `line_${i}_cost`),
  }));
  const lines = parseOrderLines(rows);

  if (!supplierId || !locationId) redirect(`${back}?error=${encodeURIComponent("Choose the supplier and the warehouse")}`);
  if (!validDate(orderDate) || (expected && !validDate(expected))) redirect(`${back}?error=${encodeURIComponent("Check the dates")}`);
  if (!lines) redirect(`${back}?error=${encodeURIComponent("Add at least one item with a quantity and a price. Each item can be used once")}`);

  await run(back, async (conn) => {
    const [sup] = await conn.execute<RowDataPacket[]>(`SELECT id FROM acct_suppliers WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [businessId, supplierId]);
    const [loc] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_inventory_locations WHERE legal_business_id = ? AND division_id = ? AND id = ? AND location_type = 'CENTRAL_WAREHOUSE' AND status = 'ACTIVE'`,
      [businessId, divisionId, locationId]
    );
    if (sup.length !== 1 || loc.length !== 1) throw new Stop("That supplier or warehouse is not available");
    const [vars] = await conn.execute<RowDataPacket[]>(
      `SELECT id, unit_of_measure FROM acct_product_variants WHERE legal_business_id = ? AND division_id = ? AND status = 'ACTIVE' AND id IN (${lines.map(() => "?").join(",")})`,
      [businessId, divisionId, ...lines.map((l) => l.variantId)]
    );
    const unit = new Map(vars.map((v) => [Number(v.id), String(v.unit_of_measure)]));
    for (const l of lines) {
      if (!unit.has(l.variantId)) throw new Stop("One of the items is not available");
      if (["PCS", "SET"].includes(unit.get(l.variantId)!) && !l.quantity.endsWith(".000")) throw new Stop("Pieces and sets must be whole numbers");
    }

    let id = orderId;
    if (orderId) {
      const [own] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_purchase_orders WHERE legal_business_id = ? AND division_id = ? AND id = ? AND status = 'OPEN' FOR UPDATE`,
        [businessId, divisionId, orderId]
      );
      if (own.length !== 1) throw new Stop("This order can no longer be changed");
      await conn.execute(
        `UPDATE acct_purchase_orders SET supplier_id = ?, location_id = ?, order_date = ?, expected_date = ?, remarks = ? WHERE id = ?`,
        [supplierId, locationId, orderDate, expected || null, remarks || null, orderId]
      );
      await conn.execute(`DELETE FROM acct_purchase_order_lines WHERE order_id = ?`, [orderId]);
    } else {
      const orderNo = await nextCode(conn, { table: "acct_purchase_orders", column: "order_no", prefix: "PO-", width: 4, where: "legal_business_id = ?", params: [businessId] });
      const [ins] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_purchase_orders (legal_business_id, division_id, order_no, supplier_id, location_id, order_date, expected_date, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, divisionId, orderNo, supplierId, locationId, orderDate, expected || null, remarks || null, user.id]
      );
      id = ins.insertId;
    }
    for (const [i, l] of lines.entries()) {
      await conn.execute(
        `INSERT INTO acct_purchase_order_lines (order_id, line_no, variant_id, quantity, unit_cost, line_amount) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, i + 1, l.variantId, l.quantity, l.unitCost, l.lineAmount]
      );
    }
    return `${PAGE}/${id}?saved=${orderId ? "changed" : "created"}`;
  });
}

export async function cancelPurchaseOrderAction(form: FormData): Promise<void> {
  const user = await requireAccess("purchases");
  const id = Number(text(form, "order_id"));
  const back = `${PAGE}/${id}`;
  await run(back, async (conn) => {
    const [r] = await conn.execute<ResultSetHeader>(
      `UPDATE acct_purchase_orders SET status = 'CANCELLED' WHERE legal_business_id = ? AND id = ? AND status = 'OPEN'`,
      [user.legal_business_id, id]
    );
    if (r.affectedRows !== 1) throw new Stop("This order is not open");
    return `${back}?saved=cancelled`;
  });
}

/** Goods arrived: make a purchase draft from the order (items and prices copied) and open it. */
export async function receivePurchaseOrderAction(form: FormData): Promise<void> {
  const user = await requireAccess("purchases");
  const businessId = user.legal_business_id;
  const id = Number(text(form, "order_id"));
  const back = `${PAGE}/${id}`;
  await run(back, async (conn) => {
    const [orders] = await conn.execute<RowDataPacket[]>(
      `SELECT * FROM acct_purchase_orders WHERE legal_business_id = ? AND id = ? AND status = 'OPEN' FOR UPDATE`,
      [businessId, id]
    );
    const o = orders[0];
    if (!o) throw new Stop("This order is not open");
    const [lines] = await conn.execute<RowDataPacket[]>(`SELECT * FROM acct_purchase_order_lines WHERE order_id = ? ORDER BY line_no`, [id]);
    const purchaseNo = "ATX-PUR-" + randomBytes(8).toString("hex").toUpperCase();
    const [h] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_purchase_headers (legal_business_id, division_id, purchase_no, supplier_id, invoice_date, receiving_location_id, status, remarks, created_by)
       VALUES (?, ?, ?, ?, CURDATE(), ?, 'DRAFT', ?, ?)`,
      [businessId, o.division_id, purchaseNo, o.supplier_id, o.location_id, `From purchase order ${o.order_no}`, user.id]
    );
    for (const l of lines) {
      await conn.execute(
        `INSERT INTO acct_purchase_lines (legal_business_id, division_id, purchase_id, line_no, variant_id, quantity, unit_cost, line_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, o.division_id, h.insertId, l.line_no, l.variant_id, l.quantity, l.unit_cost, l.line_amount]
      );
    }
    await conn.execute(`UPDATE acct_purchase_orders SET status = 'RECEIVED', purchase_id = ? WHERE id = ?`, [h.insertId, id]);
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'PURCHASE_ORDER_RECEIVED', 'PURCHASE_ORDER', ?, ?)`,
      [businessId, user.id, id, JSON.stringify({ orderNo: o.order_no, purchaseId: h.insertId, purchaseNo })]
    );
    revalidatePath("/accounting/purchases");
    return `/accounting/purchases?edit=${h.insertId}`;
  });
}
