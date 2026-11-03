import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { canOpenPath } from "@/lib/access";

export type RecordHit = { kind: string; title: string; detail: string; href: string };

const like = (q: string) => `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

type U = { role: string; legal_business_id: number; scope_division_id: number | null };

/**
 * Find records by what people remember: a customer's name or mobile, a bill number, a product code...
 * Only searches the kinds of record this person is allowed to open (same rule as the menu).
 */
export async function searchRecords(user: U, raw: string): Promise<RecordHit[]> {
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return [];
  const b = user.legal_business_id;
  const p = like(q);
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? like(digits) : "%\u0000%";
  const div = user.scope_division_id;
  const hits: RecordHit[] = [];

  async function run(kind: string, sample: string, sql: string, params: unknown[], map: (r: RowDataPacket) => Omit<RecordHit, "kind">) {
    if (!canOpenPath(user.role, sample)) return;
    try {
      const [rows] = await db.execute<RowDataPacket[]>(sql, params as never[]);
      for (const r of rows) hits.push({ kind, ...map(r) });
    } catch { /* a table from a later migration may not exist yet */ }
  }

  await run("Customer", "/accounting/customers/1",
    `SELECT id, customer_code, full_name, phone FROM acct_customers
      WHERE legal_business_id = ? AND (full_name LIKE ? OR customer_code LIKE ? OR phone LIKE ?)
      ORDER BY full_name LIMIT 5`, [b, p, p, phone],
    (r) => ({ title: String(r.full_name), detail: `${r.customer_code}${r.phone ? ` · ${r.phone}` : ""}`, href: `/accounting/customers/${r.id}` }));

  await run("Bill", "/accounting/sales/1",
    `SELECT id, invoice_no, estimate_no, is_estimate, customer_name, customer_phone, DATE_FORMAT(invoice_date, '%d %b %Y') AS d
       FROM acct_sales_headers
      WHERE legal_business_id = ? ${div ? "AND division_id = ?" : ""}
        AND (invoice_no LIKE ? OR estimate_no LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)
      ORDER BY id DESC LIMIT 6`, div ? [b, div, p, p, p, phone] : [b, p, p, p, phone],
    (r) => ({ title: String(Number(r.is_estimate) ? (r.estimate_no ?? "Estimate") : r.invoice_no), detail: `${r.customer_name || "Walk-in"} · ${r.d}`, href: `/accounting/sales/${r.id}` }));

  await run("Product", "/accounting/catalogue/1",
    `SELECT p.id, p.product_code, p.product_name, GROUP_CONCAT(DISTINCT v.sku ORDER BY v.sku SEPARATOR ', ') AS skus
       FROM acct_products p LEFT JOIN acct_product_variants v ON v.product_id = p.id
      WHERE p.legal_business_id = ? ${div ? "AND p.division_id = ?" : ""}
        AND (p.product_code LIKE ? OR p.product_name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?)
      GROUP BY p.id, p.product_code, p.product_name ORDER BY p.product_name LIMIT 6`,
    div ? [b, div, p, p, p, p] : [b, p, p, p, p],
    (r) => ({ title: String(r.product_name), detail: `${r.product_code}${r.skus ? ` · ${String(r.skus).slice(0, 60)}` : ""}`, href: `/accounting/catalogue/${r.id}` }));

  await run("Supplier", "/accounting/supplier-statement",
    `SELECT id, supplier_code, supplier_name, mobile FROM acct_suppliers
      WHERE legal_business_id = ? AND (supplier_name LIKE ? OR supplier_code LIKE ? OR mobile LIKE ?)
      ORDER BY supplier_name LIMIT 5`, [b, p, p, phone],
    (r) => ({ title: String(r.supplier_name), detail: `${r.supplier_code}${r.mobile ? ` · ${r.mobile}` : ""}`, href: `/accounting/supplier-statement?supplier=${r.id}` }));

  await run("Purchase", "/accounting/purchases/1",
    `SELECT h.id, h.purchase_no, h.supplier_invoice_no, s.supplier_name, DATE_FORMAT(h.invoice_date, '%d %b %Y') AS d
       FROM acct_purchase_headers h LEFT JOIN acct_suppliers s ON s.id = h.supplier_id
      WHERE h.legal_business_id = ? ${div ? "AND h.division_id = ?" : ""}
        AND (h.purchase_no LIKE ? OR h.supplier_invoice_no LIKE ? OR s.supplier_name LIKE ?)
      ORDER BY h.id DESC LIMIT 5`, div ? [b, div, p, p, p] : [b, p, p, p],
    (r) => ({ title: String(r.purchase_no), detail: `${r.supplier_name ?? ""}${r.supplier_invoice_no ? ` · bill ${r.supplier_invoice_no}` : ""} · ${r.d}`, href: `/accounting/purchases/${r.id}` }));

  await run("Purchase order", "/accounting/purchase-orders/1",
    `SELECT o.id, o.order_no, s.supplier_name FROM acct_purchase_orders o LEFT JOIN acct_suppliers s ON s.id = o.supplier_id
      WHERE o.legal_business_id = ? AND (o.order_no LIKE ? OR s.supplier_name LIKE ?) ORDER BY o.id DESC LIMIT 4`, [b, p, p],
    (r) => ({ title: String(r.order_no), detail: String(r.supplier_name ?? ""), href: `/accounting/purchase-orders/${r.id}` }));

  await run("Expense", "/accounting/expenses/1",
    `SELECT id, expense_no, category, payee_name, DATE_FORMAT(expense_date, '%d %b %Y') AS d FROM acct_expenses
      WHERE legal_business_id = ? ${div ? "AND division_id = ?" : ""}
        AND (expense_no LIKE ? OR payee_name LIKE ? OR description LIKE ? OR category LIKE ?)
      ORDER BY id DESC LIMIT 4`, div ? [b, div, p, p, p, p] : [b, p, p, p, p],
    (r) => ({ title: String(r.expense_no), detail: `${r.category}${r.payee_name ? ` · ${r.payee_name}` : ""} · ${r.d}`, href: `/accounting/expenses/${r.id}` }));

  await run("Staff", "/accounting/salaries/1",
    `SELECT id, full_name, job_title, phone FROM acct_employees
      WHERE legal_business_id = ? AND (full_name LIKE ? OR phone LIKE ?) ORDER BY full_name LIMIT 4`, [b, p, phone],
    (r) => ({ title: String(r.full_name), detail: String(r.job_title ?? "Staff"), href: `/accounting/salaries/${r.id}` }));

  await run("Supplier return", "/accounting/supplier-returns/1",
    `SELECT r.id, r.return_no, s.supplier_name FROM acct_supplier_returns r LEFT JOIN acct_suppliers s ON s.id = r.supplier_id
      WHERE r.legal_business_id = ? AND (r.return_no LIKE ? OR s.supplier_name LIKE ?) ORDER BY r.id DESC LIMIT 3`, [b, p, p],
    (r) => ({ title: String(r.return_no), detail: String(r.supplier_name ?? ""), href: `/accounting/supplier-returns/${r.id}` }));

  await run("Journal", "/accounting/journals/1",
    `SELECT id, journal_no, description AS narration FROM acct_journal_entries WHERE legal_business_id = ? AND journal_no LIKE ? ORDER BY id DESC LIMIT 3`, [b, p],
    (r) => ({ title: String(r.journal_no), detail: String(r.narration ?? "").slice(0, 60), href: `/accounting/journals/${r.id}` }));

  return hits;
}
