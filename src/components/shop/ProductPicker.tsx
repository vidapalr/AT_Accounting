"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "@/app/shop/shop.module.css";
import { shopOrderLink } from "@/lib/shop-link";
import { addToCart } from "./cart-store";

type Variant = { id: number; sku: string; size: string | null; color: string | null; price: number | null; available: boolean };
type Props = {
  product: { id: number; name: string; fabric: string | null; description: string | null; coverId: number | null; variants: Variant[] };
  media: { id: number; type: "IMAGE" | "VIDEO" }[];
  whatsapp: string;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const label = (v: Variant) => [v.size, v.color].filter(Boolean).join(", ") || "Standard";

export default function ProductPicker({ product, media, whatsapp }: Props) {
  const firstBuyable = product.variants.find((v) => v.available && v.price !== null) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstBuyable?.id ?? 0);
  const [qty, setQty] = useState(1);
  const [shown, setShown] = useState(0);
  const [added, setAdded] = useState(false);
  const v = product.variants.find((x) => x.id === variantId);
  const canBuy = Boolean(v && v.available && v.price !== null);
  const current = media[shown];

  function add() {
    if (!v || !canBuy) return;
    addToCart({ variantId: v.id, qty, product: product.name, detail: label(v) === "Standard" ? "" : label(v), price: v.price, coverId: product.coverId, productId: product.id });
    setAdded(true);
  }

  return (
    <div className={styles.product}>
      <div className={styles.gallery}>
        {current ? (
          current.type === "VIDEO" ? (
            <video key={current.id} src={`/api/shop/media/${current.id}`} controls playsInline preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/shop/media/${current.id}`} alt={product.name} />
          )
        ) : (
          <div style={{ aspectRatio: "4 / 5", background: "#f1e9dd", borderRadius: 16 }} aria-hidden="true" />
        )}
        {media.length > 1 && (
          <div className={styles.thumbs}>
            {media.map((m, i) =>
              m.type === "VIDEO" ? (
                <video key={m.id} src={`/api/shop/media/${m.id}#t=0.1`} muted playsInline preload="metadata" className={i === shown ? styles.on : ""} onClick={() => setShown(i)} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={m.id} src={`/api/shop/media/${m.id}`} alt="" loading="lazy" className={i === shown ? styles.on : ""} onClick={() => setShown(i)} />
              )
            )}
          </div>
        )}
      </div>

      <div className={styles.info}>
        <h1>{product.name}</h1>
        {product.fabric && <div className={styles.muted}>{product.fabric}</div>}
        <div className={styles.big}>{v?.price != null ? inr(v.price) : "Ask for price"}</div>

        {product.variants.length > 1 && (
          <>
            <strong>Choose</strong>
            <div className={styles.options} role="group" aria-label="Options">
              {product.variants.map((x) => (
                <button
                  key={x.id} type="button" disabled={!x.available}
                  className={`${styles.opt} ${x.id === variantId ? styles.optOn : ""} ${!x.available ? styles.optOff : ""}`}
                  onClick={() => { setVariantId(x.id); setAdded(false); }}
                >
                  {label(x)}{x.price !== null ? ` · ${inr(x.price)}` : ""}
                </button>
              ))}
            </div>
          </>
        )}

        {canBuy ? (
          <div className={styles.actions}>
            <div className={styles.qty}>
              <button type="button" aria-label="Less" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
              <span>{qty}</span>
              <button type="button" aria-label="More" onClick={() => setQty(Math.min(20, qty + 1))}>+</button>
            </div>
            <button type="button" className={styles.btn} onClick={add}>Add to cart</button>
          </div>
        ) : (
          <p className={styles.err}>{v?.available === false ? "Sold out for now." : "Ask us for the price."}</p>
        )}
        {added && (
          <p className={styles.ok}>Added to your cart. <Link href="/shop/cart">View cart</Link> or keep shopping.</p>
        )}

        {product.description && <p style={{ marginTop: 18, lineHeight: 1.6 }}>{product.description}</p>}

        {whatsapp && (
          <p style={{ marginTop: 14 }}>
            <a className={styles.btnWa} href={shopOrderLink(whatsapp, [{ product: product.name, detail: v ? label(v) : "" }])}>
              Ask on WhatsApp
            </a>
          </p>
        )}
        <p className={styles.note}>Send an order request and we will confirm availability, shipping to your country and how to pay. You pay nothing until we reply.</p>
      </div>
    </div>
  );
}
