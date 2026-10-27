"use client";

import Link from "next/link";
import { useState } from "react";

import styles from "@/app/shop/shop.module.css";

/** Two small forms in one: ask for a reset link (no token) or choose a new password (with token). */
export default function ResetForm({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body = token ? { token, password: String(f.get("password") ?? "") } : { email: String(f.get("email") ?? "") };
    try {
      const res = await fetch(token ? "/api/shop/account/reset" : "/api/shop/account/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) setError(data.error ?? "Something went wrong.");
      else setDone(true);
    } catch {
      setError("We could not reach the shop. Please check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 460, margin: "10px auto" }}>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400, color: "var(--indigo)" }}>
        {token ? "Choose a new password" : "Forgot your password?"}
      </h1>
      {done ? (
        <>
          <p>{token ? "Your password is changed. You can log in now." : "If there is an account with that email, we have sent a link to reset your password. It works for 1 hour."}</p>
          <Link href="/shop/account/login" className={styles.btn}>Go to log in</Link>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          {!token && <p className={styles.muted}>Type the email you signed up with. We will send you a link.</p>}
          {token
            ? <label>New password (at least 8 characters)<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>
            : <label>Email<input name="email" type="email" required autoComplete="email" /></label>}
          {error && <p className={styles.err} role="alert">{error}</p>}
          <div><button type="submit" className={styles.btn} disabled={busy}>{busy ? "Please wait…" : token ? "Save new password" : "Send me the link"}</button></div>
          <p className={styles.muted}><Link href="/shop/account/login">Back to log in</Link></p>
        </form>
      )}
    </div>
  );
}
