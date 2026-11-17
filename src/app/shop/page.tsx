import { Suspense } from "react";
import { getBrand } from "@/lib/brand";
import { shopNavLinks } from "@/lib/shop-nav";
import Link from "next/link";

import { getShopProducts, getShopSettings } from "@/lib/shop";
import styles from "./shop.module.css";
import { inr0 as inr } from "@/lib/format";

type Props = { searchParams: Promise<{ fabric?: string; q?: string }> };


async function Products({ searchParams }: Props) {
  const q = await searchParams;
  const [all, settings, brand] = await Promise.all([getShopProducts(), getShopSettings(), getBrand()]);
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
          <p className={styles.muted}>Our online collection is on its way. Visit our shop or message us in the meantime.</p>
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
          {settings.whatsapp && <a className={styles.btnWa} href={`https://wa.me/91${settings.whatsapp.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(`Hello ${brand.shopName}, I have a question.`)}`}>Message us on WhatsApp</a>}
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
  const [brand, links, all] = await Promise.all([getBrand(), shopNavLinks(), getShopProducts()]);
  const withPhoto = all.filter((p) => p.coverId !== null).sort((x, y) => y.id - x.id);
  const photo = (id: number | null) => (id === null ? null : `/api/shop/media/${id}`);
  // A tile per header link, with the newest photo of a product that matches its search words.
  const tiles = links.map((l) => {
    const q = decodeURIComponent(l.href.replace(/^\/shop\?q=/, "").replace(/#.*$/, "")).toLowerCase();
    const match = withPhoto.find((p) => `${p.name} ${p.fabric ?? ""}`.toLowerCase().includes(q));
    return { ...l, img: photo(match?.coverId ?? null) };
  });
  const heroImgs = withPhoto.slice(0, 2).map((p) => photo(p.coverId));
  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      <section className={styles.homeHero}>
        <div className={styles.heroCopy}>
          {brand.tagline ? <p style={{ color: "var(--gold)", letterSpacing: ".14em", textTransform: "uppercase", fontSize: ".85rem", fontWeight: 700, margin: "0 0 10px" }}>{brand.tagline}</p> : null}
          <h1>Welcome to {brand.shopName}</h1>
          {brand.description ? <p>{brand.description} We deliver to your door, anywhere in the world.</p> : <p>We deliver to your door, anywhere in the world.</p>}
          <div className={styles.heroBtns}>
            {links.slice(0, 2).map((l, i) => (
              <Link key={l.href} href={l.href} className={i === 0 ? styles.btnGold : styles.btnLine}>Shop {l.label.toLowerCase()}</Link>
            ))}
            {links.length === 0 ? <Link href="/shop#products" className={styles.btnGold}>Shop now</Link> : null}
          </div>
        </div>
        {heroImgs.length > 0 ? (
          <div className={styles.arches} aria-hidden="true">
            {heroImgs[1] ? <div className={`${styles.arch} ${styles.archSmall}`}><img src={heroImgs[1]} alt="" /></div> : null}
            <div className={`${styles.arch} ${styles.archBig}`}><img src={heroImgs[0] as string} alt="" /></div>
          </div>
        ) : null}
      </section>

      {tiles.length > 0 ? (
        <section className={styles.tiles} aria-label="Shop by kind">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className={styles.tile}>
              {t.img ? <div className={styles.archImg}><img src={t.img} alt={t.label} /></div> : null}
              <h3>{t.label}</h3>
            </Link>
          ))}
        </section>
      ) : null}
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
