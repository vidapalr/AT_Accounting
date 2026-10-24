"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { UserError } from "@/lib/stock-damage";
import { parsePaise, parseQtyMilli } from "@/lib/returns-math";

const PAGE = "/accounting/supplier-returns";

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

/** Unit cost (4 decimals) x quantity (3 decimals) -> paise, rounded half up. */
function lineCost(qtyMilli: bigint, unitCost: string): { cost4: bigint; total: bigint } {
  const [whole, fraction = ""] = unitCost.split(".");
  const cost4 = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0").slice(0, 4));
  return { cost4, total: (qtyMilli * cost4 + 50000n) / 100000n };
}

async function accountIds(conn: PoolConnection, businessId: number, value: string) {
  const [kind, idText] = value.split(":");
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) throw new UserError("Choose the account the refund was paid into.");
  const table = kind === "bank" ? "acct_bank_accounts" : kind === "cash" ? "acct_cash_accounts" : null;
  if (!table) throw new UserError("Choose the account the refund was paid into.");
  const [rows] = await conn.execute<Row[]>(
    `SELECT id FROM ${table} WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
    [id, businessId]
  );
  if (rows.length !== 1) throw new UserError("That account is not available.");
  return { bankId: kind === "bank" ? id : null, cashId: kind === "cash" ? id : null };
}

// ---------------------------------------------------------------- return

export async function createSupplierReturnAction(formData: FormData) {
  const user = await requireAccess("supplier_returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const purchaseId = Number(text("purchase_id"));
  const locationId = Number(text("location_id"));
  const date = text("return_date");
  const reason = text("reason");
  const remarks = text("remarks").slice(0, 500);
  const supplierNote = text("supplier_note_no").slice(0, 100);
  const agreedText = text("agreed_value");

  const back = `${PAGE}?purchase=${Number.isInteger(purchaseId) ? purchaseId : ""}&location=${Number.isInteger(locationId) ? locationId : ""}`;
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) go(PAGE, "error", "Choose the purchase bill first.");
  if (!validDate(date)) go(back, "error", "Enter a valid return date.");
  if (date > todayIso()) go(back, "error", "A return cannot be dated in the future.");
  if (!["DAMAGED", "WRONG_ITEM", "EXTRA", "OTHER"].includes(reason)) go(back, "error", "Choose a reason.");

  let newId = 0;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const [headers] = await conn.execute<Row[]>(
        `SELECT h.id, h.division_id, h.supplier_id, h.receiving_location_id, h.purchase_no, h.status,
                DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%Y-%m-%d') AS bill_date
         FROM acct_purchase_headers h
         WHERE h.id = ? AND h.legal_business_id = ? FOR UPDATE`,
        [purchaseId, businessId]
      );
      const bill = headers[0];
      if (!bill || bill.status !== "POSTED") {
        throw new UserError("Only a purchase whose goods were received can have items returned.");
      }
      if (date < String(bill.bill_date)) throw new UserError("A return cannot be dated before the purchase.");

      // Goods are often moved to a shop after they arrive, so the person says where they are now.
      const sendFrom = Number.isInteger(locationId) && locationId > 0 ? locationId : Number(bill.receiving_location_id);
      const [places] = await conn.execute<Row[]>(
        `SELECT id FROM acct_inventory_locations
         WHERE id = ? AND legal_business_id = ? AND division_id = ? AND status = 'ACTIVE'`,
        [sendFrom, businessId, bill.division_id]
      );
      if (places.length !== 1) throw new UserError("Choose the place the goods are being sent back from.");

      const [lines] = await conn.execute<Row[]>(
        `SELECT l.id, l.variant_id, l.quantity, l.unit_cost,
                COALESCE((
                  SELECT SUM(rl.quantity) FROM acct_supplier_return_lines rl
                  JOIN acct_supplier_returns r ON r.id = rl.return_id
                  WHERE rl.purchase_line_id = l.id AND r.status = 'POSTED'
                    AND rl.legal_business_id = l.legal_business_id
                ), 0) AS returned
         FROM acct_purchase_lines l
         WHERE l.purchase_id = ? AND l.legal_business_id = ?
         ORDER BY l.line_no`,
        [purchaseId, businessId]
      );

      type Prepared = { lineId: number; variantId: number; qtyMilli: bigint; cost4: bigint; total: bigint };
      const prepared: Prepared[] = [];
      for (const line of lines) {
        const raw = text(`qty_${line.id}`);
        if (raw === "" || Number(raw) === 0) continue;
        const qtyMilli = parseQtyMilli(raw);
        const left = parseQtyMilli(String(line.quantity)) - parseQtyMilli(String(line.returned));
        if (qtyMilli > left) {
          throw new UserError(`Only ${qtyText(left > 0n ? left : 0n)} of one item can still be returned.`);
        }

        // Stock must really be there to send back.
        const [stock] = await conn.execute<Row[]>(
          `SELECT COALESCE(SUM(quantity_change), 0) AS qty FROM acct_stock_movements
           WHERE legal_business_id = ? AND division_id = ? AND location_id = ? AND variant_id = ?`,
          [businessId, bill.division_id, sendFrom, line.variant_id]
        );
        const onHandText = String(stock[0].qty);
        const onHand = onHandText.startsWith("-") ? 0n : parseQtyMilli(onHandText);
        if (qtyMilli > onHand) {
          throw new UserError(`Only ${qtyText(onHand)} is in stock at that place, so that much cannot go back.`);
        }

        const { cost4, total } = lineCost(qtyMilli, String(line.unit_cost));
        prepared.push({ lineId: Number(line.id), variantId: Number(line.variant_id), qtyMilli, cost4, total });
      }
      if (prepared.length === 0) throw new UserError("Enter a quantity for at least one item.");

      const costValue = prepared.reduce((s, p) => s + p.total, 0n);
      const agreed = agreedText === "" ? costValue : parsePaise(agreedText);
      if (agreed > costValue) {
        throw new UserError(`The supplier cannot credit more than the goods cost (₹${money(costValue)}).`);
      }

      const returnNo = await nextCode(conn, {
        table: "acct_supplier_returns", column: "return_no", prefix: "DN-", width: 4,
        where: "legal_business_id = ?", params: [businessId],
      });

      const [header] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_supplier_returns
           (legal_business_id, division_id, supplier_id, purchase_id, location_id, return_no, return_date,
            reason, remarks, supplier_note_no, cost_value, agreed_value, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, bill.division_id, bill.supplier_id, purchaseId, sendFrom, returnNo, date,
          reason, remarks || null, supplierNote || null, money(costValue), money(agreed), user.id,
        ]
      );
      const returnId = header.insertId;

      for (const p of prepared) {
        const unitCost = `${p.cost4 / 10000n}.${String(p.cost4 % 10000n).padStart(4, "0")}`;
        await conn.execute(
          `INSERT INTO acct_supplier_return_lines
             (legal_business_id, return_id, purchase_line_id, variant_id, quantity, unit_cost, total_cost)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [businessId, returnId, p.lineId, p.variantId, qtyText(p.qtyMilli), unitCost, money(p.total)]
        );
        await conn.execute(
          `INSERT INTO acct_stock_movements
             (legal_business_id, division_id, location_id, variant_id, movement_date,
              movement_type, source_type, source_id, source_line_id,
              quantity_change, unit_cost, total_cost, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, 'PURCHASE_RETURN', 'SUPPLIER_RETURN', ?, ?, ?, ?, ?, ?, ?)`,
          [
            businessId, bill.division_id, sendFrom, p.variantId, date,
            returnId, p.lineId, `-${qtyText(p.qtyMilli)}`, unitCost, money(p.total),
            `Return ${returnNo} of ${bill.purchase_no} to supplier`, user.id,
          ]
        );
      }

      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SUPPLIER_RETURN_CREATED', 'SUPPLIER_RETURN', ?, ?)`,
        [businessId, user.id, returnId, JSON.stringify({ returnNo, purchase: bill.purchase_no, cost: money(costValue), agreed: money(agreed) })]
      );
      await conn.commit();
      newId = returnId;
      message = `Debit note ${returnNo} saved. Credit from the supplier: ₹${money(agreed)}.`;
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not save the return. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/purchase-management");
  if (newId === 0) go(back, "error", message);
  go(`${PAGE}/${newId}`, "saved", message);
}

// ---------------------------------------------------------------- refund

export async function recordSupplierRefundAction(formData: FormData) {
  const user = await requireAccess("supplier_returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const returnId = Number(text("return_id"));
  const date = text("refund_date");
  const back = `${PAGE}/${Number.isInteger(returnId) ? returnId : ""}`;
  if (!Number.isInteger(returnId) || returnId <= 0) go(PAGE, "error", "Choose a return.");
  if (!validDate(date) || date > todayIso()) go(back, "error", "Enter a valid refund date, not in the future.");

  let ok = false;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const amount = parsePaise(text("amount"));
      if (amount <= 0n) throw new UserError("Enter the amount the supplier paid back.");

      const [rows] = await conn.execute<Row[]>(
        `SELECT r.id, r.supplier_id, r.division_id, r.agreed_value, r.return_no,
                DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date,
                COALESCE((SELECT SUM(f.amount) FROM acct_supplier_refunds f
                          WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0) AS refunded
         FROM acct_supplier_returns r
         WHERE r.id = ? AND r.legal_business_id = ? AND r.status = 'POSTED' FOR UPDATE`,
        [returnId, businessId]
      );
      const ret = rows[0];
      if (!ret) throw new UserError("That return was not found.");
      if (date < String(ret.return_date)) throw new UserError("A refund cannot be dated before the return.");

      // The supplier can pay back only the credit he is actually holding for us.
      const left = parsePaise(String(ret.agreed_value)) - parsePaise(String(ret.refunded));
      if (amount > left) {
        throw new UserError(`Only ₹${money(left)} of this return can still be refunded.`);
      }
      const [credit] = await conn.execute<Row[]>(
        `SELECT
           (SELECT COALESCE(SUM(l.line_amount), 0) FROM acct_purchase_headers h
              JOIN acct_purchase_lines l ON l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id
             WHERE h.legal_business_id = ? AND h.supplier_id = ? AND h.status = 'POSTED') AS billed,
           (SELECT COALESCE(SUM(p.amount), 0) FROM acct_purchase_payments p
              JOIN acct_purchase_headers h ON h.legal_business_id = p.legal_business_id AND h.id = p.purchase_id
             WHERE p.legal_business_id = ? AND h.supplier_id = ? AND p.status = 'VERIFIED' AND h.status = 'POSTED') AS paid,
           (SELECT COALESCE(SUM(agreed_value), 0) FROM acct_supplier_returns
             WHERE legal_business_id = ? AND supplier_id = ? AND status = 'POSTED') AS returned,
           (SELECT COALESCE(SUM(amount), 0) FROM acct_supplier_refunds
             WHERE legal_business_id = ? AND supplier_id = ? AND status = 'RECORDED') AS refunded`,
        [businessId, ret.supplier_id, businessId, ret.supplier_id, businessId, ret.supplier_id, businessId, ret.supplier_id]
      );
      const c = credit[0];
      const owed =
        parsePaise(String(c.billed)) - parsePaise(String(c.paid)) -
        parsePaise(String(c.returned)) + parsePaise(String(c.refunded));
      const held = owed < 0n ? -owed : 0n;
      if (amount > held) {
        throw new UserError(
          held === 0n
            ? "You still owe this supplier money, so there is no credit to be paid back. Use the credit against what you owe him."
            : `The supplier is holding only ₹${money(held)} for you right now.`
        );
      }

      const { bankId, cashId } = await accountIds(conn, businessId, text("account"));
      const method = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"].includes(text("method"))
        ? text("method")
        : cashId ? "CASH" : "BANK_TRANSFER";

      await conn.execute(
        `INSERT INTO acct_supplier_refunds
           (legal_business_id, division_id, supplier_id, return_id, refund_date, amount,
            payment_method, bank_account_id, cash_account_id, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, ret.division_id, ret.supplier_id, returnId, date, money(amount),
          method, bankId, cashId, text("remarks").slice(0, 300) || null, user.id,
        ]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SUPPLIER_REFUND_RECORDED', 'SUPPLIER_RETURN', ?, ?)`,
        [businessId, user.id, returnId, JSON.stringify({ amount: money(amount) })]
      );
      await conn.commit();
      ok = true;
      message = `Refund of ₹${money(amount)} recorded.`;
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not save the refund. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/supplier-statement");
  revalidatePath("/accounting/purchase-management");
  go(back, ok ? "saved" : "error", message);
}

// ----------------------------------------------------------- replacement

export async function linkReplacementAction(formData: FormData) {
  const user = await requireAccess("supplier_returns");
  const businessId = user.legal_business_id;
  const returnId = Number(formData.get("return_id"));
  const purchaseId = Number(formData.get("replacement_purchase_id"));
  const back = `${PAGE}/${Number.isInteger(returnId) ? returnId : ""}`;
  if (!Number.isInteger(returnId) || returnId <= 0) go(PAGE, "error", "Choose a return.");
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) go(back, "error", "Choose the purchase that holds the replacement items.");

  let message = "";
  let ok = false;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const [rows] = await conn.execute<Row[]>(
        `SELECT r.id, r.supplier_id, r.purchase_id,
                DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date
         FROM acct_supplier_returns r
         WHERE r.id = ? AND r.legal_business_id = ? AND r.status = 'POSTED' FOR UPDATE`,
        [returnId, businessId]
      );
      const ret = rows[0];
      if (!ret) throw new UserError("That return was not found.");
      const [bills] = await conn.execute<Row[]>(
        `SELECT id, supplier_id, status,
                DATE_FORMAT(COALESCE(received_date, invoice_date), '%Y-%m-%d') AS d
         FROM acct_purchase_headers WHERE id = ? AND legal_business_id = ?`,
        [purchaseId, businessId]
      );
      const bill = bills[0];
      if (!bill || bill.status !== "POSTED") throw new UserError("That purchase has not been received yet.");
      if (Number(bill.supplier_id) !== Number(ret.supplier_id)) throw new UserError("That purchase is from a different supplier.");
      if (Number(bill.id) === Number(ret.purchase_id)) throw new UserError("Choose a newer purchase, not the one the goods went back from.");
      if (String(bill.d) < String(ret.return_date)) throw new UserError("The replacement purchase is dated before the return.");

      await conn.execute(
        `INSERT IGNORE INTO acct_supplier_return_replacements
           (legal_business_id, return_id, purchase_id, created_by) VALUES (?, ?, ?, ?)`,
        [businessId, returnId, purchaseId, user.id]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SUPPLIER_REPLACEMENT_LINKED', 'SUPPLIER_RETURN', ?, ?)`,
        [businessId, user.id, returnId, JSON.stringify({ purchaseId })]
      );
      await conn.commit();
      ok = true;
      message = "Replacement purchase linked to this return.";
    } catch (error) {
      await conn.rollback();
      message = friendly(error, "Could not link the purchase. Nothing was changed.");
    }
  } finally {
    conn.release();
  }
  revalidatePath(back);
  go(back, ok ? "saved" : "error", message);
}
