import { Suspense } from "react";
import Link from "next/link";

import { getShopProducts, getShopSettings } from "@/lib/shop";
import styles from "./shop.module.css";

type Props = { searchParams: Promise<{ fabric?: string; q?: string }> };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

async function Products({ searchParams }: Props) {
  const q = await searchParams;
  const [all, settings] = await Promise.all([getShopProducts(), getShopSettings()]);
  const fabrics = [...new Set(all.map((p) => p.fabric).filter((f): f is string => Boolean(f)))].sort();
  const fabric = fabrics.includes(q.fabric ?? "") ? q.fabric : undefined;
  const term = (q.q ?? "").trim().toLowerCase().slice(0, 60);
  const filtered = Boolean(fabric || term);
  const products = all.filter(
    (p) => (!fabric || p.fabric === fabric) && (!term || `${p.name} ${p.fabric ?? ""}`.toLowerCase().includes(term))
  );

  const card = (p: (typeof all)[number]) => (
    <Link key={p.id} href={`/shop/${p.id}`} className={styles.card}>
      <div className={styles.cardPic}>
        {p.coverId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/shop/media/${p.coverId}`} alt={p.name} loading="lazy" />
        )}
        {!p.available && <span className={styles.soldOut}>Sold out</span>}
        {p.available && p.offerName && <span className={styles.offerBadge}>{p.offerName}</span>}
      </div>
      <div className={styles.cardBody}>
        <h3>{p.name}</h3>
        {p.fabric && <div className={styles.muted}>{p.fabric}</div>}
        <div className={styles.price}>
          {p.fromPrice !== null ? `${p.variants.length > 1 ? "From " : ""}${inr(p.fromPrice)}` : "Ask for price"}
          {p.fromWas !== null && <s className={styles.cardWas}>{inr(p.fromWas)}</s>}
        </div>
      </div>
    </Link>
  );

  return (
    <>
      {!filtered && all.length > 8 && (
        <section className={styles.arrivals}>
          <div className={styles.blockHead}>
            <h2>Fresh on the shelf</h2>
            <a href="#products">See everything</a>
          </div>
          <div className={styles.grid}>{all.slice(0, 4).map(card)}</div>
        </section>
      )}

      <section id="products">
        <div className={styles.blockHead}>
          <h2>{fabric ?? (term ? `Results for "${q.q}"` : "All products")}</h2>
          <form className={styles.search} action="/shop#products" style={{ margin: 0 }}>
            {fabric && <input type="hidden" name="fabric" value={fabric} />}
            <input name="q" defaultValue={q.q ?? ""} placeholder="Search sarees, cotton sets" aria-label="Search" />
            <button className={styles.btnGhost} type="submit">Search</button>
          </form>
        </div>
        {fabrics.length > 0 && (
          <div className={styles.filters} style={{ marginBottom: 18 }}>
            <Link href="/shop#products" className={`${styles.chip} ${!fabric && !term ? styles.chipOn : ""}`}>All</Link>
            {fabrics.map((f) => (
              <Link key={f} href={`/shop?fabric=${encodeURIComponent(f)}#products`} className={`${styles.chip} ${fabric === f ? styles.chipOn : ""}`}>{f}</Link>
            ))}
          </div>
        )}
        {all.length === 0 ? (
          <p className={styles.muted}>Our online collection is on its way. Visit us in Kapra, Hyderabad in the meantime.</p>
        ) : products.length === 0 ? (
          <p className={styles.muted}>Nothing matches that search. <Link href="/shop#products">See everything</Link>.</p>
        ) : (
          <div className={styles.grid}>{products.map(card)}</div>
        )}
      </section>

      {!filtered && (
        <section className={styles.contact}>
          <h2>Not sure about size or colour?</h2>
          <p>Message us a photo or a question. We reply personally and can ship your order anywhere in the world.</p>
          {settings.whatsapp && <a className={styles.btnWa} href={`https://wa.me/91${settings.whatsapp.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent("Hello Abhiram Textiles, I have a question.")}`}>Message us on WhatsApp</a>}
        </section>
      )}
    </>
  );
}

export default function ShopPage(props: Props) {
  return (
    <>
      <Suspense fallback={null}><Home {...props} /></Suspense>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}><Products {...props} /></Suspense>
    </>
  );
}

async function Home({ searchParams }: Props) {
  const q = await searchParams;
  if (q.fabric || (q.q ?? "").trim()) {
    return <div className={styles.pageTop}><h1>Shop</h1></div>;
  }
  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      <section className={styles.homeHero}>
        <div className={styles.heroCopy}>
          <h1><span style={{ display: "block" }}>A little colour.</span><span style={{ display: "block" }}>A lot of comfort.</span></h1>
          <p>Cotton sets for every day, sarees for the days that matter, and Kalamkari prints made to be loved. From our shop in Kapra, Hyderabad to your door, anywhere in the world.</p>
          <div className={styles.heroBtns}>
            <Link href="/shop?q=saree#products" className={styles.btnGold}>Shop sarees</Link>
            <Link href="/shop?q=cotton#products" className={styles.btnLine}>Shop cotton sets</Link>
          </div>
        </div>
        <div className={styles.arches} aria-hidden="true">
          <div className={`${styles.arch} ${styles.archSmall}`}><img src="/images/textiles/cottons.webp" alt="" /></div>
          <div className={`${styles.arch} ${styles.archBig}`}><img src="/images/textiles/sarees.webp" alt="" /></div>
        </div>
      </section>

      <section className={styles.tiles} aria-label="Shop by kind">
        <Link href="/shop?q=saree#products" className={styles.tile}>
          <div className={styles.archImg}><img src="/images/textiles/sarees.webp" alt="Silk sarees with woven gold borders" /></div>
          <h3>Sarees</h3><span>Banaras, Mangalagiri, Uppada</span>
        </Link>
        <Link href="/shop?q=cotton#products" className={styles.tile}>
          <div className={styles.archImg}><img src="/images/textiles/cottons.webp" alt="Soft cotton fabrics with indigo prints" /></div>
          <h3>Cotton sets</h3><span>Soft, easy, all-day wear</span>
        </Link>
        <Link href="/shop?q=kalamkari#products" className={styles.tile}>
          <div className={styles.archImg}><img src="/images/textiles/kalamkari.webp" alt="Kalamkari printed cotton" /></div>
          <h3>Kalamkari</h3><span>Hand-inspired prints</span>
        </Link>
      </section>
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
