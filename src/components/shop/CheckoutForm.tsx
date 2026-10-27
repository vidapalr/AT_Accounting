"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "@/app/shop/shop.module.css";
import { clearCart, useCart } from "./cart-store";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const COUNTRIES = ["India", "United States", "United Kingdom", "Canada", "Australia", "United Arab Emirates", "Singapore", "Saudi Arabia", "Qatar", "Kuwait", "Germany", "New Zealand"];

export default function CheckoutForm() {
  const lines = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState(false);

  if (placed) return <p className={styles.muted}>Order sent. One moment…</p>;
  if (lines.length === 0) {
    return (
      <div className={styles.thanks}>
        <h1>Your cart is empty</h1>
        <Link href="/shop" className={styles.btn}>Go to the shop</Link>
      </div>
    );
  }
  const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const g = (n: string) => String(f.get(n) ?? "");
    const other = g("country_other").trim();
    try {
      const res = await fetch("/api/shop/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: g("name"), phone: g("phone"), email: g("email"),
          country: g("country") === "Other" ? other : g("country"),
          address: g("address"), city: g("city"), state: g("state"), postal: g("postal"), note: g("note"), website: g("website"),
          lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; orderNo?: string };
      if (!data.ok) { setError(data.error ?? "Something went wrong."); setBusy(false); return; }
      setPlaced(true);
      clearCart();
      router.push(`/shop/thanks?no=${encodeURIComponent(data.orderNo ?? "")}`);
    } catch {
      setError("We could not reach the shop. Please check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400 }}>Your details</h1>
      <p className={styles.muted} style={{ marginBottom: 20 }}>Send us your order request. We will reply on WhatsApp or email to confirm availability, shipping and how to pay. You pay nothing now.</p>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.hp} aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        <label>Full name<input name="name" required autoComplete="name" /></label>
        <div className={styles.two}>
          <label>Phone / WhatsApp (with country code)<input name="phone" type="tel" required autoComplete="tel" placeholder="+91 98765 43210" /></label>
          <label>Email (optional)<input name="email" type="email" autoComplete="email" /></label>
        </div>
        <label>Country
          <select name="country" defaultValue="India" required>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
            <option>Other</option>
          </select>
        </label>
        <label>If other, type your country<input name="country_other" /></label>
        <label>Address<textarea name="address" rows={3} required autoComplete="street-address" /></label>
        <div className={styles.two}>
          <label>City<input name="city" required autoComplete="address-level2" /></label>
          <label>State / region<input name="state" autoComplete="address-level1" /></label>
        </div>
        <label>PIN / ZIP code<input name="postal" autoComplete="postal-code" /></label>
        <label>Anything we should know? (optional)<textarea name="note" rows={2} /></label>

        <div className={styles.summary}>
          {lines.map((l) => (
            <div key={l.variantId} className={styles.row}>
              <span>{l.product}{l.detail ? ` (${l.detail})` : ""} × {l.qty}</span>
              <span>{l.price !== null ? inr(l.price * l.qty) : "-"}</span>
            </div>
          ))}
          <div className={styles.row}><strong>Items total</strong><strong>{inr(total)}</strong></div>
          <p className={styles.muted} style={{ marginBottom: 0 }}>Shipping and any import duty are extra. We confirm them before you pay.</p>
        </div>
        {error && <p className={styles.err} role="alert">{error}</p>}
        <div>
          <button type="submit" className={styles.btn} disabled={busy}>{busy ? "Sending…" : "Send order request"}</button>{" "}
          <Link href="/shop/cart" className={styles.btnGhost}>Back to cart</Link>
        </div>
      </form>
    </>
  );
}
