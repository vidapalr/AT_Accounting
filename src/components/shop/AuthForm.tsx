"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "@/app/shop/shop.module.css";

export default function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const register = mode === "register";
  const other = `/shop/account/${register ? "login" : "register"}?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body: Record<string, string> = { email: String(f.get("email") ?? ""), password: String(f.get("password") ?? ""), next };
    if (register) { body.name = String(f.get("name") ?? ""); body.phone = String(f.get("phone") ?? ""); }
    try {
      const res = await fetch(`/api/shop/account/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { ok: boolean; error?: string; next?: string };
      if (!data.ok) { setError(data.error ?? "Something went wrong."); setBusy(false); return; }
      router.push(data.next ?? "/shop/account");
      router.refresh();
    } catch {
      setError("We could not reach the shop. Please check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 460, margin: "10px auto" }}>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 400, color: "var(--indigo)" }}>
        {register ? "Create your account" : "Log in"}
      </h1>
      <p className={styles.muted}>
        {next === "/shop/checkout"
          ? "You need an account to place an order. Your cart is saved."
          : register ? "One account for all your orders." : "Welcome back."}
      </p>
      <form className={styles.form} onSubmit={submit}>
        {register && <label>Full name<input name="name" required autoComplete="name" /></label>}
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        {register && <label>Phone / WhatsApp (with country code)<input name="phone" type="tel" required autoComplete="tel" placeholder="+91 98765 43210" /></label>}
        <label>Password{register ? " (at least 8 characters)" : ""}
          <input name="password" type="password" required minLength={register ? 8 : undefined} autoComplete={register ? "new-password" : "current-password"} />
        </label>
        {error && <p className={styles.err} role="alert">{error}</p>}
        <div><button type="submit" className={styles.btn} disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Log in"}</button></div>
        {!register && <p className={styles.muted}><Link href="/shop/account/forgot">Forgot password?</Link></p>}
        <p className={styles.muted}>
          {register ? "Already have an account? " : "New here? "}
          <Link href={other}>{register ? "Log in" : "Create an account"}</Link>
        </p>
      </form>
    </div>
  );
}
