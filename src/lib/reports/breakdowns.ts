import "server-only";

/**
 * Splits for charts on Reports and Insights: where money went, how customers paid, and what sold
 * (by kind of product, day, hour, size, colour). Values are rupees as numbers, for display only;
 * the books themselves stay in exact paise.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

type Row = RowDataPacket & Record<string, string | number | null>;
const n = (v: unknown) => Number(v ?? 0);

/** Running expenses in a period, by ledger account (posted entries only). */
export async function expensesByAccount(db: Pool, businessId: number, from: string, to: string) {
  const [rows] = await db.query<Row[]>(
    `SELECT a.account_code, a.account_name, SUM(l.debit - l.credit) AS amount
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
       JOIN acct_chart_of_accounts a ON a.id = l.account_id
      WHERE l.legal_business_id = ? AND j.status IN ('POSTED','REVERSED') AND j.entry_date BETWEEN ? AND ?
        AND a.account_code LIKE '6%'
      GROUP BY a.account_code, a.account_name HAVING amount > 0`,
    [businessId, from, to]
  );
  return rows.map((r) => ({ label: String(r.account_name), value: n(r.amount) }));
}

/** Money received on bills in a period, by way of payment. */
export async function paymentsByMethod(db: Pool, businessId: number, from: string, to: string) {
  const [rows] = await db.query<Row[]>(
    `SELECT payment_method, SUM(amount) AS amount FROM acct_sales_payments
      WHERE legal_business_id = ? AND status = 'RECORDED' AND payment_date BETWEEN ? AND ?
        AND payment_method NOT IN ('DISCOUNT','SET_OFF','EXCHANGE')
      GROUP BY payment_method`,
    [businessId, from, to]
  );
  const words: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank transfer", CREDIT: "Customer credit used", OTHER: "Other" };
  return rows.map((r) => ({ label: words[String(r.payment_method)] ?? String(r.payment_method), value: n(r.amount) }));
}

const SALE = `FROM acct_sales_lines l
  JOIN acct_sales_headers h ON h.id = l.sale_id AND h.legal_business_id = l.legal_business_id
  JOIN acct_product_variants v ON v.id = l.variant_id AND v.legal_business_id = l.legal_business_id
  JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
 WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.invoice_date BETWEEN ? AND ?`;
/** Line value without GST (GST is not the shop's money). */
const NET = `(l.line_total - COALESCE(l.cgst_amount, 0) - COALESCE(l.sgst_amount, 0) - COALESCE(l.igst_amount, 0))`;

export type SalesInsights = Awaited<ReturnType<typeof salesInsights>>;

export async function salesInsights(db: Pool, businessId: number, from: string, to: string) {
  const args = [businessId, from, to];
  const [byCategory] = await db.query<Row[]>(
    `SELECT COALESCE(c.category_name, 'No category') AS name, SUM(${NET}) AS amount
       ${SALE.replace("JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id", "JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id LEFT JOIN acct_product_categories c ON c.id = p.category_id")}
      GROUP BY name`,
    args
  );
  const [bySize] = await db.query<Row[]>(`SELECT COALESCE(NULLIF(v.size_label, ''), 'No size') AS name, SUM(l.quantity) AS qty ${SALE} GROUP BY name`, args);
  const [byColour] = await db.query<Row[]>(`SELECT COALESCE(NULLIF(v.color_name, ''), 'No colour') AS name, SUM(l.quantity) AS qty ${SALE} GROUP BY name`, args);
  const [top] = await db.query<Row[]>(
    `SELECT p.product_name, SUM(l.quantity) AS qty, SUM(${NET}) AS amount, SUM(${NET} - COALESCE(l.total_cost, 0)) AS margin
       ${SALE} GROUP BY p.id, p.product_name ORDER BY amount DESC LIMIT 10`,
    args
  );
  const [lowMargin] = await db.query<Row[]>(
    `SELECT p.product_name, SUM(${NET}) AS amount, SUM(${NET} - COALESCE(l.total_cost, 0)) AS margin
       ${SALE} GROUP BY p.id, p.product_name HAVING amount > 0 ORDER BY SUM(${NET} - COALESCE(l.total_cost, 0)) / SUM(${NET}) ASC LIMIT 5`,
    args
  );
  const [byWeekday] = await db.query<Row[]>(
    `SELECT DAYOFWEEK(invoice_date) AS d, SUM(grand_total) AS amount, COUNT(*) AS bills FROM acct_sales_headers
      WHERE legal_business_id = ? AND status = 'POSTED' AND invoice_date BETWEEN ? AND ? GROUP BY d`,
    args
  );
  const [byHour] = await db.query<Row[]>(
    `SELECT HOUR(CONVERT_TZ(created_at, '+00:00', '+05:30')) AS hr, SUM(grand_total) AS amount FROM acct_sales_headers
      WHERE legal_business_id = ? AND status = 'POSTED' AND invoice_date BETWEEN ? AND ? GROUP BY hr`,
    args
  );
  const [bills] = await db.query<Row[]>(
    `SELECT COUNT(*) AS bills, COALESCE(SUM(grand_total), 0) AS amount, COUNT(DISTINCT customer_id) AS customers FROM acct_sales_headers
      WHERE legal_business_id = ? AND status = 'POSTED' AND invoice_date BETWEEN ? AND ?`,
    args
  );
  // New customers: first ever bill falls in the period. Returning: bought before the period too.
  const [custMix] = await db.query<Row[]>(
    `SELECT SUM(first_bill >= ?) AS fresh, SUM(first_bill < ?) AS repeat_buyers FROM (
        SELECT h.customer_id, MIN(h.invoice_date) AS first_bill FROM acct_sales_headers h
         WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.customer_id IS NOT NULL AND h.invoice_date <= ?
         GROUP BY h.customer_id
        HAVING SUM(h.invoice_date BETWEEN ? AND ?) > 0) x`,
    [from, from, businessId, to, from, to]
  );
  const [notSelling] = await db.query<Row[]>(
    `SELECT p.product_name, SUM(m.quantity_change) AS onhand,
            SUM(CASE WHEN m.quantity_change < 0 THEN -m.total_cost ELSE m.total_cost END) AS value
       FROM acct_stock_movements m
       JOIN acct_product_variants v ON v.id = m.variant_id AND v.legal_business_id = m.legal_business_id
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE m.legal_business_id = ? AND m.movement_type NOT IN ('TRANSFER_OUT','TRANSFER_IN')
        AND NOT EXISTS (SELECT 1 FROM acct_sales_lines l JOIN acct_sales_headers h ON h.id = l.sale_id AND h.legal_business_id = l.legal_business_id
                         JOIN acct_product_variants v2 ON v2.id = l.variant_id
                        WHERE h.legal_business_id = m.legal_business_id AND h.status = 'POSTED' AND v2.product_id = p.id AND h.invoice_date BETWEEN ? AND ?)
      GROUP BY p.id, p.product_name HAVING onhand > 0 ORDER BY value DESC LIMIT 10`,
    args
  );
  const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const b = bills[0];
  return {
    bills: n(b?.bills),
    amount: n(b?.amount),
    customers: n(b?.customers),
    average: n(b?.bills) ? n(b?.amount) / n(b?.bills) : 0,
    byCategory: byCategory.map((r) => ({ label: String(r.name), value: n(r.amount) })),
    bySize: bySize.map((r) => ({ label: String(r.name), value: n(r.qty) })),
    byColour: byColour.map((r) => ({ label: String(r.name), value: n(r.qty) })),
    top: top.map((r) => ({ name: String(r.product_name), qty: n(r.qty), amount: n(r.amount), margin: n(r.margin) })),
    lowMargin: lowMargin.map((r) => ({ name: String(r.product_name), amount: n(r.amount), margin: n(r.margin) })),
    byWeekday: WEEK.map((label, i) => ({ label, value: n(byWeekday.find((r) => n(r.d) === i + 1)?.amount) })),
    byHour: Array.from({ length: 14 }, (_, i) => i + 8).map((h) => ({ label: `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`, value: n(byHour.find((r) => n(r.hr) === h)?.amount) })),
    customerMix: [
      { label: "New customers", value: n(custMix[0]?.fresh) },
      { label: "Returning customers", value: n(custMix[0]?.repeat_buyers) },
    ],
    notSelling: notSelling.map((r) => ({ name: String(r.product_name), onhand: n(r.onhand), value: n(r.value) })),
  };
}
