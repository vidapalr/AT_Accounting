import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canWriteOffStockCount } from "@/lib/access";
import { saveStockCountAction, writeOffCountShortagesAction, acceptExtraStockAction } from "@/lib/stock-count-actions";
import ConfirmButton from "@/components/ConfirmButton";

type Props = {
  searchParams: Promise<{ location?: string; q?: string; view?: string; saved?: string; error?: string }>;
};
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const qty = (v: string | number | null) => String(Number(v ?? 0));
const itemName = (r: Row) =>
  [r.product_name, r.size_label, r.color_name].filter(Boolean).join(" · ");

async function StockCountContent({ searchParams }: Props) {
  const user = await requireAccess("stock_count");
  const businessId = user.legal_business_id;
  const canSettle = canWriteOffStockCount(user.role);
  const query = await searchParams;
  const locationId = Number(query.location);
  const viewId = Number(query.view);
  const search = (query.q ?? "").trim().slice(0, 60);

  const [locations] = await db.execute<Row[]>(
    `SELECT id, location_name FROM acct_inventory_locations
     WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY location_name`,
    [businessId]
  );
  const place = Number.isInteger(locationId) ? locations.find((l) => Number(l.id) === locationId) : undefined;

  // A saved count being looked at.
  let count: Row | undefined;
  let lines: Row[] = [];
  if (place && Number.isInteger(viewId) && viewId > 0) {
    const [c] = await db.execute<Row[]>(
      `SELECT c.id, c.count_no, c.status, c.note, DATE_FORMAT(c.count_date, '%d %b %Y') AS d, u.full_name AS who
         FROM acct_stock_counts c LEFT JOIN acct_app_users u ON u.id = c.counted_by
        WHERE c.id = ? AND c.legal_business_id = ? AND c.location_id = ?`,
      [viewId, businessId, place.id]
    );
    count = c[0];
    if (count) {
      const [l] = await db.execute<Row[]>(
        `SELECT l.id, l.books_qty, l.counted_qty, l.difference, l.written_off, l.found,
                v.sku, v.size_label, v.color_name, p.product_name
           FROM acct_stock_count_lines l
           JOIN acct_product_variants v ON v.id = l.variant_id AND v.legal_business_id = l.legal_business_id
           JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
          WHERE l.legal_business_id = ? AND l.count_id = ?
          ORDER BY (l.difference = 0), p.product_name, v.sku`,
        [businessId, viewId]
      );
      lines = l;
    }
  }

  // The sheet to count with.
  let items: Row[] = [];
  if (place && !count) {
    const like = `%${search}%`;
    const [rows] = await db.execute<Row[]>(
      `SELECT v.id, v.sku, v.size_label, v.color_name, p.product_name, s.qty
         FROM (SELECT variant_id, SUM(quantity_change) AS qty
                 FROM acct_stock_movements
                WHERE legal_business_id = ? AND location_id = ?
                GROUP BY variant_id) s
         JOIN acct_product_variants v ON v.id = s.variant_id AND v.legal_business_id = ? AND v.status = 'ACTIVE'
         JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
         ${search ? "WHERE (p.product_name LIKE ? OR v.sku LIKE ? OR v.barcode = ?)" : ""}
         ORDER BY p.product_name, v.sku LIMIT 200`,
      search ? [businessId, place.id, businessId, like, like, search] : [businessId, place.id, businessId]
    );
    items = rows;
  }

  const [recent] = await db.execute<Row[]>(
    `SELECT c.id, c.count_no, c.status, c.location_id, DATE_FORMAT(c.count_date, '%d %b %Y') AS d, w.location_name,
            (SELECT COUNT(*) FROM acct_stock_count_lines l WHERE l.count_id = c.id) AS items,
            (SELECT COUNT(*) FROM acct_stock_count_lines l WHERE l.count_id = c.id AND l.difference <> 0) AS gaps
       FROM acct_stock_counts c
       JOIN acct_inventory_locations w ON w.id = c.location_id AND w.legal_business_id = c.legal_business_id
      WHERE c.legal_business_id = ? ORDER BY c.id DESC LIMIT 15`,
    [businessId]
  );

  const short = lines.filter((l) => Number(l.difference) < 0);
  const extra = lines.filter((l) => Number(l.difference) > 0);
  const matched = lines.filter((l) => Number(l.difference) === 0);

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Count stock</h1>
      <p style={{ color: "#64748b" }}>
        Count what is really on the shelf, type it in, and see what is missing or extra compared with the books.
        Record all sales first, and count when no one is selling.
      </p>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select name="location" defaultValue={place ? String(place.id) : ""} style={{ ...field, minWidth: 240 }}>
          <option value="">Choose the place to count</option>
          {locations.map((l) => (
            <option key={String(l.id)} value={String(l.id)}>{l.location_name}</option>
          ))}
        </select>
        <input name="q" defaultValue={search} placeholder="Find an item (optional)" style={{ ...field, width: 220 }} />
        <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "10px 20px" }}>
          Show items
        </button>
      </form>

      {count && (
        <section style={box}>
          <h2>{count.count_no} · {place?.location_name} · {count.d}</h2>
          <p style={{ color: "#64748b" }}>
            Counted by {count.who ?? "staff"}. {matched.length} matched, {short.length} short, {extra.length} extra.
            {count.status === "SETTLED" ? " Shortages have been written off." : ""}
          </p>
          {short.length > 0 && (
            <>
              <h3>Short (books say more than you counted)</h3>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={cell}>Item</th><th style={cell}>Books</th><th style={cell}>Counted</th><th style={cell}>Missing</th></tr></thead>
                <tbody>
                  {short.map((l) => (
                    <tr key={String(l.id)}>
                      <td style={cell}>{itemName(l)} <span style={{ color: "#64748b" }}>({l.sku})</span></td>
                      <td style={cell}>{qty(l.books_qty)}</td>
                      <td style={cell}>{qty(l.counted_qty)}</td>
                      <td style={{ ...cell, color: "#b91c1c" }}>{qty(-Number(l.difference))}{l.written_off ? " (written off)" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {count.status === "COUNTED" && canSettle && (
                <form action={writeOffCountShortagesAction} style={{ marginTop: 12 }}>
                  <input type="hidden" name="count_id" value={String(count.id)} />
                  <ConfirmButton
                    label="Write off the shortages as lost stock"
                    question="Take the missing items out of stock and book their cost as lost stock? This cannot be undone."
                    className="btn-link btn-link-primary"
                  />
                </form>
              )}
              {count.status === "COUNTED" && !canSettle && (
                <p style={{ color: "#64748b" }}>The owner or accountant will review these shortages.</p>
              )}
            </>
          )}
          {extra.length > 0 && (
            <>
              <h3>Extra (you counted more than the books say)</h3>
              <p style={{ color: "#64748b" }}>
                First look for a purchase, return or transfer that was never recorded. If there is none, add the extra to stock at its last buying cost.
              </p>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={cell}>Item</th><th style={cell}>Books</th><th style={cell}>Counted</th><th style={cell}>Extra</th></tr></thead>
                <tbody>
                  {extra.map((l) => (
                    <tr key={String(l.id)}>
                      <td style={cell}>{itemName(l)} <span style={{ color: "#64748b" }}>({l.sku})</span></td>
                      <td style={cell}>{qty(l.books_qty)}</td>
                      <td style={cell}>{qty(l.counted_qty)}</td>
                      <td style={{ ...cell, color: "#92400e" }}>{qty(l.difference)}{l.found ? " (added to stock)" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {extra.some((l) => !l.found) && canSettle && (
            <form action={acceptExtraStockAction} style={{ margin: "10px 0" }}>
              <input type="hidden" name="count_id" value={String(count.id)} />
              <ConfirmButton
                label="Add the extra items to stock"
                question="Add the extra items to stock at their last buying cost? The cost is taken off your lost-stock figure."
                className="btn-link btn-link-primary"
              />
            </form>
          )}
          {short.length === 0 && extra.length === 0 && <p style={{ color: "#166534" }}>Everything counted matches the books.</p>}
          <p style={{ marginTop: 12 }}>
            <Link className="btn-link" href={`/accounting/stock-count?location=${place?.id}`}>Start another count</Link>
          </p>
        </section>
      )}

      {place && !count && (
        <form action={saveStockCountAction} style={box}>
          <input type="hidden" name="location_id" value={String(place.id)} />
          <h2>{place.location_name}</h2>
          <p style={{ color: "#64748b" }}>
            Type the number you counted. Leave an item blank if you did not count it. {items.length === 200 ? "Showing the first 200: search to narrow the list." : ""}
          </p>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th style={cell}>Item</th><th style={cell}>Books say</th><th style={cell}>You counted</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={String(i.id)}>
                  <td style={cell}>{itemName(i)} <span style={{ color: "#64748b" }}>({i.sku})</span></td>
                  <td style={cell}>{qty(i.qty)}</td>
                  <td style={cell}>
                    <input name={`counted_${i.id}`} inputMode="decimal" style={{ ...field, width: 100 }} aria-label={`Counted ${i.sku}`} />
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td style={cell} colSpan={3}>No items have ever been stocked here.</td></tr>}
            </tbody>
          </table>
          {items.length > 0 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <input name="note" maxLength={300} placeholder="Note (optional)" style={{ ...field, width: 260 }} />
              <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "10px 20px" }}>
                Save count
              </button>
            </div>
          )}
        </form>
      )}

      <section style={box}>
        <h2>Earlier counts</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={cell}>Count</th><th style={cell}>Date</th><th style={cell}>Place</th><th style={cell}>Items</th><th style={cell}>Differences</th><th style={cell}></th></tr></thead>
          <tbody>
            {recent.map((r) => (
              <tr key={String(r.id)}>
                <td style={cell}>{r.count_no}</td>
                <td style={cell}>{r.d}</td>
                <td style={cell}>{r.location_name}</td>
                <td style={cell}>{r.items}</td>
                <td style={cell}>{Number(r.gaps) === 0 ? "None" : `${r.gaps}${r.status === "SETTLED" ? " (settled)" : ""}`}</td>
                <td style={cell}><Link href={`/accounting/stock-count?location=${r.location_id}&view=${r.id}`}>Open</Link></td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td style={cell} colSpan={6}>No counts yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default function StockCountPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <StockCountContent {...props} />
    </Suspense>
  );
}
