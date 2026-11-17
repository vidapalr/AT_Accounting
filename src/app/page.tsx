import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";

import { getBrand } from "@/lib/brand";
import { getShopProducts } from "@/lib/shop";
import styles from "./page.module.css";

/** The public front page. Every word and picture comes from the company's brand settings and its shop. */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: brand.shopName === brand.groupName ? brand.shopName : `${brand.shopName} | ${brand.groupName}`,
    description: brand.description || brand.shopName,
  };
}

async function Intro() {
  const brand = await getBrand();
  return (
    <>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>{brand.shopName}{brand.parentLine ? <span>{brand.parentLine}</span> : null}</Link>
        <Link href="/login" prefetch={false} className={styles.login}>Login <span aria-hidden="true">↗</span></Link>
      </header>
      <section className={styles.intro} aria-labelledby="welcome">
        {brand.tagline ? <p className={styles.eyebrow}>{brand.tagline.toUpperCase()}</p> : null}
        <h1 id="welcome">Welcome to {brand.shopName}</h1>
        {brand.description ? <p className={styles.description}>{brand.description}</p> : null}
        <p><Link href="/shop" className={styles.login}>Shop online <span aria-hidden="true">→</span></Link></p>
      </section>
    </>
  );
}

/** The three newest shop products that have a photo. */
async function Gallery() {
  const items = (await getShopProducts()).filter((p) => p.coverId !== null).sort((a, b) => b.id - a.id).slice(0, 3);
  if (items.length === 0) return null;
  return (
    <section className={styles.gallery} aria-label="New in the shop">
      {items.map((p) => (
        <figure key={p.id} className={styles.collection}>
          <Link href={`/shop/${p.id}`} className={styles.photo}>
            <Image src={`/api/shop/media/${p.coverId}`} alt={p.name} fill sizes="(max-width: 640px) 100vw, 33vw" unoptimized />
          </Link>
          <figcaption><h2>{p.name}</h2>{p.fabric ? <p>{p.fabric}</p> : null}</figcaption>
        </figure>
      ))}
    </section>
  );
}

async function Footer() {
  const brand = await getBrand();
  return (
    <footer className={styles.footer}>
      <p>{brand.shopName}{brand.place ? <> <span>·</span> {brand.place}</> : null}</p>
      {brand.websites ? <p>{brand.websites}</p> : null}
    </footer>
  );
}

export default function Home() {
  return (
    <main className={styles.page}>
      <Suspense fallback={null}><Intro /></Suspense>
      <Suspense fallback={null}><Gallery /></Suspense>
      <Suspense fallback={null}><Footer /></Suspense>
    </main>
  );
}
