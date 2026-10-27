import type { Metadata } from "next";
import Link from "next/link";

import CartLink from "@/components/shop/CartLink";
import styles from "./shop.module.css";

export const metadata: Metadata = {
  title: { default: "Abhiram Textiles | Cotton, sarees and everyday wear", template: "%s | Abhiram Textiles" },
  description: "Cotton sets, everyday essentials and traditional sarees from Abhiram Textiles, Kapra, Hyderabad. We ship across India and worldwide.",
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/shop" className={styles.brand}>Abhiram Textiles<small>Kapra · Hyderabad</small></Link>
          <nav className={styles.nav}>
            <Link href="/shop" className={styles.hideSm}>Shop</Link>
            <CartLink />
          </nav>
        </div>
      </header>
      <div className={styles.main}>{children}</div>
      <footer className={styles.footer}>
        <p>Abhiram Textiles · Kapra, Hyderabad · We ship across India and worldwide.</p>
        <p><a href="https://abhiraminc.com">A part of Abhiram Group</a></p>
      </footer>
    </div>
  );
}
