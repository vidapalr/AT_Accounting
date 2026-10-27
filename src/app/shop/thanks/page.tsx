import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import styles from "../shop.module.css";

export const metadata: Metadata = { title: "Thank you" };

async function Thanks({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const no = String((await searchParams).no ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 20);
  return (
    <div className={styles.thanks}>
      <h1>Thank you!</h1>
      <p>We have your order request.</p>
      {no && <div className={styles.orderNo}>{no}</div>}
      <p className={styles.muted}>We will message you soon on WhatsApp or email to confirm availability, shipping and how to pay. Please keep this number for reference.</p>
      <Link href="/shop" className={styles.btn}>Keep shopping</Link>
    </div>
  );
}

export default function ThanksPage(props: { searchParams: Promise<{ no?: string }> }) {
  return <Suspense fallback={null}><Thanks {...props} /></Suspense>;
}
