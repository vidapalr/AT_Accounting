import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { handOutItemsAction, receiveBackAction } from "@/lib/approval-actions";
import ConfirmButton from "@/components/ConfirmButton";

type Props = {
  searchParams: Promise<{ location?: string; q?: string; saved?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (value: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const bigBtn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "10px 18px" };

const STATUS_WORDS: Record<string, string> = {
  KEPT: "Bought it",
  RETURNED: "Returned",
  DAMAGED: "Returned damaged",
};

async function ApprovalContent({ searchParams }: Props) {
  const user = await requireAccess("approval_items");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const locationId = Number(query.location);
  const search = (query.q ?? "").trim().slice(0, 60);

  const [locations] = await db.execute<Row[]>(
    `SELECT id, location_name FROM acct_inventory_locations
     WHERE legal_business_id = ? AND status = 'ACTIVE' AND location_type <> 'OTHER'
     ORDER BY location_name`,
    [businessId]
  );
  const place = Number.isInteger(locationId) ? locations.find((l) => Number(l.id) === locationId) : undefined;

  let stockItems: Row[] = [];
  if (place) {
    const like = `%${search}%`;
    const [rows] = await db.execute<Row[]>(
      `SELECT v.id, v.sku, v.size_label, v.color_name, p.product_name, s.qty
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
    stockItems = rows;
  }

  // Everything still with a customer.
  const [out] = await db.execute<Row[]>(
    `SELECT i.id, i.handout_id, i.quantity, i.total_cost,
            h.handout_no, c.full_name, c.phone,
            DATE_FORMAT(h.handed_date, '%d %b %Y') AS handed,
            DATE_FORMAT(h.expected_back, '%d %b %Y') AS due,
            DATEDIFF(CURDATE(), h.expected_back) AS days_late,
            v.sku, p.product_name
       FROM acct_approval_items i
       JOIN acct_approval_handouts h ON h.id = i.handout_id AND h.legal_business_id = i.legal_business_id
       JOIN acct_customers c ON c.id = i.customer_id AND c.legal_business_id = i.legal_business_id
       JOIN acct_product_variants v ON v.id = i.variant_id AND v.legal_business_id = i.legal_business_id
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE i.legal_business_id = ? AND i.status = 'OUT'
      ORDER BY h.expected_back, h.id, i.id`,
    [businessId]
  );

  type Group = { id: number; no: string; name: string; phone: string | null; handed: string; due: string; late: number; items: Row[] };
  const groups: Group[] = [];
  for (const r of out) {
    let g = groups.find((x) => x.id === Number(r.handout_id));
    if (!g) {
      g = {
        id: Number(r.handout_id), no: String(r.handout_no), name: String(r.full_name),
        phone: r.phone ? String(r.phone) : null, handed: String(r.handed), due: String(r.due),
        late: Number(r.days_late), items: [],
      };
      groups.push(g);
    }
    g.items.push(r);
  }
  const lateCount = groups.filter((g) => g.late > 0).length;
  const outValue = out.reduce((sum, r) => sum + Number(r.total_cost), 0);

  const [closed] = await db.execute<Row[]>(
    `SELECT i.id, i.quantity, i.status, i.note, DATE_FORMAT(i.closed_date, '%d %b %Y') AS closed_on,
            h.handout_no, c.full_name, v.sku, p.product_name
       FROM acct_approval_items i
       JOIN acct_approval_handouts h ON h.id = i.handout_id AND h.legal_business_id = i.legal_business_id
       JOIN acct_customers c ON c.id = i.customer_id AND c.legal_business_id = i.legal_business_id
       JOIN acct_product_variants v ON v.id = i.variant_id AND v.legal_business_id = i.legal_business_id
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE i.legal_business_id = ? AND i.status <> 'OUT'
      ORDER BY i.closed_date DESC, i.id DESC LIMIT 30`,
    [businessId]
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Items on approval</h1>
      <p style={{ color: "#64748b" }}>
        For customers who take items home to try. No payment now. The items leave the shop shelf but are still ours.
        When the customer decides, tap what happened to each item.
        {out.length > 0 && <> With customers now: <strong>{out.length}</strong> item line(s), cost {inr(outValue)}.</>}
      </p>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <section style={{ ...box, borderColor: lateCount > 0 ? "#f59e0b" : "#e2e8f0" }}>
        <h2>With customers now{lateCount > 0 ? ` — ${lateCount} overdue` : ""}</h2>
        {groups.length === 0 && <p>No items are out with customers.</p>}
        {groups.map((g) => {
          const names = g.items.map((i) => `${i.product_name} x ${Number(i.quantity)}`).join(", ");
          const message =
            `Hello ${g.name}, this is Abhiram Textiles. You took ${names} from us on ${g.handed} to try at home. ` +
            `Please let us know if you would like to keep them, or bring them back. Thank you!`;
          const wa = g.phone ? `https://wa.me/91${g.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(message)}` : null;
          return (
            <div key={g.id} style={{ borderTop: "1px solid #e2e8f0", padding: "14px 0" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <strong>{g.name}</strong> {g.phone ? `· ${g.phone}` : ""} · {g.no}
                  <div style={{ color: g.late > 0 ? "#b91c1c" : "#64748b" }}>
                    Took them {g.handed}. Due back {g.due}
                    {g.late > 0 ? ` — ${g.late} day${g.late === 1 ? "" : "s"} late` : ""}.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {wa && (
                    <a className="btn-link" href={wa} target="_blank" rel="noreferrer">
                      Remind on WhatsApp
                    </a>
                  )}
                  <Link
                    className="btn-link btn-link-primary"
                    href={`/accounting/sales?from_approval=${g.items.map((i) => i.id).join(",")}`}
                  >
                    Keeps everything — make the bill
                  </Link>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, marginTop: 8 }}>
                  <tbody>
                    {g.items.map((i) => (
                      <tr key={i.id}>
                        <td style={cell}>
                          {i.product_name} <small>({i.sku})</small>
                        </td>
                        <td style={cell}>Qty {Number(i.quantity)}</td>
                        <td style={cell}>
                          <Link className="btn-link" href={`/accounting/sales?from_approval=${i.id}`}>
                            Keeps it
                          </Link>
                        </td>
                        <td style={cell}>
                          <form action={receiveBackAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <input type="hidden" name="item_id" value={String(i.id)} />
                            <input type="hidden" name="outcome" value="RETURNED" />
                            <input
                              name="quantity"
                              inputMode="decimal"
                              placeholder={`All (${Number(i.quantity)})`}
                              style={{ ...field, width: 100 }}
                              aria-label="How many came back"
                            />
                            <button type="submit" className="btn-link" style={bigBtn}>Came back fine</button>
                          </form>
                        </td>
                        <td style={cell}>
                          <form action={receiveBackAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <input type="hidden" name="item_id" value={String(i.id)} />
                            <input type="hidden" name="outcome" value="DAMAGED" />
                            <input name="quantity" inputMode="decimal" placeholder="All" style={{ ...field, width: 80 }} aria-label="How many came back damaged" />
                            <ConfirmButton label="Came back damaged" question="Write this item off as damaged stock?" />
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        {groups.length > 0 && (
          <p style={{ color: "#64748b", marginBottom: 0 }}>
            If the customer keeps only some, mark the others as back first, then make the bill for the rest.
          </p>
        )}
      </section>

      <section style={box}>
        <h2>Hand out items</h2>
        <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label>Where are the items now?<br />
            <select name="location" defaultValue={place ? String(place.id) : ""} required style={field}>
              <option value="" disabled>Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
            </select>
          </label>
          <label>Find an item (name, code or barcode)<br />
            <input name="q" defaultValue={search} placeholder="Optional" style={{ ...field, width: 240 }} />
          </label>
          <button type="submit" className="btn-link btn-link-primary" style={bigBtn}>Show items</button>
        </form>

        {place && (
          <form action={handOutItemsAction} style={{ marginTop: 16 }}>
            <input type="hidden" name="location_id" value={String(place.id)} />
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr>{["Item", "In stock", "Taking"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                <tbody>
                  {stockItems.map((i) => (
                    <tr key={i.id}>
                      <td style={cell}>
                        {i.product_name}{" "}
                        <small>({i.sku}{i.size_label ? `, ${i.size_label}` : ""}{i.color_name ? `, ${i.color_name}` : ""})</small>
                      </td>
                      <td style={cell}>{String(i.qty)}</td>
                      <td style={cell}><input name={`qty_${i.id}`} inputMode="decimal" placeholder="0" style={{ ...field, width: 90 }} /></td>
                    </tr>
                  ))}
                  {stockItems.length === 0 && <tr><td style={cell} colSpan={3}>No stock found here{search ? " for that search" : ""}.</td></tr>}
                </tbody>
              </table>
            </div>
            {stockItems.length === 60 && <p style={{ color: "#64748b" }}>Showing the first 60. Use &ldquo;Find an item&rdquo; to narrow down.</p>}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end", marginTop: 16 }}>
              <label>Customer mobile (10 digits)<br />
                <input name="customer_phone" inputMode="numeric" required maxLength={20} placeholder="98xxxxxxxx" style={{ ...field, width: 190 }} />
              </label>
              <label>Customer name (if new)<br />
                <input name="customer_name" maxLength={150} placeholder="Name" style={{ ...field, width: 220 }} />
              </label>
              <label>Date<br /><input type="date" name="handed_date" defaultValue={today()} max={today()} required style={field} /></label>
              <label>Due back by<br /><input type="date" name="expected_back" defaultValue={plusDays(3)} required style={field} /></label>
            </div>
            <p>
              <label>Note (optional)<br />
                <input name="remarks" maxLength={300} placeholder="For example: wants to match with her sari" style={{ ...field, width: "100%", maxWidth: 560 }} />
              </label>
            </p>
            <button type="submit" className="btn-link btn-link-primary" style={{ ...bigBtn, padding: "12px 22px" }}>
              Hand out items
            </button>
          </form>
        )}
      </section>

      <section style={box}>
        <h2>Earlier results</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead><tr>{["Date", "No.", "Customer", "Item", "Qty", "What happened"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {closed.map((r) => (
                <tr key={r.id}>
                  <td style={cell}>{r.closed_on}</td>
                  <td style={cell}>{r.handout_no}</td>
                  <td style={cell}>{r.full_name}</td>
                  <td style={cell}>{r.product_name} <small>({r.sku})</small></td>
                  <td style={cell}>{Number(r.quantity)}</td>
                  <td style={cell}>{STATUS_WORDS[String(r.status)] ?? String(r.status)}</td>
                </tr>
              ))}
              {closed.length === 0 && <tr><td style={cell} colSpan={6}>Nothing finished yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn-link" href="/accounting/sales">New bill</Link>
        <Link className="btn-link" href="/accounting/customers">Customers</Link>
      </nav>
    </main>
  );
}

export default function ApprovalItemsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ApprovalContent {...props} />
    </Suspense>
  );
}
