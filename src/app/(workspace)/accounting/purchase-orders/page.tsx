import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { todayInIndia } from "@/lib/reports/money";

type Props = { searchParams: Promise<{ show?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("purchases");
  const divisionId = await getActiveDivisionId(user);
  const all = (await searchParams).show === "all";
  const today = todayInIndia();

  const [orders] = await db.execute<Row[]>(
    `SELECT o.id, o.order_no, o.status, s.supplier_name,
            DATE_FORMAT(o.order_date, '%Y-%m-%d') AS od, DATE_FORMAT(o.expected_date, '%Y-%m-%d') AS ed,
            ROUND(COALESCE((SELECT SUM(l.line_amount) FROM acct_purchase_order_lines l WHERE l.order_id = o.id), 0) * 100) AS total_paise,
            (SELECT COUNT(*) FROM acct_purchase_order_lines l WHERE l.order_id = o.id) AS items
       FROM acct_purchase_orders o JOIN acct_suppliers s ON s.id = o.supplier_id
      WHERE o.legal_business_id = ? AND o.division_id = ?${all ? "" : " AND o.status = 'OPEN'"}
      ORDER BY o.id DESC LIMIT 200`,
    [user.legal_business_id, divisionId]
  );

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Purchase orders</h1>
      <p style={{ color: "#64748b" }}>What you have ordered from suppliers. When the goods arrive, open the order and tap &ldquo;Goods arrived&rdquo;.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <Link className="btn-link btn-link-primary" href="/accounting/purchase-orders/new">+ New order</Link>
        <Link className={`btn-link${all ? "" : " btn-link-primary"}`} href="/accounting/purchase-orders">Waiting for delivery</Link>
        <Link className={`btn-link${all ? " btn-link-primary" : ""}`} href="/accounting/purchase-orders?show=all">All orders</Link>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead><tr><th style={cell}>Order</th><th style={cell}>Supplier</th><th style={cell}>Expected</th><th style={{ ...cell, textAlign: "right" }}>Value</th><th style={cell}>Status</th></tr></thead>
          <tbody>
            {orders.map((o) => {
              const late = o.status === "OPEN" && o.ed && String(o.ed) < today;
              return (
                <tr key={String(o.id)}>
                  <td style={cell}><Link href={`/accounting/purchase-orders/${o.id}`}>{String(o.order_no)}</Link><br /><span style={{ color: "#64748b", fontSize: 13 }}>{pretty(String(o.od))} · {String(o.items)} items</span></td>
                  <td style={cell}>{String(o.supplier_name)}</td>
                  <td style={{ ...cell, color: late ? "#b91c1c" : undefined }}>{o.ed ? pretty(String(o.ed)) : "—"}{late ? " (late)" : ""}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{rupees(BigInt(o.total_paise as number | string))}</td>
                  <td style={cell}>{o.status === "OPEN" ? "Waiting" : o.status === "RECEIVED" ? "Received" : "Cancelled"}</td>
                </tr>
              );
            })}
            {orders.length === 0 && <tr><td style={cell} colSpan={5}>{all ? "No orders yet." : "Nothing is waiting for delivery."}</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
