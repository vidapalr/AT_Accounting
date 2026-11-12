import "server-only";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

type Q = Pool | PoolConnection;

export type CashLine = { date: string; label: string; amount: bigint; direction: "IN" | "OUT" };

/**
 * Every cash movement for one cash drawer after `afterDate` (exclusive) up to
 * `upToDate` (inclusive), from the records the app already keeps.
 * `since` is when the previous closing was saved: anything dated on or before that
 * closing day but entered after it also counts, so a late entry is never lost.
 */
export async function loadCashMovements(
  db: Q,
  businessId: number,
  cashAccountId: number,
  afterDate: string,
  upToDate: string,
  since: string | null = null
): Promise<CashLine[]> {
  const lines: CashLine[] = [];
  const run = async (sql: string, direction: "IN" | "OUT", label: (r: RowDataPacket) => string) => {
    const [rows] = await db.execute<RowDataPacket[]>(sql, [businessId, cashAccountId, afterDate, upToDate, afterDate, since ?? "9999-12-31 00:00:00"]);
    for (const r of rows) {
      const late = String(r.d) <= afterDate;
      lines.push({ date: String(r.d), label: label(r) + (late ? " (entered after the last closing)" : ""), amount: BigInt(r.paise), direction });
    }
  };

  await run(
    `SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, ROUND(p.amount * 100) AS paise, s.invoice_no
       FROM acct_sales_payments p JOIN acct_sales_headers s ON s.id = p.sale_id AND s.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.cash_account_id = ? AND p.status = 'RECORDED'
        AND ((p.payment_date > ? AND p.payment_date <= ?) OR (p.payment_date <= ? AND p.created_at > ?))`,
    "IN", (r) => `Customer payment, bill ${r.invoice_no}`
  );
  await run(
    `SELECT DATE_FORMAT(refund_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise
       FROM acct_supplier_refunds
      WHERE legal_business_id = ? AND cash_account_id = ? AND status = 'RECORDED'
        AND ((refund_date > ? AND refund_date <= ?) OR (refund_date <= ? AND created_at > ?))`,
    "IN", () => "Supplier paid money back"
  );
  await run(
    `SELECT DATE_FORMAT(refund_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise
       FROM acct_sales_refunds
      WHERE legal_business_id = ? AND cash_account_id = ? AND status = 'RECORDED'
        AND ((refund_date > ? AND refund_date <= ?) OR (refund_date <= ? AND created_at > ?))`,
    "OUT", () => "Refund given to a customer"
  );
  await run(
    `SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, ROUND(p.amount * 100) AS paise, e.description
       FROM acct_expense_payments p JOIN acct_expenses e ON e.id = p.expense_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.cash_account_id = ? AND p.status = 'RECORDED'
        AND ((p.payment_date > ? AND p.payment_date <= ?) OR (p.payment_date <= ? AND p.created_at > ?))`,
    "OUT", (r) => `Expense: ${String(r.description).slice(0, 60)}`
  );
  await run(
    `SELECT DATE_FORMAT(payment_date, '%Y-%m-%d') AS d, ROUND(amount * 100) AS paise, payment_no
       FROM acct_purchase_payments
      WHERE legal_business_id = ? AND source_cash_account_id = ? AND status IN ('DRAFT','VERIFIED')
        AND ((payment_date > ? AND payment_date <= ?) OR (payment_date <= ? AND created_at > ?))`,
    "OUT", (r) => `Paid to supplier, ${r.payment_no}`
  );
  await run(
    `SELECT DATE_FORMAT(a.given_on, '%Y-%m-%d') AS d, ROUND(a.amount * 100) AS paise, e.full_name
       FROM acct_staff_advances a JOIN acct_employees e ON e.id = a.employee_id
      WHERE a.legal_business_id = ? AND a.cash_account_id = ? AND ((a.given_on > ? AND a.given_on <= ?) OR (a.given_on <= ? AND a.created_at > ?))`,
    "OUT", (r) => `Advance to ${String(r.full_name).slice(0, 40)}`
  );
  await run(
    `SELECT DATE_FORMAT(purchase_date, '%Y-%m-%d') AS d, ROUND(cost * 100) AS paise, asset_name
       FROM acct_fixed_assets
      WHERE legal_business_id = ? AND cash_account_id = ? AND paid_from = 'CASH' AND ((purchase_date > ? AND purchase_date <= ?) OR (purchase_date <= ? AND created_at > ?))`,
    "OUT", (r) => `Bought: ${String(r.asset_name).slice(0, 50)}`
  );
  await run(
    `SELECT DATE_FORMAT(disposed_on, '%Y-%m-%d') AS d, ROUND(proceeds * 100) AS paise, asset_name
       FROM acct_fixed_assets
      WHERE legal_business_id = ? AND proceeds_cash_account_id = ? AND status = 'DISPOSED' AND proceeds > 0 AND ((disposed_on > ? AND disposed_on <= ?) OR (disposed_on <= ? AND created_at > ?))`,
    "IN", (r) => `Sold: ${String(r.asset_name).slice(0, 50)}`
  );
  // Cash another drawer handed over to this one at its closing (needs migration 076).
  try {
    await run(
      `SELECT DATE_FORMAT(c.closing_date, '%Y-%m-%d') AS d, ROUND(c.taken_out * 100) AS paise, a.cash_name
         FROM acct_cash_closings c JOIN acct_cash_accounts a ON a.id = c.cash_account_id
        WHERE c.legal_business_id = ? AND c.taken_to = 'CASH' AND c.taken_cash_id = ? AND c.taken_out > 0
          AND ((c.closing_date > ? AND c.closing_date <= ?) OR (c.closing_date <= ? AND c.closed_at > ?))`,
      "IN", (r) => `Cash handed over from ${String(r.cash_name)}`
    );
  } catch { /* before migration 076 */ }
  return lines.sort((a, b) => a.date.localeCompare(b.date));
}

/** The latest closing before `date` for this drawer, if any. */
export async function previousClosing(db: Q, businessId: number, cashAccountId: number, date: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(closing_date, '%Y-%m-%d') AS d, ROUND(counted_amount * 100) AS counted_paise,
            DATE_FORMAT(GREATEST(closed_at, COALESCE(redone_at, closed_at)), '%Y-%m-%d %H:%i:%s') AS since
       FROM acct_cash_closings
      WHERE legal_business_id = ? AND cash_account_id = ? AND closing_date < ?
      ORDER BY closing_date DESC LIMIT 1`,
    [businessId, cashAccountId, date]
  );
  return rows[0] ? { date: String(rows[0].d), counted: BigInt(rows[0].counted_paise), since: rows[0].since ? String(rows[0].since) : null } : null;
}

/** The calendar day before an ISO date. The first closing of a drawer counts only that day's movements. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
