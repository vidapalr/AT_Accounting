import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { autoReverseForEdit } from "@/lib/ledger/reverse-in-tx";
import { moveExcessToCustomerCredit, MONEY_METHODS } from "@/lib/sale-payments";
import { todayInIndia } from "@/lib/reports/money";

/**
 * Cancels a whole bill inside the caller's transaction (business row already locked). Nothing is deleted:
 * the bill stays on record as cancelled (VOID), its entries in the books are reversed, the pieces go back into
 * stock, serial numbers are free to sell again, and points or customer credit used on it come back. Money taken
 * is either given back (payment removed) or kept as customer credit. Throws "cancel-..." codes when not allowed.
 */
export async function cancelSaleInTx(conn: PoolConnection, o: { businessId: number; userId: number; saleId: number; why: string; money: "refund" | "credit" }): Promise<void> {
  const { businessId, saleId, why, money } = o;
  const user = { id: o.userId };
  const [heads] = await conn.execute<RowDataPacket[]>(
    `SELECT id, invoice_no, status, is_estimate, division_id, location_id, customer_id
       FROM acct_sales_headers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
    [businessId, saleId]
  );
  const sale = heads[0];
  if (!sale || (sale.status !== "POSTED" && sale.status !== "DRAFT")) throw new Error("invalid");
  const invoiceNo = String(sale.invoice_no);
  const today = todayInIndia();

  if (sale.status === "DRAFT") {
    // A draft never moved stock or money: it is simply cancelled.
    await conn.execute(`UPDATE acct_sales_headers SET status = 'VOID' WHERE id = ?`, [saleId]);
  } else {
    const [ret] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_sales_returns WHERE legal_business_id = ? AND sale_id = ? AND status = 'POSTED' LIMIT 1`, [businessId, saleId]);
    if (ret.length) throw new Error("cancel-has-returns");
    const [pays] = await conn.execute<RowDataPacket[]>(
      `SELECT id, payment_method, ROUND(amount * 100) AS paise FROM acct_sales_payments
        WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED' FOR UPDATE`, [businessId, saleId]);
    if (pays.some((p) => String(p.payment_method) === "SET_OFF")) throw new Error("cancel-has-setoff");

    // 1. The bill's entry in the books is reversed (kept, marked reversed).
    const undone = await autoReverseForEdit(conn, { businessId, userId: user.id, sourceType: "SALES_INVOICE", sourceId: saleId, reason: `Cancelled: invoice ${invoiceNo}. ${why}` });
    if (!undone.ok) throw new Error(undone.reason === "period-closed" ? "cancel-period-closed" : "failed");

    // 2. Money taken: kept as customer credit, or given back (payment removed).
    const customerId = Number(sale.customer_id ?? 0);
    const moneyPaid = pays.filter((p) => MONEY_METHODS.has(String(p.payment_method))).reduce((s, p) => s + BigInt(String(p.paise)), 0n);
    if (money === "credit" && moneyPaid > 0n) {
      if (!customerId) throw new Error("cancel-no-customer");
      const moved = await moveExcessToCustomerCredit(conn, { businessId, userId: user.id, saleId, invoiceNo, divisionId: Number(sale.division_id), customerId, excess: moneyPaid });
      if (!moved.ok) throw new Error(moved.reason === "period-closed" ? "cancel-period-closed" : "failed");
    }
    const [left] = await conn.execute<RowDataPacket[]>(
      `SELECT id, payment_method, amount, DATE_FORMAT(payment_date, '%Y-%m-%d') AS d FROM acct_sales_payments
        WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`, [businessId, saleId]);
    for (const p of left) {
      const r = await autoReverseForEdit(conn, { businessId, userId: user.id, sourceType: "SALES_RECEIPT", sourceId: Number(p.id), reason: `Cancelled: invoice ${invoiceNo}` });
      if (!r.ok) throw new Error(r.reason === "period-closed" ? "cancel-period-closed" : "failed");
      await conn.execute(`UPDATE acct_sales_payments SET status = 'VOID', remarks = ? WHERE id = ?`,
        [MONEY_METHODS.has(String(p.payment_method)) ? "Given back: bill cancelled" : "Bill cancelled", Number(p.id)]);
      if (String(p.payment_method) === "CREDIT" && customerId) {
        // Customer credit used on this bill comes back to the customer.
        await conn.execute(
          `INSERT INTO acct_customer_credits (legal_business_id, division_id, customer_id, entry_type, entry_date, amount, source_sale_id, remarks, created_by)
           VALUES (?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?)`,
          [businessId, sale.division_id, customerId, today, String(p.amount), saleId, `Credit back: bill ${invoiceNo} cancelled`, user.id]
        );
      }
    }

    // 3. Pieces go back into stock at the cost they left at.
    const [lines] = await conn.execute<RowDataPacket[]>(
      `SELECT id, variant_id, quantity, unit_cost, total_cost FROM acct_sales_lines WHERE legal_business_id = ? AND sale_id = ?`, [businessId, saleId]);
    for (const l of lines) {
      if (l.unit_cost == null) continue;
      await conn.execute(
        `INSERT INTO acct_stock_movements (legal_business_id, division_id, location_id, variant_id, movement_date, movement_type,
           source_type, source_id, source_line_id, quantity_change, unit_cost, total_cost, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, 'SALES_RETURN', 'SALES_INVOICE_EDIT', ?, ?, ?, ?, ?, ?, ?)`,
        [businessId, sale.division_id, sale.location_id, l.variant_id, today, saleId, l.id, l.quantity, l.unit_cost, l.total_cost,
         `Invoice ${invoiceNo} cancelled: back to stock`, user.id]
      );
    }
    try {
      await conn.execute(`UPDATE acct_serials SET status = 'IN_STOCK', sale_id = NULL, sold_on = NULL WHERE legal_business_id = ? AND sale_id = ?`, [businessId, saleId]);
    } catch { /* serial numbers not in use */ }

    await conn.execute(`UPDATE acct_sales_headers SET status = 'VOID' WHERE id = ?`, [saleId]);
  }
  await conn.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'SALE_CANCELLED', 'SALE', ?, ?)`,
    [businessId, user.id, saleId, JSON.stringify({ invoiceNo, why, money })]
  );
}
