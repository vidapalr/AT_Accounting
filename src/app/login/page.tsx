
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import styles from "./login.module.css";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <section className={styles.card}>
            <p>Loading...</p>
          </section>
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.logo}>AG</div>

        <p className={styles.brand}>ABHIRAM GROUP</p>
        <h1>Accounting Portal</h1>
        <p className={styles.subtitle}>
          Sign in to manage your business finances.
        </p>

        {params.error && (
          <div className={styles.error} role="alert">
            {params.error === "1"
              ? "Invalid email or password."
              : "Unable to sign in. Please try again."}
          </div>
        )}

        <form
          action="/api/auth/login"
          method="POST"
          className={styles.form}
        >
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={190}
            placeholder="Enter your email"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Enter your password"
          />

          <button type="submit">Sign In</button>
        </form>

        <p className={styles.footer}>
          Secure Financial Management
        </p>
      </section>
    </main>
  );
}
