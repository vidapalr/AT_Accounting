import { loadWhereChoices, whereKey } from "@/lib/offer-where";
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { createCouponAction, setCouponStatusAction } from "@/lib/rewards-actions";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const field: React.CSSProperties = { display: "block", padding: 10, fontSize: 16, width: "100%", marginTop: 4 };
const inr = (v: unknown) => `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function Content({ searchParams }: Props) {
  const user = await requireAccess("products");
  const q = await searchParams;
  let ready = true;
  let rows: RowDataPacket[] = [];
  const { choices, names } = await loadWhereChoices(user.legal_business_id);
  const sql = (withWhere: boolean) =>
      `SELECT c.id, c.code,${withWhere ? " c.division_id, c.branch_id," : ""} c.kind, c.value, c.min_bill, c.max_discount, c.once_per_customer, c.status,
              DATE_FORMAT(c.starts_on, '%d-%m-%Y') AS s, DATE_FORMAT(c.ends_on, '%d-%m-%Y') AS e,
              (SELECT COUNT(*) FROM acct_sale_rewards w JOIN acct_sales_headers h ON h.id = w.sale_id
                WHERE w.coupon_id = c.id AND h.status = 'POSTED') AS used,
              (SELECT COALESCE(SUM(w.coupon_discount), 0) FROM acct_sale_rewards w JOIN acct_sales_headers h ON h.id = w.sale_id
                WHERE w.coupon_id = c.id AND h.status = 'POSTED') AS given
         FROM acct_coupons c WHERE c.legal_business_id = ? ORDER BY c.status, c.id DESC`;
  try {
    try {
      [rows] = await db.execute<RowDataPacket[]>(sql(true), [user.legal_business_id]);
    } catch {
      [rows] = await db.execute<RowDataPacket[]>(sql(false), [user.legal_business_id]); // migration 064 not run yet
    }
  } catch {
    ready = false;
  }

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <Link className="btn-link" href="/accounting/offers">← Offers</Link>
      <h1>Coupons</h1>
      <p style={{ color: "#64748b" }}>
        A coupon is a code the customer tells the cashier. It takes rupees or a percentage off the whole bill.
        The cashier types it on the billing screen under &quot;Points and coupon&quot;. It becomes an ordinary discount on the bill, so your books need no change.
      </p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved.slice(0, 200)}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error.slice(0, 200)}</p>}
      {!ready && <p role="alert">Not set up yet. Ask Claude for the database file named 063_rewards.</p>}

      {ready && (
        <>
          <section style={box}>
            <h2>New coupon</h2>
            <form action={createCouponAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
              <label>Works at
                <select name="works_at" defaultValue={choices[0]?.value ?? ""} style={field}>
                  {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label>Code (letters and numbers, e.g. DIWALI10)<input name="code" required maxLength={20} style={{ ...field, textTransform: "uppercase" }} /></label>
              <label>Takes off
                <select name="kind" defaultValue="PERCENT" style={field}><option value="PERCENT">Percent of the bill (%)</option><option value="RUPEES">Rupees (₹)</option></select>
              </label>
              <label>How much (10 = 10% or ₹10)<input name="value" required inputMode="decimal" style={field} /></label>
              <label>Bill must be at least ₹ (optional)<input name="min_bill" inputMode="decimal" style={field} /></label>
              <label>Most discount ₹ (optional, for %)<input name="max_discount" inputMode="decimal" style={field} /></label>
              <label>Starts on (optional)<input type="date" name="starts_on" style={field} /></label>
              <label>Ends on (optional)<input type="date" name="ends_on" style={field} /></label>
              <label>Each customer can use it
                <select name="once" defaultValue="1" style={field}><option value="1">Once</option><option value="0">Many times</option></select>
              </label>
              <div style={{ alignSelf: "end" }}><button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Create coupon</button></div>
            </form>
          </section>

          <section style={box}>
            <h2>Your coupons</h2>
            {rows.length === 0 ? <p>No coupons yet.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Code", "Gives", "Rules", "Used", ""].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={String(c.id)}>
                        <td style={cell}><strong>{String(c.code)}</strong>{c.status === "PAUSED" ? " (paused)" : ""}<div style={{ color: "#64748b", fontSize: 13 }}>{names.get(whereKey(c.division_id, c.branch_id)) ?? "All branches"}</div></td>
                        <td style={cell}>{c.kind === "PERCENT" ? `${Number(c.value)}% off` : `${inr(c.value)} off`}{c.max_discount !== null ? `, at most ${inr(c.max_discount)}` : ""}</td>
                        <td style={cell}>
                          {Number(c.min_bill) > 0 ? `Bill ${inr(c.min_bill)} or more. ` : ""}
                          {c.s || c.e ? `${c.s ?? "…"} to ${c.e ?? "…"}. ` : ""}
                          {Number(c.once_per_customer) === 1 ? "Once per customer." : "Many times per customer."}
                        </td>
                        <td style={cell}>{String(c.used)} bill(s), {inr(c.given)} given</td>
                        <td style={cell}>
                          <form action={setCouponStatusAction}>
                            <input type="hidden" name="coupon_id" value={String(c.id)} />
                            <input type="hidden" name="status" value={c.status === "ACTIVE" ? "PAUSED" : "ACTIVE"} />
                            <button type="submit" className="btn-link btn-link-small">{c.status === "ACTIVE" ? "Pause" : "Switch on"}</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default function CouponsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
