import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { changeOfferAction, saveOfferAction } from "@/lib/offer-actions";
import { describeOffer } from "@/lib/offer-math";

type Row = RowDataPacket & Record<string, string | number | null>;
type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const bigBtn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "10px 18px" };
const WHERE: Record<string, string> = { STORE: "Store only", ONLINE: "Online only", BOTH: "Store and online" };
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const q = await searchParams;

  const [offers] = await db.execute<Row[]>(
    `SELECT id, offer_name, channel, kind, offer_value, scope, fabric, status,
            DATE_FORMAT(starts_on, '%d %b %Y') AS s, DATE_FORMAT(ends_on, '%d %b %Y') AS e,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS s_iso, DATE_FORMAT(ends_on, '%Y-%m-%d') AS e_iso,
            (SELECT COUNT(*) FROM acct_offer_products op WHERE op.offer_id = acct_offers.id) AS n_products
       FROM acct_offers WHERE legal_business_id = ? ORDER BY status, created_at DESC LIMIT 100`,
    [businessId]
  );
  const [products] = await db.execute<Row[]>(
    `SELECT id, product_name FROM acct_products WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY product_name LIMIT 500`,
    [businessId]
  );
  const [fabrics] = await db.execute<Row[]>(
    `SELECT DISTINCT fabric FROM acct_products WHERE legal_business_id = ? AND fabric IS NOT NULL AND fabric <> '' ORDER BY fabric`,
    [businessId]
  );
  const t = today();
  const state = (o: Row) =>
    o.status === "PAUSED" ? "Paused" : o.s_iso && t < String(o.s_iso) ? "Starts soon" : o.e_iso && t > String(o.e_iso) ? "Ended" : "Running";

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Offers</h1>
      <p style={{ color: "#64748b" }}>
        Run an offer in the store, on the website, or both. On the website the old price shows crossed out. In the store the discount
        fills in by itself on the bill (staff can still change it). If more than one offer fits an item, the customer gets the best one, never both.
      </p>
      {q.saved && <p style={{ color: "#166534" }}>{q.saved.slice(0, 200)}</p>}
      {q.error && <p style={{ color: "#b91c1c" }}>{q.error.slice(0, 200)}</p>}

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>New offer</h2>
        <form action={saveOfferAction} style={{ display: "grid", gap: 14 }}>
          <label>Name<br /><input name="name" required maxLength={80} placeholder="Diwali 10% off" style={{ ...field, width: "100%", maxWidth: 420 }} /></label>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label>Where<br />
              <select name="channel" defaultValue="ONLINE" style={field}>
                <option value="STORE">Store only</option>
                <option value="ONLINE">Online only</option>
                <option value="BOTH">Store and online</option>
              </select>
            </label>
            <label>Kind<br />
              <select name="kind" defaultValue="PERCENT" style={field}>
                <option value="PERCENT">Percent off</option>
                <option value="AMOUNT_OFF">Rupees off each item</option>
                <option value="FIXED_PRICE">Special price</option>
              </select>
            </label>
            <label>Amount (% or ₹)<br /><input name="value" inputMode="decimal" required placeholder="10" style={{ ...field, width: 130 }} /></label>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label>From (optional)<br /><input type="date" name="starts_on" style={field} /></label>
            <label>Until (optional)<br /><input type="date" name="ends_on" style={field} /></label>
          </div>
          <div>
            <strong>Covers</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
              <label><input type="radio" name="scope" value="ALL" defaultChecked /> Everything</label>
              <label><input type="radio" name="scope" value="FABRIC" /> One fabric:{" "}
                <input name="fabric" list="fabrics" placeholder="Cotton" style={{ ...field, width: 180 }} />
                <datalist id="fabrics">{fabrics.map(f => <option key={String(f.fabric)} value={String(f.fabric)} />)}</datalist>
              </label>
              <label><input type="radio" name="scope" value="PRODUCTS" /> Chosen products (tick below)</label>
            </div>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>Choose products</summary>
              <div style={{ maxHeight: 260, overflowY: "auto", display: "grid", gap: 4, marginTop: 8 }}>
                {products.map(p => <label key={String(p.id)}><input type="checkbox" name="product_ids" value={String(p.id)} /> {String(p.product_name)}</label>)}
              </div>
            </details>
          </div>
          <button type="submit" className="btn-link btn-link-primary" style={{ ...bigBtn, justifySelf: "start" }}>Save offer</button>
        </form>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Your offers</h2>
        {offers.length === 0 && <p>No offers yet.</p>}
        {offers.map(o => (
          <div key={String(o.id)} style={{ borderTop: "1px solid #e2e8f0", padding: "12px 0", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{String(o.offer_name)}</strong> · {describeOffer({ kind: o.kind as "PERCENT", value: Number(o.offer_value) })}
              <div style={{ color: "#64748b" }}>
                {WHERE[String(o.channel)]} · {o.scope === "ALL" ? "everything" : o.scope === "FABRIC" ? `${o.fabric} only` : `${o.n_products} product(s)`}
                {o.s || o.e ? ` · ${o.s ?? "now"} to ${o.e ?? "no end"}` : ""} · <strong>{state(o)}</strong>
              </div>
            </div>
            <form action={changeOfferAction} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="offer_id" value={String(o.id)} />
              {o.status === "ACTIVE"
                ? <button name="op" value="PAUSE" className="btn-link" style={bigBtn}>Pause</button>
                : <button name="op" value="RESUME" className="btn-link" style={bigBtn}>Turn on</button>}
              <button name="op" value="DELETE" className="btn-link" style={{ ...bigBtn, color: "#b91c1c" }}>Delete</button>
            </form>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function OffersPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
