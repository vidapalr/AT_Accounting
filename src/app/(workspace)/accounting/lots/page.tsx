import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ q?: string }> };
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };

export default function LotsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("stock");
  const b = user.legal_business_id;
  const q = String((await searchParams).q ?? "").trim().slice(0, 60);
  const like = `%${q.replace(/[\\%_]/g, m => `\\${m}`)}%`;
  let received: RowDataPacket[] = [], sold: RowDataPacket[] = [];
  let notReady = false;
  try {
    [received] = await db.execute<RowDataPacket[]>(
      `SELECT pl.lot_no, pl.purchase_id, ph.purchase_no, ph.supplier_invoice_no, DATE_FORMAT(ph.invoice_date, '%d %b %Y') AS d, s.supplier_name,
              p.product_name, v.sku, CAST(pl.quantity AS CHAR) AS qty
         FROM acct_purchase_lines pl
         JOIN acct_purchase_headers ph ON ph.id = pl.purchase_id AND ph.legal_business_id = pl.legal_business_id
         LEFT JOIN acct_suppliers s ON s.id = ph.supplier_id
         JOIN acct_product_variants v ON v.id = pl.variant_id
         JOIN acct_products p ON p.id = v.product_id
        WHERE pl.legal_business_id = ? AND pl.lot_no IS NOT NULL AND pl.lot_no <> '' AND ph.status = 'POSTED'
          ${q ? "AND pl.lot_no LIKE ?" : ""}
        ORDER BY ph.invoice_date DESC, pl.id DESC LIMIT 100`, q ? [b, like] : [b]);
    [sold] = await db.execute<RowDataPacket[]>(
      `SELECT sl.lot_no, h.id AS sale_id, h.invoice_no, h.customer_id, h.customer_name, h.customer_phone, DATE_FORMAT(h.invoice_date, '%d %b %Y') AS d,
              p.product_name, v.sku, CAST(sl.quantity AS CHAR) AS qty
         FROM acct_sales_lines sl
         JOIN acct_sales_headers h ON h.id = sl.sale_id AND h.legal_business_id = sl.legal_business_id
         JOIN acct_product_variants v ON v.id = sl.variant_id
         JOIN acct_products p ON p.id = v.product_id
        WHERE sl.legal_business_id = ? AND sl.lot_no IS NOT NULL AND sl.lot_no <> '' AND h.status = 'POSTED'
          ${q ? "AND sl.lot_no LIKE ?" : ""}
        ORDER BY h.invoice_date DESC, sl.id DESC LIMIT 200`, q ? [b, like] : [b]);
  } catch { notReady = true; }

  return (
    <main className={styles.page}>
      <h1>Find by lot</h1>
      <p>A customer complains about the shade or print? Type the lot (dye batch) to see which supplier and purchase it came from, and who bought from that lot.</p>
      {notReady && <p role="alert" style={{ color: "#b91c1c" }}>Not set up yet: run the database file 070_lots.</p>}
      <form method="GET" style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 520, margin: "12px 0" }}>
        <input type="search" name="q" defaultValue={q} placeholder="Lot name, e.g. Lot 12" maxLength={60}
          style={{ flex: "1 1 240px", padding: "11px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #cbd5e1" }} />
        <button type="submit" style={{ padding: "11px 18px", fontSize: 16 }}>Find</button>
        {q && <Link className="btn-link" href="/accounting/lots">Clear</Link>}
      </form>

      {!notReady && (
        <>
          <h2>Received from suppliers{q ? ` (lot matching “${q}”)` : " (latest)"}</h2>
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>{["Lot", "Item", "Qty", "Supplier", "Purchase"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {received.length === 0 && <tr><td style={cell} colSpan={5}>{q ? "No purchase has this lot." : "No lot names have been typed on purchases yet."}</td></tr>}
                {received.map((r, i) => (
                  <tr key={i}>
                    <td style={cell}><strong>{String(r.lot_no)}</strong></td>
                    <td style={cell}>{String(r.product_name)} <small style={{ color: "#64748b" }}>{String(r.sku)}</small></td>
                    <td style={cell}>{String(r.qty)}</td>
                    <td style={cell}>{String(r.supplier_name ?? "—")}</td>
                    <td style={cell}><Link href={`/accounting/purchases/${r.purchase_id}`}>{String(r.purchase_no)}</Link>{r.supplier_invoice_no ? ` · bill ${String(r.supplier_invoice_no)}` : ""} · {String(r.d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: 24 }}>Sold from this lot</h2>
          <p style={{ color: "#64748b", marginTop: 0 }}>Only bills where the cashier picked or typed the lot are listed here.</p>
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr>{["Lot", "Item", "Qty", "Customer", "Bill"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {sold.length === 0 && <tr><td style={cell} colSpan={5}>{q ? "No bill has this lot." : "No bill has a lot yet."}</td></tr>}
                {sold.map((r, i) => (
                  <tr key={i}>
                    <td style={cell}><strong>{String(r.lot_no)}</strong></td>
                    <td style={cell}>{String(r.product_name)} <small style={{ color: "#64748b" }}>{String(r.sku)}</small></td>
                    <td style={cell}>{String(r.qty)}</td>
                    <td style={cell}>{r.customer_id ? <Link href={`/accounting/customers/${r.customer_id}`}>{String(r.customer_name || "Customer")}</Link> : String(r.customer_name || "Walk-in")}{r.customer_phone ? ` · ${String(r.customer_phone)}` : ""}</td>
                    <td style={cell}><Link href={`/accounting/sales/${r.sale_id}`}>{String(r.invoice_no)}</Link> · {String(r.d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
