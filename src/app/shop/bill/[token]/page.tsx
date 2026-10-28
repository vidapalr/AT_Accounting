import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2";
import { connection } from "next/server";

import { db } from "@/lib/db";
import styles from "../../shop.module.css";
import { getShopSettings } from "@/lib/shop";
import { TAGLINE } from "@/lib/brand";
import BillWatermark from "@/components/BillWatermark";
import { normalizePhone } from "@/lib/whatsapp/core";


export const metadata: Metadata = { title: "Your bill", robots: { index: false, follow: false } };
type Row = RowDataPacket & Record<string, string | number | null>;
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cell: React.CSSProperties = { padding: "8px 6px", borderBottom: "1px solid #e8e4da", textAlign: "left" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };

async function Content({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const [heads] = await db.execute<Row[]>(
    `SELECT s.id, s.legal_business_id, s.invoice_no, DATE_FORMAT(s.invoice_date, '%d %b %Y') AS d, s.customer_name,
            s.subtotal, s.discount_amount, s.grand_total, s.shipping_charge, s.status,
            b.address_line1, b.address_line2, b.city, b.state, b.postal_code
       FROM acct_invoice_shares sh JOIN acct_sales_headers s ON s.id = sh.sale_id AND s.legal_business_id = sh.legal_business_id
       LEFT JOIN acct_branches b ON b.legal_business_id = s.legal_business_id AND b.division_id = s.division_id AND b.id = s.branch_id
      WHERE sh.token = ?`, [token]
  );
  const h = heads[0];
  if (!h || h.status !== "POSTED") notFound();
  const [lines] = await db.execute<Row[]>(
    `SELECT p.product_name, v.size_label, v.color_name, sl.quantity, v.unit_of_measure, sl.unit_price, sl.discount_amount, sl.line_total
       FROM acct_sales_lines sl
       JOIN acct_product_variants v ON v.legal_business_id = sl.legal_business_id AND v.division_id = sl.division_id AND v.id = sl.variant_id
       JOIN acct_products p ON p.legal_business_id = v.legal_business_id AND p.division_id = v.division_id AND p.id = v.product_id
      WHERE sl.legal_business_id = ? AND sl.sale_id = ? ORDER BY sl.id`, [h.legal_business_id, h.id]
  );
  const [paid] = await db.execute<Row[]>(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM acct_sales_payments WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`,
    [h.legal_business_id, h.id]
  );
  const { whatsapp } = await getShopSettings(Number(h.legal_business_id));
  const phone = normalizePhone(whatsapp);
  const address = [h.address_line1, h.address_line2, h.city, h.state, h.postal_code].filter(Boolean).join(", ") || "Kapra, Hyderabad";
  const total = Number(h.grand_total);
  const paidAmt = Number(paid[0]?.paid ?? 0);
  const due = Math.max(0, total - paidAmt);

  return (
    <div style={{ maxWidth: 640, margin: "10px auto", position: "relative", zIndex: 1 }}>
      <BillWatermark />
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "2px solid var(--indigo)", paddingBottom: 12, marginBottom: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/abhiram-logo-192.png" alt="Abhiram Textiles logo" width={64} height={64} />
        <div>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400, color: "var(--indigo)", margin: 0 }}>Abhiram Textiles</h1>
          <div className={styles.muted}>{TAGLINE}</div>
        </div>
      </div>
      <p className={styles.muted} style={{ margin: "0 0 4px" }}>{address}{phone ? <> · <a href={`tel:${phone}`}>{whatsapp}</a></> : null}</p>
      <p style={{ margin: "0 0 12px" }}><strong>Bill {String(h.invoice_no)}</strong> · {String(h.d)}{h.customer_name ? ` · ${h.customer_name}` : ""}</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={cell}>Item</th><th style={right}>Qty</th><th style={right}>Amount</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{String(l.product_name)}{[l.size_label, l.color_name].filter(Boolean).length ? ` (${[l.size_label, l.color_name].filter(Boolean).join(", ")})` : ""}
                <br /><span className={styles.muted}>{inr(Number(l.unit_price))} each{Number(l.discount_amount) > 0 ? `, discount ${inr(Number(l.discount_amount))}` : ""}</span></td>
              <td style={right}>{Number(l.quantity)} {String(l.unit_of_measure ?? "")}</td>
              <td style={right}>{inr(Number(l.line_total))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {Number(h.shipping_charge) > 0 && <p style={{ textAlign: "right", margin: "14px 0 0" }}>Delivery {inr(Number(h.shipping_charge))}</p>}
      <p style={{ textAlign: "right", margin: "14px 0 0" }}>Total <strong style={{ fontSize: 20 }}>{inr(total)}</strong></p>
      <p style={{ textAlign: "right", margin: 0 }}>Paid {inr(paidAmt)}</p>
      <p style={{ textAlign: "right", margin: 0 }}>{due > 0 ? <>Balance due <strong>{inr(due)}</strong></> : <strong>Paid in full. Thank you!</strong>}</p>
      <p style={{ marginTop: 28, fontSize: 18, textAlign: "center", color: "var(--indigo)" }}><strong>Thanks for shopping with Abhiram Textiles!</strong></p>
      <p className={styles.muted} style={{ textAlign: "center" }}>
        If anything looks wrong, message us{phone ? <> on <a href={`https://wa.me/${phone.replace(/\D/g, "")}`}>WhatsApp {whatsapp}</a></> : " on WhatsApp"}.
      </p>
    </div>
  );
}

export default function Page(props: { params: Promise<{ token: string }> }) {
  return <Suspense fallback={null}><Content {...props} /></Suspense>;
}
