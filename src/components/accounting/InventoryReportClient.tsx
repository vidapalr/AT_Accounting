"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type InventoryRow = {
  location_id: number;
  location_name: string;
  location_code: string;
  branch_name: string | null;
  variant_id: number;
  sku: string;
  product_name: string;
  size_label: string | null;
  color_name: string | null;
  unit_of_measure: "PCS" | "SET" | "METER";
  purchased_qty: string;
  transfer_in_qty: string;
  transfer_out_qty: string;
  sales_qty: string;
  sales_return_qty: string;
  purchase_return_qty: string;
  adjustment_in_qty: string;
  adjustment_out_qty: string;
  available_qty: string;
};

export type TransitItem = {
  transfer_no: string;
  source_location: string;
  destination_location: string;
  sku: string;
  product_name: string;
  unit_of_measure: string;
  quantity: string;
};

type Props = {
  scope: "CENTRAL" | "BRANCH" | "ALL";
  stock: InventoryRow[];
  transit: TransitItem[];
  initialFilters?: { q?: string; location?: string; availability?: string };
};

const formatQty = (n: number | string) => Number(n).toLocaleString("en-IN", {
  maximumFractionDigits: 3,
});

const movements: { key: keyof InventoryRow; label: string }[] = [
  { key: "purchased_qty", label: "Purchased" },
  { key: "transfer_in_qty", label: "Transfer In" },
  { key: "transfer_out_qty", label: "Transfer Out" },
  { key: "sales_qty", label: "Sold" },
  { key: "sales_return_qty", label: "Sales Return" },
  { key: "purchase_return_qty", label: "Supplier Return" },
  { key: "adjustment_in_qty", label: "Adjust In" },
  { key: "adjustment_out_qty", label: "Adjust Out" },
];

const stockStatus = (n: number) => n < 0 ? "NEGATIVE STOCK" : n === 0 ? "OUT OF STOCK" : "AVAILABLE";

export default function InventoryReportClient({
  scope, stock, transit, initialFilters = {},
}: Props) {
  const [query, setQuery] = useState(initialFilters.q ?? "");
  const [location, setLocation] = useState(initialFilters.location ?? "");
  const [availability, setAvailability] = useState(initialFilters.availability ?? "ALL");
  const [unit, setUnit] = useState("ALL");
  type HistoryItem = { id: number; movement_type: string; quantity_change: string; source_type: string | null; source_id: string | null; source_line_id: string | null; event_date: string | null };
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState("0");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const locations = useMemo(() => {
    const unique = new Map<number, string>();
    stock.forEach(r => unique.set(r.location_id,
      r.branch_name ? `${r.branch_name} — ${r.location_name}` : r.location_name));
    return [...unique].sort((a, b) => a[1].localeCompare(b[1]));
  }, [stock]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return stock.filter(r => {
      const text = [r.product_name, r.sku, r.size_label, r.color_name,
        r.location_name, r.location_code, r.branch_name, r.unit_of_measure]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      if (terms.some(term => !text.includes(term))) return false;
      if (location && String(r.location_id) !== location) return false;
      if (unit !== "ALL" && r.unit_of_measure !== unit) return false;
      const n = Number(r.available_qty);
      if (availability === "AVAILABLE" && n <= 0) return false;
      if (availability === "OUT_OF_STOCK" && n !== 0) return false;
      if (availability === "NEGATIVE" && n >= 0) return false;
      return true;
    });
  }, [stock, query, location, availability, unit]);

  const totals = useMemo(() => ({
    PCS: filtered.filter(r => r.unit_of_measure === "PCS").reduce((s, r) => s + Number(r.available_qty), 0),
    SET: filtered.filter(r => r.unit_of_measure === "SET").reduce((s, r) => s + Number(r.available_qty), 0),
    METER: filtered.filter(r => r.unit_of_measure === "METER").reduce((s, r) => s + Number(r.available_qty), 0),
    available: filtered.filter(r => Number(r.available_qty) > 0).length,
    out: filtered.filter(r => Number(r.available_qty) === 0).length,
    negative: filtered.filter(r => Number(r.available_qty) < 0).length,
  }), [filtered]);

  const numPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, numPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const change = (fn: () => void) => { fn(); setPage(1); };
  const reset = () => change(() => { setQuery(""); setLocation(""); setAvailability("ALL"); setUnit("ALL"); });

  const openHistory = async (r: InventoryRow, requestedPage = 1) => {
    const key = `${r.location_id}:${r.variant_id}`;
    setHistoryKey(key);
    setHistoryTitle(`${r.product_name} · ${r.sku} · ${r.location_name}`);
    setHistoryLoading(true);
    setHistoryError("");
    setHistory([]);
    const params = new URLSearchParams({
      locationId: String(r.location_id), variantId: String(r.variant_id),
      scope, page: String(requestedPage),
    });
    try {
      const res = await fetch(`/api/accounting/inventory-history?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Unable to load history (${res.status})`);
      const data = await res.json() as { rows: HistoryItem[]; total: string; hasMore: boolean };
      setHistory(data.rows);
      setHistoryTotal(data.total);
      setHistoryHasMore(data.hasMore);
      setHistoryPage(requestedPage);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to load history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const exportCsv = () => {
    const headers = ["Product", "SKU", "Location", "Size", "Color", "Unit", ...movements.map(m => m.label), "Available", "Status", "Reconciliation"];
    const safeCell = (value: unknown) => {
      let text = String(value ?? "");
      // Prefix untrusted Excel formula expressions to prevent CSV injection.
      if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) && !/^-[0-9]+(?:\.[0-9]+)?$/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const lines = filtered.map(r => {
      const expected = Number(r.purchased_qty) + Number(r.transfer_in_qty) - Number(r.transfer_out_qty)
        - Number(r.sales_qty) + Number(r.sales_return_qty) - Number(r.purchase_return_qty)
        + Number(r.adjustment_in_qty) - Number(r.adjustment_out_qty);
      const diff = Math.round((Number(r.available_qty) - expected) * 1000) / 1000;
      return [r.product_name, r.sku, r.location_name, r.size_label, r.color_name, r.unit_of_measure,
        ...movements.map(m => String(r[m.key])), r.available_qty, stockStatus(Number(r.available_qty)),
        Math.abs(diff) < 0.0005 ? "MATCH" : `DIFFERENCE ${diff}`].map(safeCell).join(",");
    });
    const csv = "\uFEFF" + [headers.map(safeCell).join(","), ...lines].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scope === "ALL" ? "stock-on-hand" : scope === "CENTRAL" ? "central-inventory" : "branch-inventory"}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const reconcileCount = filtered.filter(r => {
    const expected = Number(r.purchased_qty) + Number(r.transfer_in_qty) - Number(r.transfer_out_qty)
      - Number(r.sales_qty) + Number(r.sales_return_qty) - Number(r.purchase_return_qty)
      + Number(r.adjustment_in_qty) - Number(r.adjustment_out_qty);
    return Math.abs(Number(r.available_qty) - expected) >= 0.0005;
  }).length;

  return (
    <main className="ir-page">
      <div className="ir-header">
        <div>
          <div className="ir-eyebrow">ABHIRAM TEXTILES · INVENTORY</div>
          <h1>{scope === "ALL" ? "Stock on Hand" : scope === "CENTRAL" ? "Central Warehouse Inventory" : "Branch Inventory"}</h1>
          <p>Balances from posted inventory movements. In-transit stock is shown separately.</p>
        </div>
        <nav className="ir-nav" aria-label="Inventory navigation">
          <Link href="/accounting/stock-transfers">Stock Transfers</Link>
        </nav>
      </div>

      <section className="ir-summary" aria-label="Inventory summary">
        <div><span>Available PCS</span><strong>{formatQty(totals.PCS)}</strong></div>
        <div><span>Available SET</span><strong>{formatQty(totals.SET)}</strong></div>
        <div><span>Available METER</span><strong>{formatQty(totals.METER)}</strong></div>
        <div><span>Matching SKUs / locations</span><strong>{formatQty(filtered.length)}</strong></div>
        <div><span>Out of stock</span><strong>{formatQty(totals.out)}</strong></div>
      </section>

      <section className="ir-panel" aria-label="Stock filters">
        <div className="ir-filters">
          <label className="ir-search"><span>Search products / SKU</span>
            <input type="search" value={query} placeholder="Type a name, SKU, size, colour or location…"
              onChange={e => change(() => setQuery(e.target.value))} aria-label="Search inventory" />
          </label>
          <label><span>Location</span>
            <select value={location} onChange={e => change(() => setLocation(e.target.value))}>
              <option value="">All locations</option>
              {locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label><span>Stock Status</span>
            <select value={availability} onChange={e => change(() => setAvailability(e.target.value))}>
              <option value="ALL">All Stock</option><option value="AVAILABLE">Available</option>
              <option value="OUT_OF_STOCK">Out of Stock</option><option value="NEGATIVE">Negative Stock</option>
            </select>
          </label>
          <label><span>Unit</span>
            <select value={unit} onChange={e => change(() => setUnit(e.target.value))}>
              <option value="ALL">All Units</option><option value="PCS">PCS</option>
              <option value="SET">SET</option><option value="METER">METER</option>
            </select>
          </label>
          <button type="button" className="ir-reset" onClick={reset}>Clear filters</button>
        </div>
        <div className="ir-filter-note" role="status">Showing {filtered.length} matching records. Search and filters update instantly.</div>
      </section>

      <section className="ir-panel ir-table-panel" aria-label="Inventory records">
        <div className="ir-table-title"><h2>Stock Ledger Summary</h2><div className="ir-header-tools"><span>Reconciliation: {reconcileCount === 0 ? "All displayed rows match" : `${reconcileCount} mismatches`}</span><button type="button" className="ir-export" onClick={exportCsv} disabled={filtered.length === 0}>Export filtered CSV (Excel)</button></div></div>
        <div className="ir-table-scroll" tabIndex={0} role="region" aria-label="Scrollable inventory table">
          <table className="ir-table">
            <thead><tr>
              <th className="ir-sticky-col">Product</th><th>SKU</th><th>Location</th>
              <th>Size</th><th>Color</th><th>Unit</th>
              {movements.map(m => <th className="ir-number" key={m.key}>{m.label}</th>)}
              <th className="ir-number">Available</th><th>Status</th>
            </tr></thead>
            <tbody>
              {visible.map(r => {
                const n = Number(r.available_qty);
                return <tr key={`${r.location_id}-${r.variant_id}`}>
                  <td className="ir-sticky-col ir-product">{r.product_name}</td>
                  <td className="ir-sku"><button type="button" className="ir-sku-button" onClick={() => openHistory(r)} title="View stock movement history">{r.sku}</button></td>
                  <td title={`${r.branch_name ?? "Warehouse"} — ${r.location_name}`}>
                    {r.branch_name ? `${r.branch_name} — ` : ""}{r.location_name}
                  </td>
                  <td>{r.size_label || "—"}</td><td>{r.color_name || "—"}</td>
                  <td>{r.unit_of_measure}</td>
                  {movements.map(m => <td className="ir-number" key={m.key}>{formatQty(String(r[m.key]))}</td>)}
                  <td className="ir-number ir-available">{formatQty(n)}</td>
                  <td><span className={`ir-status ${n > 0 ? "ir-ok" : n < 0 ? "ir-negative" : "ir-out"}`}>
                    {stockStatus(n)}</span></td>
                </tr>;
              })}
              {visible.length === 0 && <tr><td colSpan={16} className="ir-empty">No matching stock. Try clearing the filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ir-pagination">
          <span>Page {currentPage} of {numPages} · {filtered.length} records</span>
          <div><button type="button" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</button>
            <button type="button" disabled={currentPage === numPages} onClick={() => setPage(p => Math.min(numPages, p + 1))}>Next</button></div>
        </div>
      </section>

      {historyKey && <div className="ir-modal-backdrop" onClick={() => setHistoryKey(null)}>
        <section className="ir-history-modal" role="dialog" aria-modal="true" aria-label="SKU movement history" onClick={e => e.stopPropagation()}>
          <div className="ir-history-head"><div><h2>Stock movement history</h2><p>{historyTitle}</p></div><button type="button" onClick={() => setHistoryKey(null)} aria-label="Close history">✕</button></div>
          <p className="ir-history-note">Posted movement ledger; signed quantity is added to or removed from stock. {historyTotal} movements in total.</p>
          {historyLoading ? <p>Loading history…</p> : historyError ? <p role="alert">{historyError}</p> :
            <div className="ir-table-scroll"><table className="ir-table ir-history-table"><thead><tr><th>Movement ID</th><th>Date</th><th>Movement</th><th className="ir-number">Quantity +/-</th><th>Source</th><th>Source ID</th><th>Line ID</th></tr></thead>
              <tbody>{history.map(h => <tr key={h.id}><td>{h.id}</td><td>{h.event_date ?? "—"}</td><td>{h.movement_type.replaceAll("_", " ")}</td><td className="ir-number">{formatQty(h.quantity_change)}</td><td>{h.source_type ?? "—"}</td><td>{h.source_id ?? "—"}</td><td>{h.source_line_id ?? "—"}</td></tr>)}
              {history.length === 0 && <tr><td colSpan={7}>No history for this SKU at this location.</td></tr>}</tbody></table></div>}
          <div className="ir-pagination"><span>History page {historyPage}</span><div>
            <button type="button" disabled={historyLoading || historyPage <= 1} onClick={() => { const [loc, variant] = historyKey.split(":").map(Number); const r = stock.find(row => row.location_id === loc && row.variant_id === variant); if(r) void openHistory(r, historyPage - 1); }}>Previous</button>
            <button type="button" disabled={historyLoading || !historyHasMore} onClick={() => { const [loc, variant] = historyKey.split(":").map(Number); const r = stock.find(row => row.location_id === loc && row.variant_id === variant); if(r) void openHistory(r, historyPage + 1); }}>Next</button>
          </div></div>
        </section>
      </div>}
      <section className="ir-panel ir-transit">
        <div className="ir-table-title"><h2>Stock in Transit</h2><span>{transit.length} transfer lines</span></div>
        <p>Dispatched but not yet received. Not included in destination's available stock.</p>
        {transit.length === 0 ? <div className="ir-empty">No stock currently in transit.</div> :
          <div className="ir-table-scroll" tabIndex={0} role="region" aria-label="Scrollable transit table">
            <table className="ir-table ir-transit-table"><thead><tr>
              <th>Transfer</th><th>From</th><th>To</th><th>Product</th><th>SKU</th><th className="ir-number">Quantity</th>
            </tr></thead><tbody>{transit.map((r, i) => <tr key={`${r.transfer_no}-${r.sku}-${i}`}>
              <td>{r.transfer_no}</td><td>{r.source_location}</td><td>{r.destination_location}</td>
              <td>{r.product_name}</td><td className="ir-sku">{r.sku}</td><td className="ir-number">{formatQty(r.quantity)} {r.unit_of_measure}</td>
            </tr>)}</tbody></table>
          </div>}
      </section>
    </main>
  );
}
