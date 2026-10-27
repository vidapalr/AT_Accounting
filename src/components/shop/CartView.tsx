"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import styles from "@/app/shop/shop.module.css";
import { removeFromCart, setQty, updateCartDetails, useCart, type CartLine } from "./cart-store";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function CartView() {
  const lines = useCart();
  const refreshed = useRef(false);
  const stock = useRef<Map<number, boolean>>(new Map());

  // Fresh prices and stock from the shop, once per visit.
  useEffect(() => {
    if (refreshed.current || lines.length === 0) return;
    refreshed.current = true;
    fetch("/api/shop/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: lines.map((l) => l.variantId) }) })
      .then((r) => r.json())
      .then((d: { lines: { variantId: number; price: number | null; available: boolean }[] }) => {
        const gone = new Set(lines.map((l) => l.variantId));
        for (const f of d.lines) gone.delete(f.variantId);
        gone.forEach((id) => removeFromCart(id));
        stock.current = new Map(d.lines.map((f) => [f.variantId, f.available]));
        updateCartDetails(d.lines.map((f) => ({ variantId: f.variantId, price: f.price })));
      })
      .catch(() => undefined);
  }, [lines]);

  if (lines.length === 0) {
    return (
      <div className={styles.thanks}>
        <h1>Your cart is empty</h1>
        <p className={styles.muted}>Have a look at our collection and add what you like.</p>
        <Link href="/shop" className={styles.btn}>Go to the shop</Link>
      </div>
    );
  }

  const unpriced = lines.some((l) => l.price === null);
  const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  const soldOut = (l: CartLine) => stock.current.get(l.variantId) === false;

  return (
    <>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400 }}>Your cart</h1>
      {lines.map((l) => (
        <div key={l.variantId} className={styles.cartRow}>
          {l.coverId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/shop/media/${l.coverId}`} alt={l.product} />
          ) : <div />}
          <div>
            <Link href={`/shop/${l.productId}`}><strong>{l.product}</strong></Link>
            {l.detail && <div className={styles.muted}>{l.detail}</div>}
            <div>{l.price !== null ? inr(l.price) : "Ask for price"}</div>
            {soldOut(l) && <div className={styles.err}>Sold out now. Please remove it.</div>}
          </div>
          <div className={styles.cartRowRight}>
            <div className={styles.qty}>
              <button type="button" aria-label="Less" onClick={() => setQty(l.variantId, l.qty - 1)}>−</button>
              <span>{l.qty}</span>
              <button type="button" aria-label="More" onClick={() => setQty(l.variantId, l.qty + 1)}>+</button>
            </div>
            <div><button type="button" className={styles.linkBtn} onClick={() => removeFromCart(l.variantId)}>Remove</button></div>
          </div>
        </div>
      ))}
      <div className={styles.summary}>
        <div className={styles.row}><span>Items</span><strong>{inr(total)}</strong></div>
        <div className={styles.row}><span className={styles.muted}>Shipping</span><span className={styles.muted}>We confirm it for your country</span></div>
        {unpriced && <p className={styles.err}>Some items have no online price. Please remove them or ask us on WhatsApp.</p>}
        <p style={{ marginBottom: 0 }}>
          {unpriced ? null : <Link href="/shop/checkout" className={styles.btn}>Continue to details</Link>}{" "}
          <Link href="/shop" className={styles.btnGhost}>Keep shopping</Link>
        </p>
      </div>
    </>
  );
}
