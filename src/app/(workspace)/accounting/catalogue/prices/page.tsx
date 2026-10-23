import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { saveShopPricesAction } from "@/lib/shop-actions";

type Props = { searchParams: Promise<{ result?: string }> };

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Prices saved." },
  invalid: { ok: false, text: "A price was not a valid amount. Use numbers like 1499 or 1499.50. Nothing was saved." },
  failed: { ok: false, text: "Could not save. Nothing was changed." },
};

async function Prices({ searchParams }: Props) {
  const user = await requireAccess("products");
  const { result } = await searchParams;
  const msg = result ? MESSAGES[result] : undefined;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT v.id, v.sku, v.size_label, v.color_name, v.shop_price, p.product_name,
            (SELECT COUNT(*) FROM acct_product_media m
              WHERE m.legal_business_id = p.legal_business_id AND m.product_id = p.id
                AND m.status = 'ACTIVE' AND m.media_type = 'IMAGE') AS photos
       FROM acct_product_variants v
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE v.legal_business_id = ? AND v.status = 'ACTIVE' AND p.status = 'ACTIVE' AND p.show_in_shop = 1
      ORDER BY p.product_name, v.size_label, v.color_name LIMIT 1000`,
    [user.legal_business_id]
  );

  const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };

  return (
    <div style={{ maxWidth: 900 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/catalogue">← Catalogue</Link></nav>
      <h1>Shop prices</h1>
      <p style={{ color: "#475569" }}>
        The selling price customers see on the online shop, Instagram and WhatsApp. Fill the price for each size and colour, then press Save once.
        A product needs a price and a photo to be sent to Meta.
      </p>
      {msg && <p role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>}
      {rows.length === 0 ? (
        <p>No products are on the online shop yet. Switch some on from the Catalogue page.</p>
      ) : (
        <form action={saveShopPricesAction}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr><th style={cell}>Product</th><th style={cell}>Size / colour</th><th style={cell}>Price (₹)</th><th style={cell}>Photo</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={cell}>{String(r.product_name)}</td>
                    <td style={cell}>{[r.size_label, r.color_name].filter(Boolean).join(", ") || String(r.sku)}</td>
                    <td style={cell}>
                      <input
                        name={`price_${r.id}`}
                        inputMode="decimal"
                        defaultValue={r.shop_price === null ? "" : String(Number(r.shop_price))}
                        placeholder="1499"
                        style={{ padding: 8, width: 110, border: "1px solid #cbd5e1", borderRadius: 6 }}
                      />
                    </td>
                    <td style={cell}>{Number(r.photos) > 0 ? "✔" : <span style={{ color: "#b45309" }}>Add photo</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>Save all prices</button></p>
        </form>
      )}
    </div>
  );
}

export default function PricesPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Prices {...props} /></Suspense>;
}
