"use client";

import { useRouter } from "next/navigation";

import styles from "@/app/shop/shop.module.css";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button" className={styles.btnGhost}
      onClick={async () => { await fetch("/api/shop/account/logout", { method: "POST" }); router.push("/shop"); router.refresh(); }}
    >
      Log out
    </button>
  );
}
