import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import AnnounceBar from "@/components/shop/AnnounceBar";
import AccountLink from "@/components/shop/AccountLink";
import CartLink from "@/components/shop/CartLink";
import { getBrand } from "@/lib/brand";
import { shopNavLinks } from "@/lib/shop-nav";
import { shopBody, shopDisplay } from "@/fonts";
import styles from "./shop.module.css";

/** Title and description come from the company's brand settings. */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const head = brand.tagline ? `${brand.shopName} | ${brand.tagline}` : brand.shopName;
  return {
    title: { default: head, template: `%s | ${brand.shopName}` },
    description: brand.description || `${brand.shopName}${brand.place ? `, ${brand.place}` : ""}.`,
  };
}

async function BrandMark() {
  const brand = await getBrand();
  return <Link href="/shop" className={styles.brand}>{brand.shopName}{brand.tagline ? <small>{brand.tagline}</small> : null}</Link>;
}

async function NavLinks() {
  const links = await shopNavLinks();
  return (
    <>
      {links.map((l) => <Link key={l.href} href={l.href} className={styles.hideSm}>{l.label}</Link>)}
    </>
  );
}

async function Footer() {
  const brand = await getBrand();
  return (
    <footer className={styles.footer}>
      <p style={{ fontWeight: 700 }}>{brand.shopName}</p>
      {brand.tagline ? <p style={{ fontStyle: "italic" }}>{brand.tagline}</p> : null}
      <p>We ship across India and worldwide.</p>
      {brand.parentLine ? <p>{brand.parentLine}</p> : null}
    </footer>
  );
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.shell} ${shopDisplay.variable} ${shopBody.variable}`}>
      <Suspense fallback={null}><AnnounceBar /></Suspense>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Suspense fallback={<span className={styles.brand} />}><BrandMark /></Suspense>
          <nav className={styles.nav}>
            <Suspense fallback={null}><NavLinks /></Suspense>
            <Link href="/shop#products" className={styles.hideSm}>All</Link>
            <Suspense fallback={null}><AccountLink /></Suspense>
            <CartLink />
          </nav>
        </div>
      </header>
      <div className={styles.main}>{children}</div>
      <Suspense fallback={null}><Footer /></Suspense>
    </div>
  );
}
