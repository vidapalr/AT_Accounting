import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { setTrackingAction, addPiecesAction, backInStockAction } from "@/lib/serial-actions";
import { MAX_PIECES_AT_ONCE } from "@/lib/serial-limits";
import TableSearch from "@/components/TableSearch";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
const input: React.CSSProperties = { padding: "10px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #cbd5e1" };
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };

export default function SerialsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const b = user.legal_business_id;
  const q = await searchParams;
  let tracked: RowDataPacket[] = [], others: RowDataPacket[] = [], pieces: RowDataPacket[] = [];
  let notReady = false;
  const label = `CONCAT(p.product_name, COALESCE(CONCAT(' / ', v.size_label), ''), COALESCE(CONCAT(' / ', v.color_name), ''), ' (', v.sku, ')')`;
  try {
    [tracked] = await db.execute<RowDataPacket[]>(
      `SELECT v.id, ${label} AS label,
              (SELECT COUNT(*) FROM acct_serials s WHERE s.legal_business_id = v.legal_business_id AND s.variant_id = v.id AND s.status = 'IN_STOCK') AS in_stock,
              (SELECT COUNT(*) FROM acct_serials s WHERE s.legal_business_id = v.legal_business_id AND s.variant_id = v.id AND s.status = 'SOLD') AS sold
         FROM acct_product_variants v JOIN acct_products p ON p.id = v.product_id
        WHERE v.legal_business_id = ? AND v.track_serial = 1 ORDER BY p.product_name, v.sku`, [b]);
    [others] = await db.execute<RowDataPacket[]>(
      `SELECT v.id, ${label} AS label FROM acct_product_variants v JOIN acct_products p ON p.id = v.product_id
        WHERE v.legal_business_id = ? AND v.track_serial = 0 AND v.status = 'ACTIVE' ORDER BY p.product_name, v.sku LIMIT 1000`, [b]);
    [pieces] = await db.execute<RowDataPacket[]>(
      `SELECT s.id, s.serial_no, s.status, s.variant_id, s.sale_id, h.invoice_no, h.customer_name, DATE_FORMAT(s.sold_on, '%d %b %Y') AS sold_on
         FROM acct_serials s LEFT JOIN acct_sales_headers h ON h.id = s.sale_id
        WHERE s.legal_business_id = ? ORDER BY s.id DESC LIMIT 400`, [b]);
  } catch { notReady = true; }

  return (
    <main className={styles.page}>
      <h1>Piece by piece (serial) tracking</h1>
      <p>For one-of-a-kind or high-value pieces, such as a bridal saree. Switch it on only for those items; everything else sells exactly as before. Each piece gets its own code to stick on it, and the bill records which piece was sold.</p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error}</p>}
      {notReady && <p role="alert" style={{ color: "#b91c1c" }}>Not set up yet: run the database file 071_serials.</p>}

      {!notReady && (
        <>
          <form action={setTrackingAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", maxWidth: 640, margin: "12px 0" }}>
            <input type="hidden" name="on" value="1" />
            <select name="variant_id" required defaultValue="" style={{ ...input, flex: "1 1 300px" }} aria-label="Item to track">
              <option value="" disabled>Choose an item to track piece by piece…</option>
              {others.map(o => <option key={String(o.id)} value={String(o.id)}>{String(o.label)}</option>)}
            </select>
            <button type="submit" style={{ ...input, background: "#4f46e5", color: "#fff", fontWeight: 700 }}>Track this item</button>
          </form>

          <h2>Items tracked piece by piece</h2>
          {tracked.length === 0 && <p style={{ color: "#64748b" }}>None yet.</p>}
          <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
            {tracked.map(t => (
              <section key={String(t.id)} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#fff" }}>
                <strong>{String(t.label)}</strong>
                <div style={{ color: "#64748b" }}>{Number(t.in_stock)} in stock · {Number(t.sold)} sold</div>
                <form action={addPiecesAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <input type="hidden" name="variant_id" value={String(t.id)} />
                  <input name="count" type="number" min={1} max={MAX_PIECES_AT_ONCE} required placeholder="How many new pieces?" style={{ ...input, width: 200 }} />
                  <button type="submit" style={{ padding: "10px 16px", fontSize: 16 }}>Make piece codes</button>
                </form>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                  <Link className="btn-link" href={`/accounting/serials/labels?variant=${t.id}`}>Print labels for pieces in stock</Link>
                  <form action={setTrackingAction}>
                    <input type="hidden" name="variant_id" value={String(t.id)} />
                    <input type="hidden" name="on" value="0" />
                    <button type="submit" style={{ padding: "8px 12px" }}>Stop tracking this item</button>
                  </form>
                </div>
              </section>
            ))}
          </div>

          <h2 style={{ marginTop: 28 }}>All pieces (latest 400)</h2>
          <TableSearch placeholder="Search by piece code, bill or customer…" />
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
              <thead><tr>{["Piece", "Status", "Sold on bill", ""].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {pieces.length === 0 && <tr><td style={cell} colSpan={4}>No pieces yet.</td></tr>}
                {pieces.map(s => (
                  <tr key={String(s.id)}>
                    <td style={cell}><strong>{String(s.serial_no)}</strong> <small style={{ color: "#64748b" }}>{String(tracked.find(t => Number(t.id) === Number(s.variant_id))?.label ?? "")}</small></td>
                    <td style={cell}>{s.status === "SOLD" ? "Sold" : "In stock"}</td>
                    <td style={cell}>{s.sale_id ? <><Link href={`/accounting/sales/${s.sale_id}`}>{String(s.invoice_no)}</Link> · {String(s.customer_name || "Walk-in")} · {String(s.sold_on ?? "")}</> : "—"}</td>
                    <td style={cell}>
                      {s.status === "SOLD" && (
                        <form action={backInStockAction}>
                          <input type="hidden" name="serial_id" value={String(s.id)} />
                          <button type="submit" style={{ padding: "6px 10px" }}>Came back: in stock again</button>
                        </form>
                      )}
                    </td>
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
