import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { RowDataPacket } from "mysql2";

import LogoutButton from "@/components/shop/LogoutButton";
import { db } from "@/lib/db";
import { getShopCustomer } from "@/lib/shop-account";
import styles from "../shop.module.css";

export const metadata: Metadata = { title: "My account" };
const WORDS: Record<string, string> = { REQUESTED: "Received. We will confirm soon", CONFIRMED: "Confirmed", COMPLETED: "Completed", CANCELLED: "Cancelled" };
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function Content() {
  const me = await getShopCustomer();
  if (!me) redirect("/shop/account/login");
  const [orders] = await db.execute<RowDataPacket[]>(
    `SELECT order_no, status, items_total, shipping_charge, DATE_FORMAT(created_at, '%d %b %Y') AS d
       FROM acct_online_orders WHERE shop_customer_id = ? ORDER BY created_at DESC LIMIT 50`,
    [me.id]
  );
  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400, color: "var(--indigo)" }}>Hello, {me.name}</h1>
      <p className={styles.muted}>{me.email} · {me.phone}</p>
      <h2>Your orders</h2>
      {orders.length === 0 && <p className={styles.muted}>No orders yet. <Link href="/shop">Start shopping</Link>.</p>}
      {orders.map((o) => {
        const total = Number(o.items_total) + Number(o.shipping_charge);
        return (
          <div key={String(o.order_no)} className={styles.cartRow} style={{ gridTemplateColumns: "1fr auto" }}>
            <div><strong>{String(o.order_no)}</strong><div className={styles.muted}>{String(o.d)} · {WORDS[String(o.status)] ?? String(o.status)}</div></div>
            <div className={styles.cartRowRight}>{o.status === "REQUESTED" ? `${inr(Number(o.items_total))} + shipping` : inr(total)}</div>
          </div>
        );
      })}
      <p style={{ marginTop: 20 }}><LogoutButton /></p>
    </div>
  );
}

export default function AccountPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
