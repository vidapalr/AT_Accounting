import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { updateOnlineOrderAction } from "@/lib/online-order-actions";
import { normalizePhone, whatsappLink } from "@/lib/whatsapp/core";

type Row = RowDataPacket & Record<string, string | number | null>;
type Props = { searchParams: Promise<{ status?: string; saved?: string; error?: string }> };

const STATUSES = ["REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"] as const;
const WORDS: Record<string, string> = { REQUESTED: "New", CONFIRMED: "Confirmed", COMPLETED: "Done", CANCELLED: "Cancelled" };
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "14px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const bigBtn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "10px 18px" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("online_orders");
  const businessId = user.legal_business_id;
  const q = await searchParams;
  const status = (STATUSES as readonly string[]).includes(q.status ?? "") ? String(q.status) : "REQUESTED";

  const [counts] = await db.execute<Row[]>(
    `SELECT status, COUNT(*) AS n FROM acct_online_orders WHERE legal_business_id = ? GROUP BY status`, [businessId]
  );
  const count = (s: string) => Number(counts.find((c) => c.status === s)?.n ?? 0);
  const [orders] = await db.execute<Row[]>(
    `SELECT id, order_no, status, customer_name, phone, email, country, address_line, city, state_region, postal_code,
            customer_note, items_total, shipping_charge, staff_note, DATE_FORMAT(created_at, '%d %b %Y, %H:%i') AS at
       FROM acct_online_orders WHERE legal_business_id = ? AND status = ? ORDER BY created_at DESC LIMIT 100`,
    [businessId, status]
  );
  const ids = orders.map((o) => Number(o.id));
  const [lines] = ids.length
    ? await db.query<Row[]>(`SELECT order_id, product_name, detail, quantity, unit_price FROM acct_online_order_lines WHERE order_id IN (?) ORDER BY id`, [ids])
    : [[] as Row[]];

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Online orders</h1>
      <p style={{ color: "#64748b" }}>
        Orders customers send from the website. Reply on WhatsApp, confirm with the shipping charge, make the bill on{" "}
        <Link href="/accounting/sales">New sale</Link>, then mark the order done. Nothing changes in stock or the books until you make that bill.
      </p>
      {q.saved && <p style={{ color: "#166534" }}>{q.saved.slice(0, 200)}</p>}
      {q.error && <p style={{ color: "#b91c1c" }}>{q.error.slice(0, 200)}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STATUSES.map((s) => (
          <Link key={s} href={`/accounting/online-orders?status=${s}`} className="btn-link btn-link-small"
            style={s === status ? { fontWeight: 700, textDecoration: "underline" } : undefined}>
            {WORDS[s]} ({count(s)})
          </Link>
        ))}
      </div>

      {orders.length === 0 && <p style={{ marginTop: 16 }}>No {WORDS[status].toLowerCase()} orders.</p>}
      {orders.map((o) => {
        const my = lines.filter((l) => Number(l.order_id) === Number(o.id));
        const phone = normalizePhone(String(o.phone));
        const items = Number(o.items_total);
        const ship = Number(o.shipping_charge);
        const msg =
          o.status === "REQUESTED"
            ? `Hello ${o.customer_name}, thank you for your order ${o.order_no} at Abhiram Textiles. We are checking availability and shipping to ${o.country} and will confirm shortly.`
            : `Hello ${o.customer_name}, your order ${o.order_no} is confirmed. Items ${inr(items)}, shipping ${inr(ship)}, total ${inr(items + ship)}. Please let us know when you are ready to pay.`;
        return (
          <section key={String(o.id)} style={box}>
            <h2 style={{ marginTop: 0 }}>{String(o.order_no)} · {String(o.customer_name)}</h2>
            <p style={{ color: "#64748b", margin: "0 0 8px" }}>{String(o.at)}</p>
            <p style={{ margin: "0 0 8px" }}>
              {String(o.phone)}{o.email ? ` · ${o.email}` : ""}<br />
              {String(o.address_line)}, {String(o.city)}{o.state_region ? `, ${o.state_region}` : ""} {o.postal_code ?? ""}<br />
              <strong>{String(o.country)}</strong>
            </p>
            {o.customer_note && <p>Customer note: {String(o.customer_note)}</p>}
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {my.map((l, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 0" }}>{String(l.product_name)}{l.detail ? ` (${l.detail})` : ""} × {Number(l.quantity)}</td>
                    <td style={{ textAlign: "right" }}>{inr(Number(l.unit_price) * Number(l.quantity))}</td>
                  </tr>
                ))}
                <tr><td><strong>Items</strong></td><td style={{ textAlign: "right" }}><strong>{inr(items)}</strong></td></tr>
                {o.status !== "REQUESTED" && <tr><td>Shipping</td><td style={{ textAlign: "right" }}>{inr(ship)}</td></tr>}
                {o.status !== "REQUESTED" && <tr><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>{inr(items + ship)}</strong></td></tr>}
              </tbody>
            </table>
            {o.staff_note && <p>Our note: {String(o.staff_note)}</p>}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
              {phone && o.status !== "CANCELLED" && (
                <a className="btn-link btn-link-primary" style={bigBtn} href={whatsappLink(phone, msg)} target="_blank" rel="noreferrer">Reply on WhatsApp</a>
              )}
              {o.email && (
                <a className="btn-link" style={bigBtn} href={`mailto:${o.email}?subject=${encodeURIComponent(`Your Abhiram Textiles order ${o.order_no}`)}&body=${encodeURIComponent(msg)}`}>Email</a>
              )}
            </div>

            {o.status === "REQUESTED" && (
              <form action={updateOnlineOrderAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
                <input type="hidden" name="order_id" value={String(o.id)} />
                <label>Shipping charge (₹)<br /><input name="shipping" inputMode="decimal" placeholder="0" style={{ ...field, width: 140 }} /></label>
                <label>Note (optional)<br /><input name="staff_note" maxLength={500} style={{ ...field, width: 240 }} /></label>
                <button name="op" value="CONFIRMED" className="btn-link btn-link-primary" style={bigBtn}>Confirm order</button>
                <button name="op" value="CANCELLED" className="btn-link" style={bigBtn}>Cancel</button>
              </form>
            )}
            {o.status === "CONFIRMED" && (
              <form action={updateOnlineOrderAction} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", marginTop: 12 }}>
                <input type="hidden" name="order_id" value={String(o.id)} />
                <label>Note (optional)<br /><input name="staff_note" maxLength={500} placeholder="e.g. bill number, courier" style={{ ...field, width: 280 }} /></label>
                <button name="op" value="COMPLETED" className="btn-link btn-link-primary" style={bigBtn}>Mark done (billed and sent)</button>
                <button name="op" value="CANCELLED" className="btn-link" style={bigBtn}>Cancel</button>
              </form>
            )}
          </section>
        );
      })}
    </main>
  );
}

export default function OnlineOrdersPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
