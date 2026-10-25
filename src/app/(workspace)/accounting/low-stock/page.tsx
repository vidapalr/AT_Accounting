import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { setLowStockLevelAction } from "@/lib/stock-count-actions";

type Props = { searchParams: Promise<{ q?: string; saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const n = (v: string | number | null) => String(Number(v ?? 0));
const name = (r: Row) => [r.product_name, r.size_label, r.color_name].filter(Boolean).join(" · ");

async function LowStockContent({ searchParams }: Props) {
  const user = await requireAccess("stock");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const search = (query.q ?? "").trim().slice(0, 60);

  // Per place, items at or below the minimum they should keep.
  const [low] = await db.execute<Row[]>(
    `SELECT v.id, v.sku, v.size_label, v.color_name, v.low_stock_level, p.product_name,
            w.location_name, COALESCE(s.qty, 0) AS qty
       FROM acct_product_variants v
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
       JOIN acct_inventory_locations w ON w.legal_business_id = v.legal_business_id
                                       AND w.division_id = v.division_id AND w.status = 'ACTIVE'
                                       AND w.location_code NOT LIKE 'WITH-CUST-%'
       LEFT JOIN (SELECT variant_id, location_id, SUM(quantity_change) AS qty
                    FROM acct_stock_movements WHERE legal_business_id = ? GROUP BY variant_id, location_id) s
              ON s.variant_id = v.id AND s.location_id = w.id
      WHERE v.legal_business_id = ? AND v.status = 'ACTIVE'
        AND v.low_stock_level IS NOT NULL AND v.low_stock_level > 0
        AND COALESCE(s.qty, 0) <= v.low_stock_level
      ORDER BY (COALESCE(s.qty, 0) <= 0) DESC, p.product_name, v.sku, w.location_name
      LIMIT 300`,
    [businessId, businessId]
  );

  const like = `%${search}%`;
  const [setup] = await db.execute<Row[]>(
    `SELECT v.id, v.sku, v.size_label, v.color_name, v.low_stock_level, p.product_name
       FROM acct_product_variants v
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE v.legal_business_id = ? AND v.status = 'ACTIVE'
        ${search ? "AND (p.product_name LIKE ? OR v.sku LIKE ? OR v.barcode = ?)" : ""}
      ORDER BY (v.low_stock_level IS NULL), p.product_name, v.sku LIMIT 40`,
    search ? [businessId, like, like, search] : [businessId]
  );

  const back = `/accounting/low-stock${search ? `?q=${encodeURIComponent(search)}` : ""}`;
  const shareText = `Items to reorder:\n${low
    .map((r) => `${name(r)} (${r.sku}) at ${r.location_name}: ${n(r.qty)} left`)
    .join("\n")}`;

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Running low</h1>
      <p style={{ color: "#64748b" }}>
        Items at or below the minimum you set. Set a minimum for each item you always want in stock.
      </p>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <h2>Reorder list ({low.length})</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={cell}>Item</th><th style={cell}>Place</th><th style={cell}>Left</th><th style={cell}>Minimum</th></tr></thead>
          <tbody>
            {low.map((r) => (
              <tr key={`${r.id}-${r.location_name}`}>
                <td style={cell}>{name(r)} <span style={{ color: "#64748b" }}>({r.sku})</span></td>
                <td style={cell}>{r.location_name}</td>
                <td style={{ ...cell, color: Number(r.qty) <= 0 ? "#b91c1c" : "#92400e" }}>{n(r.qty)}</td>
                <td style={cell}>{n(r.low_stock_level)}</td>
              </tr>
            ))}
            {low.length === 0 && <tr><td style={cell} colSpan={4}>Nothing is running low. Set minimums below to start.</td></tr>}
          </tbody>
        </table>
        {low.length > 0 && (
          <p style={{ marginTop: 12 }}>
            <a className="btn-link" href={`https://wa.me/?text=${encodeURIComponent(shareText.slice(0, 1500))}`} target="_blank" rel="noreferrer">
              Send this list on WhatsApp
            </a>
          </p>
        )}
      </section>

      <section style={box}>
        <h2>Set the minimum for an item</h2>
        <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <input name="q" defaultValue={search} placeholder="Find an item" style={{ ...field, width: 240 }} />
          <button type="submit" className="btn-link" style={{ cursor: "pointer", fontSize: 16, padding: "10px 20px" }}>Search</button>
        </form>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={cell}>Item</th><th style={cell}>Keep at least</th><th style={cell}></th></tr></thead>
          <tbody>
            {setup.map((r) => (
              <tr key={String(r.id)}>
                <td style={cell}>{name(r)} <span style={{ color: "#64748b" }}>({r.sku})</span></td>
                <td colSpan={2} style={cell}>
                  <form action={setLowStockLevelAction} style={{ display: "flex", gap: 8 }}>
                    <input type="hidden" name="variant_id" value={String(r.id)} />
                    <input type="hidden" name="back" value={back} />
                    <input name="level" inputMode="decimal" defaultValue={r.low_stock_level === null ? "" : n(r.low_stock_level)} placeholder="e.g. 5" style={{ ...field, width: 100 }} aria-label={`Minimum for ${r.sku}`} />
                    <button type="submit" className="btn-link" style={{ cursor: "pointer", fontSize: 16, padding: "10px 20px" }}>Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default function LowStockPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LowStockContent {...props} />
    </Suspense>
  );
}
