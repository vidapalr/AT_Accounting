import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { confirmEmailAction } from "@/lib/shop-verify-actions";
import styles from "../../shop.module.css";

export const metadata: Metadata = { title: "Confirm your email" };

async function Content({ searchParams }: { searchParams: Promise<{ token?: string; done?: string; bad?: string }> }) {
  const { token = "", done, bad } = await searchParams;
  const h1 = { fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400, color: "var(--indigo)" } as const;
  return (
    <div style={{ maxWidth: 460, margin: "10px auto" }}>
      <h1 style={h1}>Confirm your email</h1>
      {done ? (
        <>
          <p>Thank you. Your email is confirmed.</p>
          <Link href="/shop" className={styles.btn}>Continue shopping</Link>
        </>
      ) : bad || !/^[a-f0-9]{64}$/.test(token) ? (
        <>
          <p className={styles.err}>This link has expired or was already used.</p>
          <p>Log in and ask for a new link on your account page.</p>
          <Link href="/shop/account" className={styles.btn}>My account</Link>
        </>
      ) : (
        <form action={confirmEmailAction}>
          <input type="hidden" name="token" value={token} />
          <p>Press the button to confirm that this is your email.</p>
          <button type="submit" className={styles.btn}>Yes, confirm my email</button>
        </form>
      )}
    </div>
  );
}

export default function Page(props: { searchParams: Promise<{ token?: string; done?: string; bad?: string }> }) {
  return <Suspense fallback={null}><Content {...props} /></Suspense>;
}
