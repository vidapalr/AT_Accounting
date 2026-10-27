import Link from "next/link";

import { getShopCustomer } from "@/lib/shop-account";
import styles from "@/app/shop/shop.module.css";

export default async function AccountLink() {
  const me = await getShopCustomer().catch(() => null);
  return me
    ? <Link href="/shop/account" className={styles.hideSm}>My account</Link>
    : <Link href="/shop/account/login" className={styles.hideSm}>Log in</Link>;
}
