import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { loadOrderChoices } from "@/lib/purchase-order-data";
import { normalizePhone } from "@/lib/customer-phone";
import { whatsappLink } from "@/lib/whatsapp/core";
import { todayInIndia } from "@/lib/reports/money";
import { cancelPurchaseOrderAction, receivePurchaseOrderAction } from "@/lib/purchase-order-actions";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import PurchaseOrderForm from "../PurchaseOrderForm";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const SAVED: Record<string, string> = { created: "Order saved.", changed: "Order changed.", cancelled: "Order cancelled." };

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("purchases");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const id = Number((await params).id);
  const query = await searchParams;
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [rows] = await db.execute<Row[]>(
    `SELECT o.*, DATE_FORMAT(o.order_date, '%Y-%m-%d') AS od, DATE_FORMAT(o.expected_date, '%Y-%m-%d') AS ed,
            s.supplier_name, s.mobile, s.whatsapp_number, w.location_name, ph.purchase_no
       FROM acct_purchase_orders o
       JOIN acct_suppliers s ON s.id = o.supplier_id
       JOIN acct_inventory_locations w ON w.id = o.location_id
       LEFT JOIN acct_purchase_headers ph ON ph.id = o.purchase_id
      WHERE o.legal_business_id = ? AND o.division_id = ? AND o.id = ?`,
    [businessId, divisionId, id]
  );
  const o = rows[0];
  if (!o) notFound();
  const [lines] = await db.execute<Row[]>(
    `SELECT l.variant_id, l.quantity, l.unit_cost, l.line_amount, v.sku, p.product_name, v.size_label, v.color_name, v.unit_of_measure
       FROM acct_purchase_order_lines l
       JOIN acct_product_variants v ON v.id = l.variant_id
       JOIN acct_products p ON p.id = v.product_id
      WHERE l.order_id = ? ORDER BY l.line_no`,
    [id]
  );
  const total = lines.reduce((s, l) => s + BigInt(Math.round(Number(l.line_amount) * 100)), 0n);
  const open = o.status === "OPEN";
  const name = (l: Row) => `${l.product_name}${l.size_label ? ` / ${l.size_label}` : ""}${l.color_name ? ` / ${l.color_name}` : ""}`;
  const qty = (v: string | number | null) => String(Number(v));

  const phone = normalizePhone(String(o.whatsapp_number ?? "")) ?? normalizePhone(String(o.mobile ?? ""));
  const message =
    `Hello ${o.supplier_name}, this is Abhiram Textiles. Purchase order ${o.order_no} dated ${pretty(String(o.od))}:\n` +
    lines.map((l) => `• ${name(l)} (${l.sku}) × ${qty(l.quantity)} @ ₹${Number(l.unit_cost)}`).join("\n") +
    `\nTotal ${rupees(total)}.` + (o.ed ? ` Please deliver by ${pretty(String(o.ed))}.` : "") + (o.remarks ? `\n${o.remarks}` : "") + `\nPlease confirm. Thank you!`;

  const choices = open ? await loadOrderChoices(businessId, divisionId) : null;

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <p><Link href="/accounting/purchase-orders">← Purchase orders</Link></p>
      <h1 style={{ marginBottom: 4 }}>{String(o.order_no)} · {String(o.supplier_name)}</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        {o.status === "OPEN" ? "Waiting for delivery" : o.status === "RECEIVED" ? "Received" : "Cancelled"} · ordered {pretty(String(o.od))}
        {o.ed ? ` · expected ${pretty(String(o.ed))}` : ""} · deliver to {String(o.location_name)}
      </p>
      {query.saved && SAVED[query.saved] && <p style={{ color: "#166534", fontSize: 17 }}>{SAVED[query.saved]}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
          <thead><tr><th style={cell}>Item</th><th style={right}>Quantity</th><th style={right}>Price each</th><th style={right}>Amount</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={String(l.variant_id)}>
                <td style={cell}>{name(l)}<br /><span style={{ color: "#64748b", fontSize: 13 }}>{String(l.sku)}</span></td>
                <td style={right}>{qty(l.quantity)} {String(l.unit_of_measure).toLowerCase()}</td>
                <td style={right}>₹{Number(l.unit_cost)}</td>
                <td style={right}>{rupees(BigInt(Math.round(Number(l.line_amount) * 100)))}</td>
              </tr>
            ))}
            <tr><td style={cell} colSpan={3}><strong>Total</strong></td><td style={right}><strong>{rupees(total)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      {o.remarks ? <p>Note: {String(o.remarks)}</p> : null}

      {open && (
        <section style={box}>
          <h2>Next step</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {phone
              ? <a className="btn-link btn-link-primary" target="_blank" rel="noreferrer" href={whatsappLink(`91${phone}`, message)}>Send to supplier on WhatsApp</a>
              : <span style={{ color: "#b45309" }}>This supplier has no mobile number, so WhatsApp is not available.</span>}
            <form action={receivePurchaseOrderAction}>
              <input type="hidden" name="order_id" value={id} />
              <SubmitButton label="Goods arrived: make purchase draft" question="Make a purchase draft from this order? You can still change quantities and prices before posting." />
            </form>
          </div>
          <p style={{ color: "#64748b" }}>The draft opens with these items filled in. Add the supplier&apos;s bill number, correct any quantity that came short, then post it.</p>
        </section>
      )}

      {o.status === "RECEIVED" && (
        <p style={box}>Goods arrived. Purchase draft/bill: <Link href={`/accounting/purchases?edit=${o.purchase_id}`}>{String(o.purchase_no)}</Link></p>
      )}

      {open && choices && (
        <>
          <details style={box}>
            <summary style={{ cursor: "pointer" }}>Change this order</summary>
            <div style={{ marginTop: 12 }}>
              <PurchaseOrderForm
                choices={choices}
                today={todayInIndia()}
                order={{
                  id, supplierId: Number(o.supplier_id), locationId: Number(o.location_id), orderDate: String(o.od), expectedDate: o.ed ? String(o.ed) : "",
                  remarks: String(o.remarks ?? ""),
                  lines: lines.map((l) => ({ variantId: Number(l.variant_id), quantity: String(l.quantity), unitCost: String(l.unit_cost) })),
                }}
              />
            </div>
          </details>
          <form action={cancelPurchaseOrderAction}>
            <input type="hidden" name="order_id" value={id} />
            <ConfirmButton label="Cancel this order" question="Cancel this order? Nothing else changes." />
          </form>
        </>
      )}
    </main>
  );
}
export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
