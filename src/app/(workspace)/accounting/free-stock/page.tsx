import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canApproveFreeStock } from "@/lib/access";
import {
  approveFreeStockAction,
  giveStockFreeAction,
  rejectFreeStockAction,
} from "@/lib/free-stock-actions";

type Props = {
  searchParams: Promise<{ location?: string; q?: string; saved?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (value: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };

const STATUS_WORDS: Record<string, string> = {
  WAITING: "Waiting for approval",
  APPROVED: "Given",
  REJECTED: "Turned down",
};

async function FreeStockContent({ searchParams }: Props) {
  const user = await requireAccess("free_stock");
  const businessId = user.legal_business_id;
  const approver = canApproveFreeStock(user.role);
  const query = await searchParams;
  const locationId = Number(query.location);
  const search = (query.q ?? "").trim().slice(0, 60);

  const [locations] = await db.execute<Row[]>(
    `SELECT id, location_name FROM acct_inventory_locations
     WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY location_name`,
    [businessId]
  );
  const place = Number.isInteger(locationId) ? locations.find((l) => Number(l.id) === locationId) : undefined;

  let items: Row[] = [];
  let customers: Row[] = [];
  if (place) {
    const like = `%${search}%`;
    const [rows] = await db.execute<Row[]>(
      `SELECT v.id, v.sku, v.barcode, v.size_label, v.color_name, p.product_name, s.qty
       FROM (SELECT variant_id, SUM(quantity_change) AS qty
               FROM acct_stock_movements
              WHERE legal_business_id = ? AND location_id = ?
              GROUP BY variant_id HAVING SUM(quantity_change) > 0) s
       JOIN acct_product_variants v ON v.id = s.variant_id AND v.legal_business_id = ? AND v.status = 'ACTIVE'
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
       WHERE (? = '' OR p.product_name LIKE ? OR v.sku LIKE ? OR v.barcode = ?)
       ORDER BY p.product_name, v.sku LIMIT 60`,
      [businessId, place.id, businessId, search, like, like, search]
    );
    items = rows;
    const [custRows] = await db.execute<Row[]>(
      `SELECT id, full_name, phone FROM acct_customers
       WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY full_name LIMIT 300`,
      [businessId]
    );
    customers = custRows;
  }

  let waiting: (Row & { items: string })[] = [];
  if (approver) {
    const [rows] = await db.execute<Row[]>(
      `SELECT f.id, f.entry_no, DATE_FORMAT(f.given_date, '%d %b %Y') AS d, f.given_to, f.reason,
              w.location_name, u.full_name AS asked_by,
              (SELECT GROUP_CONCAT(CONCAT(p.product_name, ' (', v.sku, ') x ', l.quantity) SEPARATOR '; ')
                 FROM acct_free_stock_lines l
                 JOIN acct_product_variants v ON v.id = l.variant_id AND v.legal_business_id = l.legal_business_id
                 JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
                WHERE l.free_stock_id = f.id AND l.legal_business_id = f.legal_business_id) AS items
       FROM acct_free_stock f
       JOIN acct_inventory_locations w ON w.id = f.location_id AND w.legal_business_id = f.legal_business_id
       LEFT JOIN acct_app_users u ON u.id = f.requested_by
       WHERE f.legal_business_id = ? AND f.status = 'WAITING'
       ORDER BY f.id`,
      [businessId]
    );
    waiting = rows as (Row & { items: string })[];
  }

  const [recent] = await db.execute<Row[]>(
    `SELECT f.id, f.entry_no, DATE_FORMAT(f.given_date, '%d %b %Y') AS d, f.given_to, f.reason, f.status,
            f.total_cost, w.location_name
     FROM acct_free_stock f
     JOIN acct_inventory_locations w ON w.id = f.location_id AND w.legal_business_id = f.legal_business_id
     WHERE f.legal_business_id = ?
     ORDER BY f.id DESC LIMIT 30`,
    [businessId]
  );
  const [month] = await db.execute<Row[]>(
    `SELECT COALESCE(SUM(total_cost), 0) AS total FROM acct_free_stock
     WHERE legal_business_id = ? AND status = 'APPROVED'
       AND given_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [businessId]
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Give stock free</h1>
      <p style={{ color: "#64748b" }}>
        For gifts, samples, promotions or staff. The cost is booked as a business expense.
        Given free this month: <strong>{inr(month[0].total)}</strong>
      </p>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      {approver && waiting.length > 0 && (
        <section style={{ ...box, borderColor: "#f59e0b" }}>
          <h2>Waiting for your approval ({waiting.length})</h2>
          {waiting.map((w) => (
            <div key={w.id} style={{ borderTop: "1px solid #e2e8f0", padding: "12px 0" }}>
              <strong>{w.entry_no}</strong> · {w.d} · {w.location_name}
              {w.asked_by ? ` · asked by ${w.asked_by}` : ""}
              <div>To: {w.given_to}. Why: {w.reason}</div>
              <div style={{ color: "#64748b" }}>{w.items}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                <form action={approveFreeStockAction}>
                  <input type="hidden" name="entry_id" value={String(w.id)} />
                  <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "10px 20px" }}>
                    Approve
                  </button>
                </form>
                <form action={rejectFreeStockAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input type="hidden" name="entry_id" value={String(w.id)} />
                  <input name="reject_reason" placeholder="Reason (optional)" maxLength={300} style={{ ...field, width: 220 }} />
                  <button type="submit" className="btn-link" style={{ cursor: "pointer", fontSize: 16, padding: "10px 20px" }}>
                    Turn down
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      <section style={box}>
        <h2>1. Where is the stock?</h2>
        <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label>Place<br />
            <select name="location" defaultValue={place ? String(place.id) : ""} required style={field}>
              <option value="" disabled>Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
            </select>
          </label>
          <label>Find an item (name, code or barcode)<br />
            <input name="q" defaultValue={search} placeholder="Optional" style={{ ...field, width: 240 }} />
          </label>
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>
            Show items
          </button>
        </form>
      </section>

      {place && (
        <section style={box}>
          <h2>2. What is going out? {place.location_name}</h2>
          <form action={giveStockFreeAction}>
            <input type="hidden" name="location_id" value={String(place.id)} />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr>{["Item", "In stock", "Give"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td style={cell}>
                        {i.product_name}{" "}
                        <small>({i.sku}{i.size_label ? `, ${i.size_label}` : ""}{i.color_name ? `, ${i.color_name}` : ""})</small>
                      </td>
                      <td style={cell}>{String(i.qty)}</td>
                      <td style={cell}><input name={`qty_${i.id}`} inputMode="decimal" placeholder="0" style={{ ...field, width: 90 }} /></td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td style={cell} colSpan={3}>No stock found here{search ? " for that search" : ""}.</td></tr>}
                </tbody>
              </table>
            </div>
            {items.length === 60 && <p style={{ color: "#64748b" }}>Showing the first 60. Use &ldquo;Find an item&rdquo; to narrow down.</p>}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end", marginTop: 16 }}>
              <label>Date<br /><input type="date" name="given_date" defaultValue={today()} max={today()} required style={field} /></label>
              <label>Given to<br /><input name="given_to" maxLength={150} placeholder="Name" style={{ ...field, width: 220 }} /></label>
              <label>Customer (optional)<br />
                <select name="customer_id" defaultValue="" style={field}>
                  <option value="">— none —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ""}</option>)}
                </select>
              </label>
            </div>
            <p>
              <label>Why<br />
                <input name="reason" required minLength={3} maxLength={300} placeholder="For example: gift to a customer, sample for a shop, staff"
                  style={{ ...field, width: "100%", maxWidth: 560 }} />
              </label>
            </p>
            <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "12px 22px" }}>
              {approver ? "Give stock free" : "Send for approval"}
            </button>
            {!approver && <p style={{ color: "#64748b" }}>Stock changes only after the owner or accountant approves.</p>}
          </form>
        </section>
      )}

      <section style={box}>
        <h2>Earlier entries</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr>{["No.", "Date", "Place", "Given to", "Why", "Cost", "Status"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td style={cell}>{r.entry_no}</td>
                  <td style={cell}>{r.d}</td>
                  <td style={cell}>{r.location_name}</td>
                  <td style={cell}>{r.given_to}</td>
                  <td style={cell}>{r.reason}</td>
                  <td style={cell}>{r.total_cost === null ? "—" : inr(r.total_cost)}</td>
                  <td style={cell}>{STATUS_WORDS[String(r.status)] ?? String(r.status)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td style={cell} colSpan={7}>Nothing given free yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {approver && (
        <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn-link" href="/accounting/stock">Stock on hand</Link>
          <Link className="btn-link" href="/accounting/reports">Profit report</Link>
        </nav>
      )}
    </main>
  );
}

export default function FreeStockPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <FreeStockContent {...props} />
    </Suspense>
  );
}
