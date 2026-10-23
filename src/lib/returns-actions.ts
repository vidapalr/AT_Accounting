"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { applyStockDamage, UserError } from "@/lib/stock-damage";
import {
  parsePaise,
  parseQtyMilli,
  returnLineValues,
} from "@/lib/returns-math";

const PAGE = "/accounting/returns";

type Row = RowDataPacket & Record<string, string | number | null>;

const money = (paise: bigint) =>
  `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;

const qtyText = (milli: bigint) =>
  `${milli / 1000n}.${String(milli % 1000n).padStart(3, "0")}`;

const validDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function fail(message: string): never {
  redirect(`${PAGE}?error=${encodeURIComponent(message.slice(0, 200))}`);
}


/** Resolve "bank:3" / "cash:1" into the account ids, checking they are usable. */
async function refundAccount(
  conn: PoolConnection,
  businessId: number,
  value: string
): Promise<{ bankId: number | null; cashId: number | null }> {
  const [kind, idText] = value.split(":");
  const id = Number(idText);
  if (!Number.isInteger(id) || id <= 0) throw new UserError("Choose the account the refund was paid from.");

  if (kind === "bank") {
    const [rows] = await conn.execute<Row[]>(
      `SELECT id FROM acct_bank_accounts
       WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
      [id, businessId]
    );
    if (rows.length !== 1) throw new UserError("That bank account is not available.");
    return { bankId: id, cashId: null };
  }
  if (kind === "cash") {
    const [rows] = await conn.execute<Row[]>(
      `SELECT id FROM acct_cash_accounts
       WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
      [id, businessId]
    );
    if (rows.length !== 1) throw new UserError("That cash account is not available.");
    return { bankId: null, cashId: id };
  }
  throw new UserError("Choose the account the refund was paid from.");
}

async function insertRefund(
  conn: PoolConnection,
  input: {
    businessId: number;
    divisionId: number;
    returnId: number;
    date: string;
    amountPaise: bigint;
    method: string;
    account: string;
    userId: number;
  }
) {
  const { bankId, cashId } = await refundAccount(conn, input.businessId, input.account);
  const method = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"].includes(input.method)
    ? input.method
    : cashId ? "CASH" : "BANK_TRANSFER";

  await conn.execute(
    `INSERT INTO acct_sales_refunds
       (legal_business_id, division_id, return_id, refund_date, amount,
        payment_method, bank_account_id, cash_account_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.businessId, input.divisionId, input.returnId, input.date,
      money(input.amountPaise), method, bankId, cashId, input.userId,
    ]
  );
}

// ---------------------------------------------------------------- return

export async function createSalesReturnAction(formData: FormData) {
  const user = await requireAccess("returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const saleId = Number(text("sale_id"));
  const date = text("return_date");
  const reason = text("reason");
  const remarks = text("remarks").slice(0, 500);
  const refundNow = text("refund_now") === "FULL";
  const refundAccountValue = text("refund_account");
  const refundMethod = text("refund_method");

  if (!Number.isInteger(saleId) || saleId <= 0) fail("Choose an invoice first.");
  if (!validDate(date)) fail("Enter a valid return date.");
  if (!["DEFECTIVE", "WRONG_SIZE", "CUSTOMER_CHANGED_MIND", "OTHER"].includes(reason)) {
    fail("Choose a reason.");
  }

  let successId = 0;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const [sales] = await conn.execute<Row[]>(
        `SELECT id, division_id, branch_id, location_id, invoice_no, status,
                DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
                grand_total
         FROM acct_sales_headers
         WHERE id = ? AND legal_business_id = ? FOR UPDATE`,
        [saleId, businessId]
      );
      const sale = sales[0];
      if (!sale || sale.status !== "POSTED") throw new UserError("That invoice is not available for returns.");
      if (date < String(sale.invoice_date)) throw new UserError("A return cannot be dated before the invoice.");
      if (date > new Date().toISOString().slice(0, 10)) throw new UserError("A return cannot be dated in the future.");

      const [lines] = await conn.execute<Row[]>(
        `SELECT l.id, l.variant_id, l.quantity, l.unit_price, l.line_total,
                l.unit_cost, l.total_cost,
                COALESCE((
                  SELECT SUM(rl.quantity) FROM acct_sales_return_lines rl
                  JOIN acct_sales_returns r ON r.id = rl.return_id
                  WHERE rl.sale_line_id = l.id AND r.status = 'POSTED'
                    AND rl.legal_business_id = l.legal_business_id
                ), 0) AS returned
         FROM acct_sales_lines l
         WHERE l.sale_id = ? AND l.legal_business_id = ?
         ORDER BY l.id`,
        [saleId, businessId]
      );
      const sumLineTotals = lines.reduce((s, l) => s + parsePaise(String(l.line_total)), 0n);
      const grandTotal = parsePaise(String(sale.grand_total));

      type Prepared = {
        lineId: number; variantId: number; qtyMilli: bigint;
        gross: bigint; refund: bigint; cost: bigint; condition: string; unitCost: string;
      };
      const prepared: Prepared[] = [];

      for (const line of lines) {
        const raw = text(`qty_${line.id}`);
        if (raw === "" || Number(raw) === 0) continue;
        const qtyMilli = parseQtyMilli(raw);
        const condition = text(`condition_${line.id}`);
        if (condition !== "RESELLABLE" && condition !== "DAMAGED") {
          throw new UserError("Say whether each returned piece is resellable or damaged.");
        }
        if (line.unit_cost === null || line.total_cost === null) {
          throw new UserError("A line on this invoice has no recorded cost, so it cannot be returned here.");
        }
        const values = returnLineValues(
          {
            soldMilli: parseQtyMilli(String(line.quantity)),
            unitPricePaise: parsePaise(String(line.unit_price)),
            lineTotalPaise: parsePaise(String(line.line_total)),
            sumLineTotalsPaise: sumLineTotals,
            grandTotalPaise: grandTotal,
            totalCostPaise: parsePaise(String(line.total_cost)),
          },
          parseQtyMilli(String(line.returned)),
          qtyMilli
        );
        prepared.push({
          lineId: Number(line.id), variantId: Number(line.variant_id), qtyMilli,
          ...values, condition, unitCost: String(line.unit_cost),
        });
      }
      if (prepared.length === 0) throw new UserError("Enter a quantity for at least one line.");

      const grossTotal = prepared.reduce((s, p) => s + p.gross, 0n);
      const refundTotal = prepared.reduce((s, p) => s + p.refund, 0n);

      // Number the return from the invoice number: AB_AT_AT_SA_05 -> AB_AT_AT_RT_nn
      const prefix = String(sale.invoice_no).replace(/_SA_\d+$/, "_RT");
      await conn.execute(
        `INSERT INTO acct_document_sequences (legal_business_id, document_type, code_prefix, last_number)
         VALUES (?, 'SALE_RETURN', ?, 0)
         ON DUPLICATE KEY UPDATE id = id`,
        [businessId, prefix]
      );
      const [seq] = await conn.execute<Row[]>(
        `SELECT id, last_number FROM acct_document_sequences
         WHERE legal_business_id = ? AND document_type = 'SALE_RETURN' AND code_prefix = ? FOR UPDATE`,
        [businessId, prefix]
      );
      const next = BigInt(String(seq[0].last_number)) + 1n;
      await conn.execute(`UPDATE acct_document_sequences SET last_number = ? WHERE id = ?`, [next.toString(), seq[0].id]);
      const returnNo = `${prefix}_${next.toString().padStart(2, "0")}`;

      const [header] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_sales_returns
           (legal_business_id, division_id, branch_id, location_id, sale_id, return_no,
            return_date, reason, remarks, gross_value, refund_value, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          businessId, sale.division_id, sale.branch_id, sale.location_id, saleId, returnNo,
          date, reason, remarks || null, money(grossTotal), money(refundTotal), user.id,
        ]
      );
      const returnId = header.insertId;

      for (const p of prepared) {
        await conn.execute(
          `INSERT INTO acct_sales_return_lines
             (legal_business_id, return_id, sale_line_id, variant_id, quantity,
              gross_value, refund_value, unit_cost, total_cost, item_condition)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            businessId, returnId, p.lineId, p.variantId, qtyText(p.qtyMilli),
            money(p.gross), money(p.refund), p.unitCost, money(p.cost), p.condition,
          ]
        );
        if (p.condition === "RESELLABLE") {
          await conn.execute(
            `INSERT INTO acct_stock_movements
               (legal_business_id, division_id, location_id, variant_id, movement_date,
                movement_type, source_type, source_id, source_line_id,
                quantity_change, unit_cost, total_cost, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, 'SALES_RETURN', 'SALES_RETURN', ?, ?, ?, ?, ?, ?, ?)`,
            [
              businessId, sale.division_id, sale.location_id, p.variantId, date,
              returnId, p.lineId, qtyText(p.qtyMilli), p.unitCost, money(p.cost),
              `Return ${returnNo} of invoice ${sale.invoice_no}`, user.id,
            ]
          );
        }
      }

      if (refundNow && refundTotal > 0n) {
        await insertRefund(conn, {
          businessId, divisionId: Number(sale.division_id), returnId, date,
          amountPaise: refundTotal, method: refundMethod, account: refundAccountValue,
          userId: user.id,
        });
      }

      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SALES_RETURN_CREATED', 'SALES_RETURN', ?, ?)`,
        [businessId, user.id, returnId, JSON.stringify({ returnNo, invoiceNo: sale.invoice_no, refund: money(refundTotal) })]
      );

      await conn.commit();
      successId = returnId;
      message = `Return ${returnNo} recorded. Customer is owed ₹${money(refundTotal)}.`;
    } catch (error) {
      await conn.rollback();
      message = error instanceof UserError || (error instanceof Error && /Cannot return|Invalid|must be above/.test(error.message))
        ? (error as Error).message
        : "Could not save the return. Nothing was changed.";
      successId = 0;
    }
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  if (successId === 0) fail(message);
  redirect(`${PAGE}?saved=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------- refund

export async function recordRefundAction(formData: FormData) {
  const user = await requireAccess("returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const returnId = Number(text("return_id"));
  const date = text("refund_date");
  if (!Number.isInteger(returnId) || returnId <= 0) fail("Choose a return.");
  if (!validDate(date)) fail("Enter a valid refund date.");

  let ok = false;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const amount = parsePaise(text("amount"));
      if (amount <= 0n) throw new UserError("Enter the refund amount.");

      const [rows] = await conn.execute<Row[]>(
        `SELECT r.id, r.division_id, r.refund_value, r.return_no,
                DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date,
                COALESCE((SELECT SUM(f.amount) FROM acct_sales_refunds f
                          WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0) AS refunded
         FROM acct_sales_returns r
         WHERE r.id = ? AND r.legal_business_id = ? AND r.status = 'POSTED' FOR UPDATE`,
        [returnId, businessId]
      );
      const ret = rows[0];
      if (!ret) throw new UserError("That return was not found.");
      if (date < String(ret.return_date)) throw new UserError("A refund cannot be dated before the return.");
      if (date > new Date().toISOString().slice(0, 10)) throw new UserError("A refund cannot be dated in the future.");

      const outstanding = parsePaise(String(ret.refund_value)) - parsePaise(String(ret.refunded));
      if (amount > outstanding) {
        throw new UserError(`Only ₹${money(outstanding)} is still owed to the customer for this return.`);
      }

      await insertRefund(conn, {
        businessId, divisionId: Number(ret.division_id), returnId, date,
        amountPaise: amount, method: text("method"), account: text("account"), userId: user.id,
      });
      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SALES_REFUND_RECORDED', 'SALES_RETURN', ?, ?)`,
        [businessId, user.id, returnId, JSON.stringify({ amount: money(amount) })]
      );
      await conn.commit();
      ok = true;
      message = `Refund of ₹${money(amount)} recorded.`;
    } catch (error) {
      await conn.rollback();
      message = error instanceof UserError || (error instanceof Error && /Invalid/.test(error.message))
        ? (error as Error).message
        : "Could not save the refund. Nothing was changed.";
    }
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  if (!ok) fail(message);
  redirect(`${PAGE}?saved=${encodeURIComponent(message)}`);
}

// ---------------------------------------------------------------- damage

export async function recordStockDamageAction(formData: FormData) {
  const user = await requireAccess("returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const locationId = Number(text("location_id"));
  const variantId = Number(text("variant_id"));
  const date = text("damage_date");
  const reason = text("reason");
  const remarks = text("remarks").slice(0, 500);

  if (!Number.isInteger(locationId) || locationId <= 0) fail("Choose a location.");
  if (!Number.isInteger(variantId) || variantId <= 0) fail("Choose a product.");
  if (!validDate(date) || date > new Date().toISOString().slice(0, 10)) fail("Enter a valid date, not in the future.");
  if (!["DAMAGED", "LOST", "OTHER"].includes(reason)) fail("Choose a reason.");

  let ok = false;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      const qtyMilli = parseQtyMilli(text("quantity"));
      if (qtyMilli <= 0n) throw new UserError("Enter the quantity.");

      const done = await applyStockDamage(conn, {
        businessId, userId: user.id, locationId, variantId, date,
        reason: reason as "DAMAGED" | "LOST" | "OTHER", remarks, qtyMilli,
      });
      await conn.commit();
      ok = true;
      message = `Recorded ${qtyText(done.qtyMilli)} ${reason.toLowerCase()}, cost ₹${money(done.totalCost)}.`;
    } catch (error) {
      await conn.rollback();
      message = error instanceof UserError || (error instanceof Error && /Invalid/.test(error.message))
        ? (error as Error).message
        : "Could not save. Nothing was changed.";
    }
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  if (!ok) fail(message);
  redirect(`${PAGE}?saved=${encodeURIComponent(message)}`);
}
