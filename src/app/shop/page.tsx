import { Suspense } from "react";
import Link from "next/link";

import { getShopProducts } from "@/lib/shop";
import styles from "./shop.module.css";

type Props = { searchParams: Promise<{ fabric?: string; q?: string }> };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

async function Products({ searchParams }: Props) {
  const q = await searchParams;
  const all = await getShopProducts();
  const fabrics = [...new Set(all.map((p) => p.fabric).filter((f): f is string => Boolean(f)))].sort();
  const fabric = fabrics.includes(q.fabric ?? "") ? q.fabric : undefined;
  const term = (q.q ?? "").trim().toLowerCase().slice(0, 60);
  const products = all.filter(
    (p) => (!fabric || p.fabric === fabric) && (!term || `${p.name} ${p.fabric ?? ""}`.toLowerCase().includes(term))
  );

  return (
    <section id="products">
      <div className={styles.sectionHead}>
        <h2>{fabric ?? "All products"}</h2>
        <form className={styles.search} action="/shop">
          {fabric && <input type="hidden" name="fabric" value={fabric} />}
          <input name="q" defaultValue={q.q ?? ""} placeholder="Search sarees, cotton sets…" aria-label="Search" />
          <button className={styles.btnGhost} type="submit">Search</button>
        </form>
      </div>
      {fabrics.length > 0 && (
        <div className={styles.filters} style={{ marginBottom: 16 }}>
          <Link href="/shop" className={`${styles.chip} ${!fabric ? styles.chipOn : ""}`}>All</Link>
          {fabrics.map((f) => (
            <Link key={f} href={`/shop?fabric=${encodeURIComponent(f)}`} className={`${styles.chip} ${fabric === f ? styles.chipOn : ""}`}>{f}</Link>
          ))}
        </div>
      )}
      {all.length === 0 ? (
        <p className={styles.muted}>Our online collection is coming soon. Please visit us in the shop.</p>
      ) : products.length === 0 ? (
        <p className={styles.muted}>Nothing matches that. <Link href="/shop">See everything</Link>.</p>
      ) : (
        <div className={styles.grid}>
          {products.map((p) => (
            <Link key={p.id} href={`/shop/${p.id}`} className={styles.card}>
              <div className={styles.cardPic}>
                {p.coverId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/shop/media/${p.coverId}`} alt={p.name} loading="lazy" />
                )}
                {!p.available && <span className={styles.soldOut}>Sold out</span>}
              </div>
              <div className={styles.cardBody}>
                <h3>{p.name}</h3>
                {p.fabric && <div className={styles.muted}>{p.fabric}</div>}
                <div className={styles.price}>{p.fromPrice !== null ? `${p.variants.length > 1 ? "From " : ""}${inr(p.fromPrice)}` : "Ask for price"}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ShopPage(props: Props) {
  return (
    <>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>COTTON COMFORT. TIMELESS TRADITION.</p>
          <h1>A little colour.<br />A lot of comfort.</h1>
          <p>Cotton sets, everyday essentials and traditional sarees from our shop in Kapra, Hyderabad. Order here and we deliver across India and around the world.</p>
          <a href="#products" className={styles.btn}>Shop the collection</a>
        </div>
        <div className={styles.heroPics}>
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/images/textiles/sarees.webp" alt="Silk sarees with woven gold borders" />
          <img src="/images/textiles/cottons.webp" alt="Soft cotton fabrics" />
          <img src="/images/textiles/kalamkari.webp" alt="Kalamkari printed cotton" />
          {/* eslint-enable @next/next/no-img-element */}
        </div>
      </section>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}><Products {...props} /></Suspense>
    </>
  );
}
