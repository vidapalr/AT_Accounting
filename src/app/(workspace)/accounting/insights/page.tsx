import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getBalanceReport } from "@/lib/reports/report-data";

type Row = RowDataPacket & Record<string, string | number | null>;

const T = "DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:30'))";
const box: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, margin: "0 0 16px" };
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const muted: React.CSSProperties = { color: "#64748b", margin: "4px 0 10px" };

const day = (v: unknown): string => {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v ?? "").slice(0, 10);
};
const rs = (n: unknown) => `₹${Math.round(Number(n ?? 0)).toLocaleString("en-IN")}`;
const q = (n: unknown) => { const v = Number(n ?? 0); return Number.isInteger(v) ? String(v) : v.toFixed(1); };
const item = (r: Row) => `${r.product_name}${r.size_label || r.color_name ? ` (${[r.size_label, r.color_name].filter(Boolean).join(", ")})` : ""}`;

function Table({ heads, rows, empty }: { heads: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p style={muted}>{empty}</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{heads.map((h, i) => <th key={h} style={i === 0 ? cell : num}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={j === 0 ? cell : num}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

async function Content() {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;

  const [[dates]] = await db.execute<Row[]>(`SELECT ${T} AS today`);
  const today = day(dates.today);

  const [[wk]] = await db.execute<Row[]>(
    `SELECT COALESCE(SUM(CASE WHEN invoice_date > ${T} - INTERVAL 7 DAY THEN grand_total END), 0) AS this_week,
            COALESCE(SUM(CASE WHEN invoice_date <= ${T} - INTERVAL 7 DAY AND invoice_date > ${T} - INTERVAL 14 DAY THEN grand_total END), 0) AS last_week,
            COALESCE(SUM(CASE WHEN invoice_date > ${T} - INTERVAL 7 DAY THEN 1 END), 0) AS bills_this,
            COALESCE(SUM(CASE WHEN invoice_date <= ${T} - INTERVAL 7 DAY AND invoice_date > ${T} - INTERVAL 14 DAY THEN 1 END), 0) AS bills_last
       FROM acct_sales_headers WHERE legal_business_id = ? AND status = 'POSTED'`,
    [businessId]
  );

  const [best] = await db.execute<Row[]>(
    `SELECT p.product_name, v.size_label, v.color_name, SUM(l.quantity) AS sold, SUM(l.line_total) AS amount
       FROM acct_sales_lines l
       JOIN acct_sales_headers h ON h.id = l.sale_id AND h.legal_business_id = l.legal_business_id
       JOIN acct_product_variants v ON v.id = l.variant_id
       JOIN acct_products p ON p.id = v.product_id
      WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.invoice_date > ${T} - INTERVAL 7 DAY
      GROUP BY l.variant_id, p.product_name, v.size_label, v.color_name ORDER BY sold DESC LIMIT 5`,
    [businessId]
  );

  const [branches] = await db.execute<Row[]>(
    `SELECT b.branch_name, COUNT(*) AS bills, SUM(h.grand_total) AS total
       FROM acct_sales_headers h JOIN acct_branches b ON b.id = h.branch_id AND b.legal_business_id = h.legal_business_id
      WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.invoice_date > ${T} - INTERVAL 30 DAY
      GROUP BY h.branch_id, b.branch_name ORDER BY total DESC`,
    [businessId]
  );

  const [owing] = await db.execute<Row[]>(
    `SELECT h.customer_name AS name, MAX(h.customer_phone) AS phone, MIN(h.invoice_date) AS since,
            DATEDIFF(${T}, MIN(CASE WHEN due_row.due > 0.004 THEN h.invoice_date END)) AS days,
            SUM(due_row.due) AS due
       FROM acct_sales_headers h
       JOIN (SELECT h2.id,
                    h2.grand_total
                    - COALESCE((SELECT SUM(p.amount) FROM acct_sales_payments p WHERE p.sale_id = h2.id AND p.status = 'RECORDED'), 0)
                    - COALESCE((SELECT SUM(r.refund_value) FROM acct_sales_returns r WHERE r.sale_id = h2.id AND r.status = 'POSTED'), 0)
                    + COALESCE((SELECT SUM(px.amount) FROM acct_sales_payments px JOIN acct_sales_returns r3 ON r3.id = px.exchange_return_id WHERE r3.sale_id = h2.id AND px.status = 'RECORDED'), 0)
                    + COALESCE((SELECT SUM(f.amount) FROM acct_sales_refunds f JOIN acct_sales_returns r2 ON r2.id = f.return_id WHERE r2.sale_id = h2.id AND f.status = 'RECORDED'), 0) AS due
               FROM acct_sales_headers h2 WHERE h2.legal_business_id = ? AND h2.status = 'POSTED') due_row ON due_row.id = h.id
      WHERE h.legal_business_id = ?
      GROUP BY h.customer_name HAVING due > 0.004 ORDER BY due DESC LIMIT 10`,
    [businessId, businessId]
  );

  const [quiet] = await db.execute<Row[]>(
    `SELECT c.full_name AS name, c.phone, MAX(h.invoice_date) AS last_buy, COUNT(*) AS bills, SUM(h.grand_total) AS spent
       FROM acct_sales_headers h JOIN acct_customers c ON c.id = h.customer_id
      WHERE h.legal_business_id = ? AND h.status = 'POSTED'
      GROUP BY h.customer_id, c.full_name, c.phone
     HAVING last_buy < ${T} - INTERVAL 60 DAY
      ORDER BY spent DESC LIMIT 10`,
    [businessId]
  );

  const [lowSetting] = await db.execute<Row[]>(`SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = 'low_stock_units'`, [businessId]).catch(() => [[] as Row[]]);
  const limit = Number.isFinite(Number(lowSetting[0]?.setting_value)) && lowSetting[0] ? Number(lowSetting[0].setting_value) : 5;

  const [stock] = await db.execute<Row[]>(
    `SELECT p.product_name, v.size_label, v.color_name, s.onhand, s.value,
            COALESCE(sold.s30, 0) AS sold30, COALESCE(sold.last_sale, NULL) AS last_sale
       FROM (SELECT variant_id, SUM(quantity_change) AS onhand,
                    SUM(CASE WHEN quantity_change > 0 THEN total_cost ELSE -total_cost END) AS value
               FROM acct_stock_movements WHERE legal_business_id = ? GROUP BY variant_id) s
       JOIN acct_product_variants v ON v.id = s.variant_id
       JOIN acct_products p ON p.id = v.product_id
       LEFT JOIN (SELECT l.variant_id,
                         SUM(CASE WHEN h.invoice_date > ${T} - INTERVAL 30 DAY THEN l.quantity END) AS s30,
                         MAX(h.invoice_date) AS last_sale
                    FROM acct_sales_lines l JOIN acct_sales_headers h ON h.id = l.sale_id AND h.legal_business_id = l.legal_business_id
                   WHERE h.legal_business_id = ? AND h.status = 'POSTED' GROUP BY l.variant_id) sold ON sold.variant_id = s.variant_id
      WHERE v.legal_business_id = ? AND s.onhand > 0`,
    [businessId, businessId, businessId]
  );
  const runningOut = stock
    .filter((r) => Number(r.sold30) > 0)
    .map((r) => ({ r, days: Number(r.onhand) / (Number(r.sold30) / 30) }))
    .filter((x) => x.days <= 14 || Number(x.r.onhand) <= limit)
    .sort((a, b) => a.days - b.days)
    .slice(0, 10);
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 60);
  const cutoffText = cutoff.toISOString().slice(0, 10);
  const slow = stock
    .filter((r) => !r.last_sale || day(r.last_sale) < cutoffText)
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 10);

  const balances = await getBalanceReport(db, businessId, today);
  const byCode = (code: string) => balances.accounts.find((a) => a.code === code);
  const recv = byCode("1100") ? Number(byCode("1100")!.debit - byCode("1100")!.credit) / 100 : 0;
  const pay = byCode("2000") ? Number(byCode("2000")!.credit - byCode("2000")!.debit) / 100 : 0;

  const thisWeek = Number(wk.this_week);
  const lastWeek = Number(wk.last_week);
  const change = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  return (
    <div style={{ maxWidth: 980 }}>
      <h1>Insights</h1>
      <p style={muted}>
        Plain answers from the bills, stock and books you already keep. Nothing here can change anything.
        Sales are the bill totals. Profit figures are on <Link href="/accounting/reports">Profit and balance sheet</Link>.
      </p>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Sales</h2>
        <p style={{ fontSize: 18 }}>
          Last 7 days: <strong>{rs(thisWeek)}</strong> from {Number(wk.bills_this)} bills.
          {" "}Week before: {rs(lastWeek)} from {Number(wk.bills_last)} bills.
          {change !== null && <> That is <strong style={{ color: change >= 0 ? "#166534" : "#b91c1c" }}>{change >= 0 ? "up" : "down"} {Math.abs(change)}%</strong>.</>}
        </p>
        <h3>Best sellers this week</h3>
        <Table heads={["Item", "Sold", "Amount"]} empty="No sales in the last 7 days."
          rows={best.map((r) => [item(r), q(r.sold), rs(r.amount)])} />
        <h3>Each branch, last 30 days</h3>
        <Table heads={["Branch", "Bills", "Sales"]} empty="No sales in the last 30 days."
          rows={branches.map((r) => [String(r.branch_name), String(r.bills), rs(r.total)])} />
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Customers</h2>
        <h3>Who owes you money</h3>
        <Table heads={["Customer", "Owes", "Days since first unpaid bill"]} empty="Nobody owes you anything."
          rows={owing.map((r) => [`${r.name ?? "Walk-in"}${r.phone ? ` (${r.phone})` : ""}`, rs(r.due), String(r.days ?? "-")])} />
        <h3>Good customers who have gone quiet (no bill for 60 days)</h3>
        <p style={muted}>Biggest spenders first. A short WhatsApp message from you may bring them back.</p>
        <Table heads={["Customer", "Spent so far", "Bills", "Last bought"]} empty="No quiet customers."
          rows={quiet.map((r) => [`${r.name}${r.phone ? ` (${r.phone})` : ""}`, rs(r.spent), String(r.bills), day(r.last_buy)])} />
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Stock</h2>
        <h3>About to run out</h3>
        <p style={muted}>Items that sell and will be gone within about 2 weeks at the current pace, or are at {limit} or fewer.</p>
        <Table heads={["Item", "In stock", "Sold in 30 days", "Lasts about"]} empty="Nothing is about to run out."
          rows={runningOut.map(({ r, days }) => [item(r), q(r.onhand), q(r.sold30), `${Math.max(1, Math.round(days))} days`])} />
        <h3>Slow movers (in stock, not sold for 60 days)</h3>
        <p style={muted}>Most money tied up first. Think of an offer, or a bundle with a fast seller.</p>
        <Table heads={["Item", "In stock", "Cost tied up", "Last sold"]} empty="Everything in stock has sold recently."
          rows={slow.map((r) => [item(r), q(r.onhand), rs(r.value), r.last_sale ? day(r.last_sale) : "never"])} />
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Cash coming and going</h2>
        <p style={{ fontSize: 18 }}>
          Customers owe you <strong>{rs(recv)}</strong>. You owe suppliers <strong>{rs(pay)}</strong>.
        </p>
        <p style={muted}>Taken from the books, so it counts only entries already posted. We do not guess dates: collect the first and pay the second as they fall due.</p>
      </section>

      <p style={muted}>
        Want these sent to you? Add the <strong>Morning digest</strong> on <Link href="/accounting/whatsapp">WhatsApp reports</Link>.
      </p>
    </div>
  );
}

export default function InsightsPage() {
  return <Suspense fallback={<p>Loading…</p>}><Content /></Suspense>;
}
