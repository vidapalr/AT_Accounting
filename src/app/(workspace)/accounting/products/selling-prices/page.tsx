import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { saveSellingPricesAction } from "@/lib/selling-price-actions";
import { loadPriceOverrides } from "@/lib/selling-price-data";

type Props = { searchParams: Promise<{ result?: string }> };

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Prices saved." },
  invalid: { ok: false, text: "A price was not a valid amount. Use numbers like 1499 or 1499.50. Nothing was saved." },
  order: { ok: false, text: "A minimum price is higher than its maximum price. Nothing was saved." },
  failed: { ok: false, text: "Could not save. Nothing was changed." },
};

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { padding: 8, width: 100, border: "1px solid #cbd5e1", borderRadius: 6 };
const inr = (n: number | null) => (n === null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const { result } = await searchParams;
  const msg = result ? MESSAGES[result] : undefined;
  const businessId = user.legal_business_id;

  let ready = true;
  let rows: RowDataPacket[] = [];
  try {
    await db.execute("SELECT 1 FROM acct_selling_prices LIMIT 1");
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT v.id, v.sku, v.size_label, v.color_name, p.product_name,
              (SELECT tl.min_selling_price FROM acct_stock_transfer_lines tl JOIN acct_stock_transfers t ON t.id = tl.transfer_id AND t.legal_business_id = tl.legal_business_id
                WHERE tl.variant_id = v.id AND t.legal_business_id = v.legal_business_id AND t.status = 'RECEIVED' ORDER BY t.received_at DESC, t.id DESC LIMIT 1) AS stock_min,
              (SELECT tl.max_selling_price FROM acct_stock_transfer_lines tl JOIN acct_stock_transfers t ON t.id = tl.transfer_id AND t.legal_business_id = tl.legal_business_id
                WHERE tl.variant_id = v.id AND t.legal_business_id = v.legal_business_id AND t.status = 'RECEIVED' ORDER BY t.received_at DESC, t.id DESC LIMIT 1) AS stock_max,
              (SELECT tl.suggested_selling_price FROM acct_stock_transfer_lines tl JOIN acct_stock_transfers t ON t.id = tl.transfer_id AND t.legal_business_id = tl.legal_business_id
                WHERE tl.variant_id = v.id AND t.legal_business_id = v.legal_business_id AND t.status = 'RECEIVED' ORDER BY t.received_at DESC, t.id DESC LIMIT 1) AS stock_sug
         FROM acct_product_variants v
         JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
        WHERE v.legal_business_id = ? AND v.status = 'ACTIVE' AND p.status = 'ACTIVE'
        ORDER BY p.product_name, v.size_label, v.color_name LIMIT 1000`,
      [businessId]
    );
  } catch {
    ready = false;
  }
  const own = ready ? await loadPriceOverrides(businessId) : new Map();
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return (
    <div style={{ maxWidth: 1100, padding: 24 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/products">← Products</Link></nav>
      <h1>Selling prices</h1>
      <p style={{ color: "#475569" }}>
        When stock is moved to a shop, the minimum price is worked out as cost + 30% and the maximum as cost + 100%.
        Here you can set your own prices for any product size/colour at any time. The usual price is what the bill starts with,
        the minimum is the warning level on a bill, and the maximum is the price shown in the online shop.
        Leave a box empty to keep the price that came with the stock. Clear all three to go back to the automatic prices.
        Quantity prices (4 or more, 10 or more) are on their own page.
      </p>
      {msg && <p role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>}
      {!ready ? (
        <p role="alert">Not set up yet. Ask Claude for the database file named 060_selling_prices.</p>
      ) : (
        <form action={saveSellingPricesAction}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={cell}>Product</th><th style={cell}>Size / colour</th>
                  <th style={cell}>From stock (min / max / usual)</th>
                  <th style={cell}>Your minimum ₹</th><th style={cell}>Your maximum ₹</th><th style={cell}>Your usual price ₹</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = Number(r.id);
                  const o = own.get(id);
                  return (
                    <tr key={id}>
                      <td style={cell}>{String(r.product_name)}</td>
                      <td style={cell}>{[r.size_label, r.color_name].filter(Boolean).join(", ") || String(r.sku)}</td>
                      <td style={cell}>{inr(n(r.stock_min))} / {inr(n(r.stock_max))} / {inr(n(r.stock_sug))}</td>
                      <td style={cell}><input name={`min_${id}`} inputMode="decimal" defaultValue={o?.min == null ? "" : String(o.min)} placeholder="from stock" style={box} /></td>
                      <td style={cell}><input name={`max_${id}`} inputMode="decimal" defaultValue={o?.max == null ? "" : String(o.max)} placeholder="from stock" style={box} /></td>
                      <td style={cell}><input name={`sug_${id}`} inputMode="decimal" defaultValue={o?.suggested == null ? "" : String(o.suggested)} placeholder="from stock" style={box} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>Save prices</button></p>
        </form>
      )}
    </div>
  );
}

export default function SellingPricesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
