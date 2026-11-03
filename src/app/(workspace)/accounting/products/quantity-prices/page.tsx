import TableSearch from "@/components/TableSearch";
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { saveQtyPricesAction } from "@/lib/qty-price-actions";
import { loadQtyRule } from "@/lib/qty-price-data";
import { latestPrices } from "@/lib/shop";

type Props = { searchParams: Promise<{ result?: string }> };

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Quantity prices saved." },
  invalid: { ok: false, text: "A box was not valid. Prices are numbers like 950 or 949.50; a percentage is a number below 90. Nothing was saved." },
  failed: { ok: false, text: "Could not save. Nothing was changed." },
};

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const input: React.CSSProperties = { padding: 8, width: 110, border: "1px solid #cbd5e1", borderRadius: 6 };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const { result } = await searchParams;
  const msg = result ? MESSAGES[result] : undefined;
  const rule = await loadQtyRule(user.legal_business_id);

  let rows: RowDataPacket[] = [];
  let ready = true;
  try {
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT v.id, v.sku, v.size_label, v.color_name, v.qty_price_4, v.qty_price_10, p.product_name
         FROM acct_product_variants v
         JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
        WHERE v.legal_business_id = ? AND v.status = 'ACTIVE' AND p.status = 'ACTIVE'
        ORDER BY p.product_name, v.size_label, v.color_name LIMIT 1000`,
      [user.legal_business_id]
    );
  } catch {
    ready = false;
  }
  const usual = ready ? await latestPrices(rows.map((r) => Number(r.id))) : new Map<number, number>();
  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <div style={{ maxWidth: 1000, padding: 24 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/products">← Products</Link></nav>
      <h1>Quantity prices</h1>
      <TableSearch includeInputs />
      <p style={{ color: "#475569" }}>
        The more a customer buys of one item, the lower the price for each piece: 1 to 3 pieces use the usual price,
        4 to 9 pieces the second price, and 10 or more pieces the third price. On the bill the price changes by itself
        when the quantity changes; the cashier can still type a different price.
        Count is per item line: 3 blouses and 5 petticoats are priced separately.
      </p>
      {msg && <p role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>}
      {!ready ? (
        <p role="alert">Not set up yet. Ask Claude for the database file named 059_quantity_prices.</p>
      ) : (
        <form action={saveQtyPricesAction}>
          <h2>One rule for every product</h2>
          <p style={{ color: "#475569" }}>Percentage taken off the usual price. Leave 0 for no rule. A price typed for a product below is used instead of this rule.</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
            <label>4 to 9 pieces: % off<br /><input name="off4" inputMode="decimal" defaultValue={String(rule.off4)} style={input} /></label>
            <label>10 or more pieces: % off<br /><input name="off10" inputMode="decimal" defaultValue={String(rule.off10)} style={input} /></label>
          </div>

          <h2>Own price for a product (optional)</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr><th style={cell}>Product</th><th style={cell}>Size / colour</th><th style={cell}>Usual price</th><th style={cell}>4 to 9 pieces (₹ each)</th><th style={cell}>10 or more (₹ each)</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const id = Number(r.id);
                  return (
                    <tr key={id}>
                      <td style={cell}>{String(r.product_name)}</td>
                      <td style={cell}>{[r.size_label, r.color_name].filter(Boolean).join(", ") || String(r.sku)}</td>
                      <td style={cell}>{usual.has(id) ? inr(usual.get(id)!) : <span style={{ color: "#64748b" }}>set when stock is received</span>}</td>
                      <td style={cell}><input name={`p4_${id}`} inputMode="decimal" defaultValue={r.qty_price_4 === null ? "" : String(Number(r.qty_price_4))} placeholder={rule.off4 > 0 ? "by rule" : "same as usual"} style={input} /></td>
                      <td style={cell}><input name={`p10_${id}`} inputMode="decimal" defaultValue={r.qty_price_10 === null ? "" : String(Number(r.qty_price_10))} placeholder={rule.off10 > 0 ? "by rule" : "same as usual"} style={input} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>Save quantity prices</button></p>
        </form>
      )}
    </div>
  );
}

export default function QuantityPricesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
