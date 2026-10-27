"use client";

import Link from "next/link";

import styles from "@/app/shop/shop.module.css";
import { useCart } from "./cart-store";

export default function CartLink() {
  const lines = useCart();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <Link href="/shop/cart" className={styles.cartLink}>
      Cart{count > 0 && <span className={styles.badge}>{count}</span>}
    </Link>
  );
}
