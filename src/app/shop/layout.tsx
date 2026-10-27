import type { Metadata } from "next";
import { Hanken_Grotesk, Young_Serif } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";

import AnnounceBar from "@/components/shop/AnnounceBar";
import CartLink from "@/components/shop/CartLink";
import styles from "./shop.module.css";

const display = Young_Serif({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Abhiram Textiles | Cotton, sarees and everyday wear", template: "%s | Abhiram Textiles" },
  description: "Cotton sets, everyday essentials and traditional sarees from Abhiram Textiles, Kapra, Hyderabad. We ship across India and worldwide.",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${styles.shell} ${display.variable} ${body.variable}`}>
      <Suspense fallback={null}><AnnounceBar /></Suspense>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/shop" className={styles.brand}>Abhiram Textiles<small>Kapra, Hyderabad</small></Link>
          <nav className={styles.nav}>
            <Link href="/shop?q=saree#products" className={styles.hideSm}>Sarees</Link>
            <Link href="/shop?q=cotton#products" className={styles.hideSm}>Cotton sets</Link>
            <Link href="/shop#products" className={styles.hideSm}>All</Link>
            <CartLink />
          </nav>
        </div>
      </header>
      <div className={styles.main}>{children}</div>
      <footer className={styles.footer}>
        <p>Abhiram Textiles, Kapra, Hyderabad. We ship across India and worldwide.</p>
        <p><a href="https://abhiraminc.com">A part of Abhiram Group</a></p>
      </footer>
    </div>
  );
}
