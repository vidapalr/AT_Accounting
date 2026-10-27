import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { shopCustomerAction } from "@/lib/shop-customer-actions";

type Row = RowDataPacket & Record<string, string | number | null>;
type Props = { searchParams: Promise<{ q?: string; saved?: string; error?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "12px 0" };
const bigBtn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "10px 18px" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("online_orders");
  const q = await searchParams;
  const term = String(q.q ?? "").trim().slice(0, 80);
  const like = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const [rows] = await db.execute<Row[]>(
    `SELECT c.id, c.full_name, c.email, c.phone, c.status, DATE_FORMAT(c.created_at, '%d %b %Y') AS joined,
            (SELECT COUNT(*) FROM acct_online_orders o WHERE o.shop_customer_id = c.id) AS orders
       FROM acct_shop_customers c
      WHERE c.legal_business_id = ? ${term ? "AND (c.full_name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)" : ""}
      ORDER BY c.created_at DESC LIMIT 100`,
    term ? [user.legal_business_id, like, like, like] : [user.legal_business_id]
  );

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Website customers</h1>
      <p style={{ color: "#64748b" }}>
        People who created an account on the website. Block someone to log them out and stop their orders. If a customer is locked out, send them a reset email — you never see or set their password.
      </p>
      {q.saved && <p style={{ color: "#166534" }}>{q.saved.slice(0, 200)}</p>}
      {q.error && <p style={{ color: "#b91c1c" }}>{q.error.slice(0, 200)}</p>}
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input name="q" defaultValue={term} placeholder="Search name, email or phone" style={{ padding: "10px 12px", fontSize: 16, minWidth: 260 }} />
        <button className="btn-link" style={bigBtn}>Search</button>
      </form>
      {rows.length === 0 && <p style={{ marginTop: 16 }}>No website customers found.</p>}
      {rows.map((c) => (
        <section key={String(c.id)} style={box}>
          <h2 style={{ marginTop: 0 }}>
            {String(c.full_name)} {c.status === "BLOCKED" && <span style={{ color: "#b91c1c" }}>· Blocked</span>}
          </h2>
          <p style={{ margin: "0 0 10px" }}>
            {String(c.email)} · {String(c.phone)}<br />
            <span style={{ color: "#64748b" }}>Joined {String(c.joined)} · {Number(c.orders)} order{Number(c.orders) === 1 ? "" : "s"}</span>
          </p>
          <form action={shopCustomerAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input type="hidden" name="customer_id" value={String(c.id)} />
            {c.status === "ACTIVE" && <button name="op" value="RESET" className="btn-link" style={bigBtn}>Send password reset email</button>}
            {c.status === "ACTIVE"
              ? <button name="op" value="BLOCK" className="btn-link" style={bigBtn}>Block</button>
              : <button name="op" value="UNBLOCK" className="btn-link btn-link-primary" style={bigBtn}>Unblock</button>}
          </form>
        </section>
      ))}
    </main>
  );
}

export default function ShopCustomersPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
