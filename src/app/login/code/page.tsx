import { Suspense } from "react";
import { redirect } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { readChallenge } from "@/lib/two-step";
import styles from "../login.module.css";

export default function CodePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <Suspense fallback={<main className={styles.page}><section className={styles.card}><p>Loading...</p></section></main>}>
      <CodeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CodeContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await readChallenge())) redirect("/login?error=4");
  const params = await searchParams;
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.logo}><BrandLogo size={52} /></div>
        <p className={styles.brand}>ABHIRAM GROUP</p>
        <h1>Enter your code</h1>
        <p className={styles.subtitle}>
          Open your authenticator app and type the 6-digit code. Lost your phone? Type one of your backup codes instead.
        </p>
        {params.error && <div className={styles.error} role="alert">That code is not right. Please try again.</div>}
        <form action="/api/auth/login/code" method="POST" className={styles.form}>
          <label htmlFor="code">6-digit code or backup code</label>
          <input id="code" name="code" type="text" inputMode="text" autoComplete="one-time-code"
            autoFocus required maxLength={20} placeholder="123456" />
          <button type="submit">Continue</button>
        </form>
        <p className={styles.footer}><a href="/login">Start again</a></p>
      </section>
    </main>
  );
}
