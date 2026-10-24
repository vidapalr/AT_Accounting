import "server-only";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

type Q = Pool | PoolConnection;

export type CashLine = { date: string; label: string; amount: bigint; direction: "IN" | "OUT" };

/**
 * Every cash movement for one cash drawer after `afterDate` (exclusive) up to
 * `upToDate` (inclusive), from the records the app already keeps.
 */
export async function loadCashMovements(
  db: Q,
  businessId: number,
  cashAccountId: number,
  afterDate: string,
  upToDate: string
): Promise<CashLine[]> {
  const lines: CashLine[] = [];
  const run = async (sql: string, direction: "IN" | "OUT", label: (r: RowDataPacket) => string) => {
    const [rows] = await db.execute<RowDataPacket[]>(sql, [businessId, cashAccountId, afterDate, upToDate]);
    for (const r of rows) {
      lines.push({ date: String(r.d), label: label(r), amount: BigInt(r.paise), direction });
    }
  };

  await run(
    `SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, ROUND(p.amount * 100) AS paise, s.invoice_no
       FROM acct_sales_payments p JOIN acct_sales_headers s ON s.id = p.sale_id AND s.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.cash_account_id = ? AND p.status = 'RECORDED'
        AND p.payment_date > ? AND p.payment_date <= ?`,
    "IN", (r) => `Customer payment, bill ${r.invoice_no}`
  );
  await run(
    `SELECT DATE_FORMAT(refund_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise
       FROM acct_supplier_refunds
      WHERE legal_business_id = ? AND cash_account_id = ? AND status = 'RECORDED'
        AND refund_date > ? AND refund_date <= ?`,
    "IN", () => "Supplier paid money back"
  );
  await run(
    `SELECT DATE_FORMAT(refund_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise
       FROM acct_sales_refunds
      WHERE legal_business_id = ? AND cash_account_id = ? AND status = 'RECORDED'
        AND refund_date > ? AND refund_date <= ?`,
    "OUT", () => "Refund given to a customer"
  );
  await run(
    `SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, ROUND(p.amount * 100) AS paise, e.description
       FROM acct_expense_payments p JOIN acct_expenses e ON e.id = p.expense_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.cash_account_id = ? AND p.status = 'RECORDED'
        AND p.payment_date > ? AND p.payment_date <= ?`,
    "OUT", (r) => `Expense: ${String(r.description).slice(0, 60)}`
  );
  await run(
    `SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise, payment_no
       FROM acct_purchase_payments
      WHERE legal_business_id = ? AND source_cash_account_id = ? AND status IN ('DRAFT','VERIFIED')
        AND payment_date > ? AND payment_date <= ?`,
    "OUT", (r) => `Paid to supplier, ${r.payment_no}`
  );
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

/** The latest closing before `date` for this drawer, if any. */
export async function previousClosing(db: Q, businessId: number, cashAccountId: number, date: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(closing_date, '%Y-%m-%d') AS d, ROUND(counted_amount * 100) AS counted_paise
       FROM acct_cash_closings
      WHERE legal_business_id = ? AND cash_account_id = ? AND closing_date < ?
      ORDER BY closing_date DESC LIMIT 1`,
    [businessId, cashAccountId, date]
  );
  return rows[0] ? { date: String(rows[0].d), counted: BigInt(rows[0].counted_paise) } : null;
}

/** The calendar day before an ISO date. The first closing of a drawer counts only that day's movements. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
