import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { createSupplierReturnAction } from "@/lib/supplier-return-actions";

type Props = {
  searchParams: Promise<{ purchase?: string; location?: string; saved?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (value: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };

const REASONS: Record<string, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  EXTRA: "Extra / not needed",
  OTHER: "Other",
};

async function SupplierReturnsContent({ searchParams }: Props) {
  const user = await requireAccess("supplier_returns");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const purchaseId = Number(query.purchase);
  const wantedLocation = Number(query.location);

  const [bills] = await db.execute<Row[]>(
    `SELECT h.id, h.purchase_no, s.supplier_name,
            DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%d %b %Y') AS d,
            COALESCE((SELECT SUM(l.line_amount) FROM acct_purchase_lines l
                      WHERE l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id), 0) AS total
     FROM acct_purchase_headers h
     JOIN acct_suppliers s ON s.id = h.supplier_id AND s.legal_business_id = h.legal_business_id
     WHERE h.legal_business_id = ? AND h.status = 'POSTED'
     ORDER BY COALESCE(h.received_date, h.invoice_date) DESC, h.id DESC LIMIT 150`,
    [businessId]
  );

  const [places] = await db.execute<Row[]>(
    `SELECT id, location_name FROM acct_inventory_locations
     WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY location_name`,
    [businessId]
  );

  let bill: Row | undefined;
  let lines: Row[] = [];
  let sendFromId = 0;
  if (Number.isInteger(purchaseId) && purchaseId > 0) {
    const [rows] = await db.execute<Row[]>(
      `SELECT h.id, h.purchase_no, s.supplier_name, h.supplier_invoice_no, w.location_name,
              h.receiving_location_id,
              DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%Y-%m-%d') AS d
       FROM acct_purchase_headers h
       JOIN acct_suppliers s ON s.id = h.supplier_id AND s.legal_business_id = h.legal_business_id
       JOIN acct_inventory_locations w ON w.id = h.receiving_location_id AND w.legal_business_id = h.legal_business_id
       WHERE h.id = ? AND h.legal_business_id = ? AND h.status = 'POSTED'`,
      [purchaseId, businessId]
    );
    bill = rows[0];
    if (bill) {
      sendFromId = places.some((p) => Number(p.id) === wantedLocation) ? wantedLocation : Number(bill.receiving_location_id);
      const [lineRows] = await db.execute<Row[]>(
        `SELECT l.id, p.product_name, v.sku, v.size_label, v.color_name, l.quantity, l.unit_cost,
                COALESCE((
                  SELECT SUM(rl.quantity) FROM acct_supplier_return_lines rl
                  JOIN acct_supplier_returns r ON r.id = rl.return_id
                  WHERE rl.purchase_line_id = l.id AND r.status = 'POSTED'
                    AND rl.legal_business_id = l.legal_business_id
                ), 0) AS returned,
                COALESCE((
                  SELECT SUM(m.quantity_change) FROM acct_stock_movements m
                  WHERE m.legal_business_id = l.legal_business_id AND m.location_id = ?
                    AND m.variant_id = l.variant_id
                ), 0) AS in_stock
         FROM acct_purchase_lines l
         JOIN acct_product_variants v ON v.id = l.variant_id AND v.legal_business_id = l.legal_business_id
         JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
         WHERE l.purchase_id = ? AND l.legal_business_id = ?
         ORDER BY l.line_no`,
        [sendFromId, purchaseId, businessId]
      );
      lines = lineRows;
    }
  }

  const [recent] = await db.execute<Row[]>(
    `SELECT r.id, r.return_no, DATE_FORMAT(r.return_date, '%d %b %Y') AS d, s.supplier_name,
            h.purchase_no, r.agreed_value,
            COALESCE((SELECT SUM(f.amount) FROM acct_supplier_refunds f
                      WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0) AS refunded
     FROM acct_supplier_returns r
     JOIN acct_suppliers s ON s.id = r.supplier_id AND s.legal_business_id = r.legal_business_id
     LEFT JOIN acct_purchase_headers h ON h.id = r.purchase_id AND h.legal_business_id = r.legal_business_id
     WHERE r.legal_business_id = ? AND r.status = 'POSTED'
     ORDER BY r.return_date DESC, r.id DESC LIMIT 40`,
    [businessId]
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Return goods to a supplier</h1>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <h2>1. Pick the purchase the goods came from</h2>
        <p style={{ color: "#64748b" }}>
          Stock goes back at the price you paid. What you owe the supplier goes down by the
          value he agrees. You choose later whether he gives credit, a refund or replacement items.
        </p>
        <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ flex: "1 1 320px" }}>Purchase<br />
            <select name="purchase" defaultValue={bill ? String(bill.id) : ""} style={{ ...field, width: "100%" }}>
              <option value="">Choose…</option>
              {bills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.purchase_no} · {b.d} · {b.supplier_name} · {inr(b.total)}
                </option>
              ))}
            </select>
          </label>
          <label>Goods are now at<br />
            <select name="location" defaultValue={sendFromId ? String(sendFromId) : ""} style={field}>
              <option value="">Where they were received</option>
              {places.map((p) => <option key={p.id} value={p.id}>{p.location_name}</option>)}
            </select>
          </label>
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>
            Show items
          </button>
        </form>
        {bills.length === 0 && <p>No received purchases yet, so there is nothing to return.</p>}
      </section>

      {bill && (
        <section style={box}>
          <h2>2. What is going back? {bill.purchase_no} · {bill.supplier_name}</h2>
          <form action={createSupplierReturnAction}>
            <input type="hidden" name="purchase_id" value={String(bill.id)} />
            <input type="hidden" name="location_id" value={String(sendFromId)} />
            <p style={{ color: "#64748b" }}>
              Sending back from: <strong>{places.find((p) => Number(p.id) === sendFromId)?.location_name ?? "—"}</strong>.
              Goods moved to a shop? Change &ldquo;Goods are now at&rdquo; above and press Show items.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    {["Item", "Bought", "Already sent back", "In stock there", "Cost each", "Send back now"].map((h) => (
                      <th key={h} style={cell}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td style={cell}>
                        {l.product_name}{" "}
                        <small>({l.sku}{l.size_label ? `, ${l.size_label}` : ""}{l.color_name ? `, ${l.color_name}` : ""})</small>
                      </td>
                      <td style={cell}>{String(l.quantity)}</td>
                      <td style={cell}>{String(l.returned)}</td>
                      <td style={cell}>{String(l.in_stock)}</td>
                      <td style={cell}>{inr(l.unit_cost)}</td>
                      <td style={cell}>
                        <input name={`qty_${l.id}`} inputMode="decimal" placeholder="0" style={{ ...field, width: 90 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end", marginTop: 16 }}>
              <label>Date<br /><input type="date" name="return_date" defaultValue={today()} max={today()} required style={field} /></label>
              <label>Why<br />
                <select name="reason" required defaultValue="" style={field}>
                  <option value="" disabled>Choose…</option>
                  {Object.entries(REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Value the supplier agrees (₹)<br />
                <input name="agreed_value" inputMode="decimal" placeholder="Leave empty for full cost" style={{ ...field, width: 220 }} />
              </label>
              <label>Supplier&rsquo;s credit note number (if he gave one)<br />
                <input name="supplier_note_no" maxLength={100} style={{ ...field, width: 220 }} />
              </label>
            </div>
            <p>
              <label>Note<br /><input name="remarks" maxLength={500} style={{ ...field, width: "100%", maxWidth: 560 }} /></label>
            </p>
            <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "12px 22px" }}>
              Save and make debit note
            </button>
          </form>
        </section>
      )}

      <section style={box}>
        <h2>Earlier returns</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>{["Debit note", "Date", "Supplier", "Purchase", "Credit", "Refund received"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td style={cell}><Link href={`/accounting/supplier-returns/${r.id}`}>{r.return_no}</Link></td>
                  <td style={cell}>{r.d}</td>
                  <td style={cell}>{r.supplier_name}</td>
                  <td style={cell}>{r.purchase_no ?? "—"}</td>
                  <td style={cell}>{inr(r.agreed_value)}</td>
                  <td style={cell}>{inr(r.refunded)}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td style={cell} colSpan={6}>Nothing returned yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn-link" href="/accounting/supplier-statement">Supplier statement</Link>
        <Link className="btn-link" href="/accounting/purchase-management">Supplier bills and payments</Link>
      </nav>
    </main>
  );
}

export default function SupplierReturnsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SupplierReturnsContent {...props} />
    </Suspense>
  );
}
