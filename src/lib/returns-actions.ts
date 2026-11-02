"use server";

import { lockReturnCredit } from "@/lib/return-credit";
import { autoReverseForEdit } from "@/lib/ledger/reverse-in-tx";
import { canUseDivision, locationInScope } from "@/lib/scope";
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
  const isExchange = text("exchange") === "1";
  const refundNow = !isExchange && text("refund_now") === "FULL";
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
      if (!sale || sale.status !== "POSTED" || !canUseDivision(user, Number(sale.division_id))) throw new UserError("That invoice is not available for returns.");
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
  if (isExchange) redirect(`/accounting/sales?from_exchange=${successId}`);
  redirect(`${PAGE}?saved=${encodeURIComponent(message)}`);
}

/**
 * Edit a return that is already recorded (like QuickBooks): quantities, condition, date, reason and notes.
 * The old journal entry is reversed automatically, stock is corrected with new stock records (history stays),
 * and the return posts again with the new values. Refused when the new credit would be less than what the
 * customer already got back or used on a new bill, or when the pieces can no longer come off the shelf.
 */
export async function editSalesReturnAction(formData: FormData) {
  const user = await requireAccess("returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const returnId = Number(text("return_id"));
  const date = text("return_date");
  const reason = text("reason");
  const remarks = text("remarks").slice(0, 500);
  const here = `${PAGE}?edit=${Number.isInteger(returnId) ? returnId : ""}`;
  const stop = (message: string): never => redirect(`${here}&error=${encodeURIComponent(message.slice(0, 200))}`);

  if (!Number.isInteger(returnId) || returnId <= 0) fail("That return was not found.");
  if (!validDate(date)) stop("Enter a valid return date.");
  if (!["DEFECTIVE", "WRONG_SIZE", "CUSTOMER_CHANGED_MIND", "OTHER"].includes(reason)) stop("Choose a reason.");

  let message = "";
  let ok = false;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
      const credit = await lockReturnCredit(conn, businessId, returnId);
      if (!credit) throw new UserError("That return was not found.");

      const [rets] = await conn.execute<Row[]>(
        `SELECT r.id, r.return_no, r.sale_id, r.division_id, r.location_id, s.invoice_no, s.grand_total,
                DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS invoice_date
           FROM acct_sales_returns r JOIN acct_sales_headers s ON s.id = r.sale_id AND s.legal_business_id = r.legal_business_id
          WHERE r.id = ? AND r.legal_business_id = ? AND r.status = 'POSTED' FOR UPDATE`,
        [returnId, businessId]
      );
      const ret = rets[0];
      if (!ret || !canUseDivision(user, Number(ret.division_id))) throw new UserError("That return was not found.");
      if (date < String(ret.invoice_date)) throw new UserError("A return cannot be dated before the invoice.");
      if (date > new Date().toISOString().slice(0, 10)) throw new UserError("A return cannot be dated in the future.");

      const [oldLines] = await conn.execute<Row[]>(
        `SELECT id, sale_line_id, variant_id, quantity, unit_cost, total_cost, item_condition
           FROM acct_sales_return_lines WHERE return_id = ? AND legal_business_id = ? ORDER BY id FOR UPDATE`,
        [returnId, businessId]
      );
      const [lines] = await conn.execute<Row[]>(
        `SELECT l.id, l.variant_id, l.quantity, l.unit_price, l.line_total, l.unit_cost, l.total_cost,
                COALESCE((
                  SELECT SUM(rl.quantity) FROM acct_sales_return_lines rl
                  JOIN acct_sales_returns r2 ON r2.id = rl.return_id
                  WHERE rl.sale_line_id = l.id AND r2.status = 'POSTED' AND r2.id <> ?
                    AND rl.legal_business_id = l.legal_business_id
                ), 0) AS returned
           FROM acct_sales_lines l WHERE l.sale_id = ? AND l.legal_business_id = ? ORDER BY l.id`,
        [returnId, ret.sale_id, businessId]
      );
      const sumLineTotals = lines.reduce((sum, l) => sum + parsePaise(String(l.line_total)), 0n);
      const grandTotal = parsePaise(String(ret.grand_total));

      type Prepared = { lineId: number; variantId: number; qtyMilli: bigint; gross: bigint; refund: bigint; cost: bigint; condition: string; unitCost: string };
      const prepared: Prepared[] = [];
      for (const line of lines) {
        const raw = text(`qty_${line.id}`);
        if (raw === "" || Number(raw) === 0) continue;
        const qtyMilli = parseQtyMilli(raw);
        const condition = text(`condition_${line.id}`);
        if (condition !== "RESELLABLE" && condition !== "DAMAGED") throw new UserError("Say whether each returned piece is resellable or damaged.");
        if (line.unit_cost === null || line.total_cost === null) throw new UserError("A line on this invoice has no recorded cost, so it cannot be returned here.");
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
        prepared.push({ lineId: Number(line.id), variantId: Number(line.variant_id), qtyMilli, ...values, condition, unitCost: String(line.unit_cost) });
      }
      if (prepared.length === 0) throw new UserError("Enter a quantity for at least one line. To cancel the whole return, set it to a small correction instead; returns are never deleted.");

      const grossTotal = prepared.reduce((sum, p) => sum + p.gross, 0n);
      const refundTotal = prepared.reduce((sum, p) => sum + p.refund, 0n);
      const alreadyGiven = credit.refundedPaise + credit.exchangedPaise;
      if (refundTotal < alreadyGiven) {
        throw new UserError(`The customer already got ₹${money(alreadyGiven)} back or used it on a new bill, so the credit cannot go below that.`);
      }

      // Pieces that came back to the shelf must still be there to take off again.
      const oldBack = new Map<number, bigint>();
      for (const l of oldLines) {
        if (l.item_condition === "RESELLABLE") oldBack.set(Number(l.variant_id), (oldBack.get(Number(l.variant_id)) ?? 0n) + parseQtyMilli(String(l.quantity)));
      }
      const newBack = new Map<number, bigint>();
      for (const p of prepared) if (p.condition === "RESELLABLE") newBack.set(p.variantId, (newBack.get(p.variantId) ?? 0n) + p.qtyMilli);
      for (const variantId of new Set([...oldBack.keys(), ...newBack.keys()])) {
        const [onHand] = await conn.execute<Row[]>(
          `SELECT CAST(COALESCE(SUM(quantity_change), 0) AS CHAR) AS qty FROM acct_stock_movements
            WHERE legal_business_id = ? AND division_id = ? AND location_id = ? AND variant_id = ? FOR UPDATE`,
          [businessId, ret.division_id, ret.location_id, variantId]
        );
        const t = String(onHand[0].qty);
        const now = t.startsWith("-") ? -parseQtyMilli(t.slice(1)) : parseQtyMilli(t);
        if (now - (oldBack.get(variantId) ?? 0n) + (newBack.get(variantId) ?? 0n) < 0n) {
          throw new UserError("Some of the returned pieces are already sold again, so the quantity cannot go down that far.");
        }
      }

      const undone = await autoReverseForEdit(conn, {
        businessId, userId: user.id, sourceType: "SALES_RETURN", sourceId: returnId,
        reason: `Edited: return ${ret.return_no}`,
      });
      if (!undone.ok) {
        throw new UserError(undone.reason === "period-closed" ? "That month is already closed, so this return cannot be edited." : "Could not save the change. Nothing was changed.");
      }

      for (const l of oldLines) {
        if (l.item_condition !== "RESELLABLE") continue;
        await conn.execute(
          `INSERT INTO acct_stock_movements
             (legal_business_id, division_id, location_id, variant_id, movement_date, movement_type,
              source_type, source_id, source_line_id, quantity_change, unit_cost, total_cost, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, 'ADJUSTMENT_OUT', 'SALES_RETURN_EDIT', ?, ?, ?, ?, ?, ?, ?)`,
          [businessId, ret.division_id, ret.location_id, l.variant_id, date, returnId, l.id,
           "-" + String(l.quantity), l.unit_cost, l.total_cost, `Return ${ret.return_no} edited: old quantity taken out`, user.id]
        );
      }
      await conn.execute(
        `UPDATE acct_sales_returns SET return_date = ?, reason = ?, remarks = ?, gross_value = ?, refund_value = ?
          WHERE id = ? AND legal_business_id = ?`,
        [date, reason, remarks || null, money(grossTotal), money(refundTotal), returnId, businessId]
      );
      await conn.execute(`DELETE FROM acct_sales_return_lines WHERE return_id = ? AND legal_business_id = ?`, [returnId, businessId]);
      for (const p of prepared) {
        const [ins] = await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_sales_return_lines
             (legal_business_id, return_id, sale_line_id, variant_id, quantity, gross_value, refund_value, unit_cost, total_cost, item_condition)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [businessId, returnId, p.lineId, p.variantId, qtyText(p.qtyMilli), money(p.gross), money(p.refund), p.unitCost, money(p.cost), p.condition]
        );
        if (p.condition === "RESELLABLE") {
          await conn.execute(
            `INSERT INTO acct_stock_movements
               (legal_business_id, division_id, location_id, variant_id, movement_date, movement_type,
                source_type, source_id, source_line_id, quantity_change, unit_cost, total_cost, remarks, created_by)
             VALUES (?, ?, ?, ?, ?, 'SALES_RETURN', 'SALES_RETURN_EDIT', ?, ?, ?, ?, ?, ?, ?)`,
            [businessId, ret.division_id, ret.location_id, p.variantId, date, returnId, ins.insertId,
             qtyText(p.qtyMilli), p.unitCost, money(p.cost), `Return ${ret.return_no} edited: new quantity`, user.id]
          );
        }
      }
      await conn.execute(
        `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SALES_RETURN_EDITED', 'SALES_RETURN', ?, ?)`,
        [businessId, user.id, returnId, JSON.stringify({
          returnNo: ret.return_no, invoiceNo: ret.invoice_no, credit_before: money(credit.refundValuePaise), credit_after: money(refundTotal),
        })]
      );
      await conn.commit();
      ok = true;
      message = `Return ${ret.return_no} changed. Customer credit is now ₹${money(refundTotal)}.`;
    } catch (error) {
      await conn.rollback();
      message = error instanceof UserError || (error instanceof Error && /Cannot return|Invalid|must be above/.test(error.message))
        ? (error as Error).message
        : "Could not save the change. Nothing was changed.";
    }
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  revalidatePath("/accounting/stock");
  if (!ok) stop(message);
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

      // Locked and re-read, so a refund and an exchange bill at the same moment cannot both take the credit.
      const credit = await lockReturnCredit(conn, businessId, returnId);
      if (!credit || !canUseDivision(user, credit.divisionId)) throw new UserError("That return was not found.");
      const [rows] = await conn.execute<Row[]>(
        `SELECT id, DATE_FORMAT(return_date, '%Y-%m-%d') AS return_date FROM acct_sales_returns WHERE id = ? AND legal_business_id = ?`,
        [returnId, businessId]
      );
      const ret = { return_date: String(rows[0]?.return_date ?? ""), division_id: credit.divisionId };
      if (date < String(ret.return_date)) throw new UserError("A refund cannot be dated before the return.");
      if (date > new Date().toISOString().slice(0, 10)) throw new UserError("A refund cannot be dated in the future.");

      const outstanding = credit.availablePaise;
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

/**
 * Edit a refund that is already paid: amount, date, method and the account it was paid from.
 * The old journal entry is reversed automatically and the refund posts again with the new values.
 * The amount can never be more than what is still owed to the customer for that return.
 */
export async function editRefundAction(formData: FormData) {
  const user = await requireAccess("returns");
  const businessId = user.legal_business_id;
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  const refundId = Number(text("refund_id"));
  const date = text("refund_date");
  const here = `${PAGE}?editRefund=${Number.isInteger(refundId) ? refundId : ""}`;
  const stop = (message: string): never => redirect(`${here}&error=${encodeURIComponent(message.slice(0, 200))}`);
  if (!Number.isInteger(refundId) || refundId <= 0) fail("That refund was not found.");
  if (!validDate(date)) stop("Enter a valid refund date.");

  let ok = false;
  let message = "";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    try {
      await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
      const amount = parsePaise(text("amount"));
      if (amount <= 0n) throw new UserError("Enter the refund amount.");

      const [rows] = await conn.execute<Row[]>(
        `SELECT f.id, f.return_id, ROUND(f.amount * 100) AS paise, r.return_no,
                DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date
           FROM acct_sales_refunds f JOIN acct_sales_returns r ON r.id = f.return_id AND r.legal_business_id = f.legal_business_id
          WHERE f.id = ? AND f.legal_business_id = ? AND f.status = 'RECORDED' FOR UPDATE`,
        [refundId, businessId]
      );
      const refund = rows[0];
      if (!refund) throw new UserError("That refund was not found.");
      const credit = await lockReturnCredit(conn, businessId, Number(refund.return_id));
      if (!credit || !canUseDivision(user, credit.divisionId)) throw new UserError("That refund was not found.");
      if (date < String(refund.return_date)) throw new UserError("A refund cannot be dated before the return.");
      if (date > new Date().toISOString().slice(0, 10)) throw new UserError("A refund cannot be dated in the future.");

      const old = BigInt(String(refund.paise));
      const room = credit.availablePaise + old;
      if (amount > room) throw new UserError(`At most ₹${money(room)} can be refunded for this return.`);

      const { bankId, cashId } = await refundAccount(conn, businessId, text("account"));
      const method = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "OTHER"].includes(text("method"))
        ? text("method") : cashId ? "CASH" : "BANK_TRANSFER";

      const undone = await autoReverseForEdit(conn, {
        businessId, userId: user.id, sourceType: "SALES_REFUND", sourceId: refundId,
        reason: `Edited: refund ${refundId} for return ${refund.return_no}`,
      });
      if (!undone.ok) {
        throw new UserError(undone.reason === "period-closed" ? "That month is already closed, so this refund cannot be edited." : "Could not save the change. Nothing was changed.");
      }

      await conn.execute(
        `UPDATE acct_sales_refunds SET refund_date = ?, amount = ?, payment_method = ?, bank_account_id = ?, cash_account_id = ?
          WHERE id = ? AND legal_business_id = ?`,
        [date, money(amount), method, bankId, cashId, refundId, businessId]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'SALES_REFUND_EDITED', 'SALES_RETURN', ?, ?)`,
        [businessId, user.id, Number(refund.return_id), JSON.stringify({ refundId, from: money(old), to: money(amount) })]
      );
      await conn.commit();
      ok = true;
      message = `Refund changed to ₹${money(amount)}.`;
    } catch (error) {
      await conn.rollback();
      message = error instanceof UserError || (error instanceof Error && /Invalid/.test(error.message))
        ? (error as Error).message
        : "Could not save the change. Nothing was changed.";
    }
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  if (!ok) stop(message);
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
      if (!(await locationInScope(user, businessId, locationId))) throw new UserError("Choose a location.");

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
