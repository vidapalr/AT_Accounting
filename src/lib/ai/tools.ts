import "server-only";

/**
 * What the assistant may look up. Every tool only READS, always for the signed-in company, with
 * checked inputs and small answers. Nothing here can change a record.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

import { getProfitReport } from "@/lib/reports/report-data";
import { expensesByAccount, paymentsByMethod, salesInsights } from "@/lib/reports/breakdowns";
import { toNumber } from "@/lib/reports/money";
import { loadSupplierBalances } from "@/lib/supplier-ledger";

type Row = RowDataPacket & Record<string, string | number | null>;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const TOOL_DEFS = [
  {
    name: "sales_and_products",
    description: "Sales between two dates: total, number of bills, average bill, top products with margin, sales by kind of product, size, colour, weekday and hour, new vs returning customers, products in stock that did not sell.",
    input_schema: { type: "object", properties: { from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, required: ["from", "to"] },
  },
  {
    name: "profit",
    description: "Profit between two dates from the posted books: sales, discounts, cost of goods, gross, running expenses, operating and net profit, for the group, each division and each branch.",
    input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  },
  {
    name: "expenses_and_payments",
    description: "Running expenses by kind, and money received on bills by way of payment (cash, UPI, card...), between two dates.",
    input_schema: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  },
  {
    name: "stock",
    description: "Stock in hand now for items whose name or code contains the search words (empty search = the 20 items with most money tied up). Quantity, cost value and shop price.",
    input_schema: { type: "object", properties: { search: { type: "string" } }, required: [] },
  },
  {
    name: "dues",
    description: "Who owes the business (customers with unpaid bills) and whom the business owes (suppliers), largest first.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
] as const;

export async function runTool(db: Pool, businessId: number, name: string, input: Record<string, unknown>): Promise<unknown> {
  if (name === "sales_and_products" || name === "profit" || name === "expenses_and_payments") {
    if (!isDate(input.from) || !isDate(input.to) || input.from > input.to) return { error: "from and to must be dates YYYY-MM-DD, from before to" };
  }
  switch (name) {
    case "sales_and_products": {
      const s = await salesInsights(db, businessId, String(input.from), String(input.to));
      return s;
    }
    case "profit": {
      const scopes = await getProfitReport(db, businessId, String(input.from), String(input.to));
      return scopes.map((s) => ({
        level: s.label,
        sales: toNumber(s.figures.sales),
        discounts: toNumber(s.figures.discounts),
        costOfGoods: toNumber(s.figures.costOfGoods),
        gross: toNumber(s.figures.gross),
        runningExpenses: toNumber(s.figures.runningExpenses),
        operating: toNumber(s.figures.operating),
        setupCosts: toNumber(s.figures.setupCosts),
        net: toNumber(s.figures.net),
      }));
    }
    case "expenses_and_payments": {
      const [expenses, payments] = await Promise.all([
        expensesByAccount(db, businessId, String(input.from), String(input.to)),
        paymentsByMethod(db, businessId, String(input.from), String(input.to)),
      ]);
      return { expenses, payments };
    }
    case "stock": {
      const search = String(input.search ?? "").trim().slice(0, 40);
      const [rows] = await db.query<Row[]>(
        `SELECT p.product_name, v.sku, v.size_label, v.color_name, v.shop_price, SUM(m.quantity_change) AS qty,
                SUM(CASE WHEN m.quantity_change > 0 THEN COALESCE(m.total_cost,0) ELSE -COALESCE(m.total_cost,0) END) AS value
           FROM acct_stock_movements m
           JOIN acct_product_variants v ON v.id = m.variant_id AND v.legal_business_id = m.legal_business_id
           JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
          WHERE m.legal_business_id = ?
            ${search ? "AND (p.product_name LIKE ? OR v.sku LIKE ?)" : ""}
          GROUP BY v.id, p.product_name, v.sku, v.size_label, v.color_name, v.shop_price
         HAVING qty > 0 ORDER BY value DESC LIMIT 20`,
        search ? [businessId, `%${search}%`, `%${search}%`] : [businessId]
      );
      return rows.map((r) => ({ item: [r.product_name, r.size_label, r.color_name].filter(Boolean).join(" "), code: r.sku, qty: Number(r.qty), costValue: Number(r.value), shopPrice: r.shop_price == null ? null : Number(r.shop_price) }));
    }
    case "dues": {
      const [customers] = await db.query<Row[]>(
        `SELECT COALESCE(c.full_name, MAX(h.customer_name)) AS name,
                SUM(h.grand_total) - COALESCE(SUM((SELECT SUM(p.amount) FROM acct_sales_payments p WHERE p.legal_business_id = h.legal_business_id AND p.sale_id = h.id AND p.status = 'RECORDED')), 0) AS due
           FROM acct_sales_headers h LEFT JOIN acct_customers c ON c.id = h.customer_id
          WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.customer_id IS NOT NULL
          GROUP BY h.customer_id, c.full_name HAVING due > 0.5 ORDER BY due DESC LIMIT 15`,
        [businessId]
      );
      const balances = await loadSupplierBalances(db, businessId);
      const [names] = await db.query<Row[]>(`SELECT id, supplier_name FROM acct_suppliers WHERE legal_business_id = ?`, [businessId]);
      const nameOf = new Map(names.map((n) => [Number(n.id), String(n.supplier_name)]));
      const suppliers = [...balances.values()].filter((b) => b.balance > 0n).sort((a, b) => (b.balance > a.balance ? 1 : -1)).slice(0, 15)
        .map((b) => ({ name: nameOf.get(b.supplierId) ?? `Supplier ${b.supplierId}`, weOwe: toNumber(b.balance) }));
      return { customersOwe: customers.map((c) => ({ name: String(c.name), due: Number(c.due) })), weOweSuppliers: suppliers };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
