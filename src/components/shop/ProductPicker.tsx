"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "@/app/shop/shop.module.css";
import { shopOrderLink } from "@/lib/shop-link";
import { addToCart } from "./cart-store";

type Variant = {
  id: number; sku: string; size: string | null; color: string | null; style: string | null;
  price: number | null; was: number | null; offerName: string | null; photoId: number | null; available: boolean;
};
type Props = {
  product: {
    id: number; name: string; fabric: string | null; description: string | null;
    highlights: string[]; care: string | null; sizeGuide: string | null;
    coverId: number | null; variants: Variant[];
  };
  media: { id: number; type: "IMAGE" | "VIDEO" }[];
  whatsapp: string;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const label = (v: Variant, withStyle = false) => [v.size, v.color, withStyle ? v.style ?? v.sku : null].filter(Boolean).join(", ");

export default function ProductPicker({ product, media, whatsapp }: Props) {
  const { variants } = product;
  const colours = useMemo(() => [...new Set(variants.map((v) => v.color).filter((c): c is string => Boolean(c)))], [variants]);
  const sizes = useMemo(() => [...new Set(variants.map((v) => v.size).filter((s): s is string => Boolean(s)))], [variants]);

  const start = variants.find((v) => v.available && v.price !== null) ?? variants[0];
  const [color, setColor] = useState<string | null>(start?.color ?? null);
  const [size, setSize] = useState<string | null>(start?.size ?? null);
  const [qty, setQty] = useState(1);
  const [shown, setShown] = useState(() => {
    const i = media.findIndex((m) => m.id === start?.photoId);
    return i >= 0 ? i : 0;
  });
  const [added, setAdded] = useState(false);

  // Several items can share one size and colour (different styles): let the customer pick the style.
  const [styleId, setStyleId] = useState<number | null>(null);
  const candidates = variants.filter((x) => (x.color ?? null) === color && (x.size ?? null) === size);
  const v = candidates.find((x) => x.id === styleId) ?? candidates.find((x) => x.available) ?? candidates[0];
  const styleLabel = (x: Variant) => x.style ?? x.sku;
  const canBuy = Boolean(v && v.available && v.price !== null);
  const current = media[shown];

  const pick = (nextColor: string | null, nextSize: string | null) => {
    // Keep the choice valid: if the new colour has no such size, move to a size it does have.
    let c = nextColor, s = nextSize;
    if (!variants.some((x) => (x.color ?? null) === c && (x.size ?? null) === s)) {
      const alt = variants.find((x) => (x.color ?? null) === c) ?? variants.find((x) => (x.size ?? null) === s);
      if (alt) { c = alt.color ?? null; s = alt.size ?? null; }
    }
    setColor(c); setSize(s); setStyleId(null); setAdded(false);
    const hit = variants.find((x) => (x.color ?? null) === c && (x.size ?? null) === s);
    const i = media.findIndex((m) => m.id === hit?.photoId);
    if (i >= 0) setShown(i);
  };

  const sizeStatus = (sz: string) => {
    const hit = variants.find((x) => (x.color ?? null) === color && x.size === sz);
    return hit ? hit.available : false;
  };

  function add() {
    if (!v || !canBuy) return;
    addToCart({ variantId: v.id, qty, product: product.name, detail: label(v, candidates.length > 1), price: v.price, coverId: v.photoId ?? product.coverId, productId: product.id });
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
        {product.fabric && <p className={styles.eyebrow} style={{ margin: "0 0 6px" }}>{product.fabric.toUpperCase()}</p>}
        <h1>{product.name}</h1>
        <div className={styles.priceRow}>
          <span className={styles.big}>{v?.price != null ? inr(v.price) : "Ask for price"}</span>
          {v?.was != null && v.price != null && (
            <>
              <s className={styles.was}>{inr(v.was)}</s>
              <span className={styles.save}>Save {Math.round(((v.was - v.price) / v.was) * 100)}%</span>
            </>
          )}
        </div>
        {v?.offerName && <p className={styles.offerTag}>{v.offerName}</p>}
        <p className={styles.muted} style={{ marginTop: 0 }}>Shipping is extra and confirmed for your country before you pay.</p>

        {colours.length > 0 && (
          <>
            <strong>Colour{color ? `: ${color}` : ""}</strong>
            <div className={styles.options} role="group" aria-label="Colour">
              {colours.map((c) => (
                <button key={c} type="button" className={`${styles.opt} ${c === color ? styles.optOn : ""}`} onClick={() => pick(c, size)}>{c}</button>
              ))}
            </div>
          </>
        )}
        {sizes.length > 0 && (
          <>
            <strong>Size{size ? `: ${size}` : ""}</strong>
            <div className={styles.options} role="group" aria-label="Size">
              {sizes.map((sz) => (
                <button
                  key={sz} type="button" disabled={!sizeStatus(sz)}
                  className={`${styles.opt} ${sz === size ? styles.optOn : ""} ${!sizeStatus(sz) ? styles.optOff : ""}`}
                  onClick={() => pick(color, sz)}
                >{sz}</button>
              ))}
            </div>
          </>
        )}

        {candidates.length > 1 && (
          <>
            <strong>Style</strong>
            <div className={styles.options} role="group" aria-label="Style">
              {candidates.map((x) => (
                <button key={x.id} type="button" disabled={!x.available}
                  className={`${styles.opt} ${x.id === v?.id ? styles.optOn : ""} ${!x.available ? styles.optOff : ""}`}
                  onClick={() => { setStyleId(x.id); setAdded(false); }}>{styleLabel(x)}</button>
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
          <p className={styles.err}>{v ? (v.available ? "Ask us for the price." : "Sold out for now.") : "This combination is not available."}</p>
        )}
        {added && <p className={styles.ok}>Added to your cart. <Link href="/shop/cart">View cart</Link> or keep shopping.</p>}

        {whatsapp && (
          <p style={{ marginTop: 14 }}>
            <a className={styles.btnWa} href={shopOrderLink(whatsapp, [{ product: product.name, detail: v ? label(v) : "" }])}>Ask us on WhatsApp</a>
          </p>
        )}

        <div className={styles.sections}>
          {(product.description || product.highlights.length > 0) && (
            <details open>
              <summary>Description</summary>
              {product.description && <p>{product.description}</p>}
              {product.highlights.length > 0 && <ul>{product.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
            </details>
          )}
          {product.sizeGuide && <details><summary>Size guide</summary><p style={{ whiteSpace: "pre-line" }}>{product.sizeGuide}</p></details>}
          {product.care && <details><summary>Care</summary><p style={{ whiteSpace: "pre-line" }}>{product.care}</p></details>}
          <details>
            <summary>Shipping and payment</summary>
            <p>We ship across India and worldwide. Send your order request, and we reply on WhatsApp or email with availability, the shipping charge for your country and how to pay. You pay nothing until then.</p>
          </details>
        </div>
      </div>
    </div>
  );
}
