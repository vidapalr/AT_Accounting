"use client";

import { useState } from "react";

import styles from "@/app/shop/shop.module.css";

export default function VerifyBanner() {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true);
    try {
      const res = await fetch("/api/shop/account/verify-resend", { method: "POST" });
      const d = (await res.json()) as { ok: boolean; sent?: boolean; error?: string };
      setMsg(!d.ok ? d.error ?? "Something went wrong." : d.sent ? "We sent a new link. Please check your inbox and spam." : "We could not send email right now. Please message us on WhatsApp.");
    } catch {
      setMsg("We could not reach the shop. Please try again.");
    }
    setBusy(false);
  }
  return (
    <div role="status" style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: 14, margin: "12px 0" }}>
      <strong>Please confirm your email.</strong> We sent you a link. You need it before you can place an order.
      <div style={{ marginTop: 8 }}>
        <button type="button" className={styles.btn} onClick={resend} disabled={busy}>{busy ? "Please wait…" : "Send the link again"}</button>
        {msg && <span style={{ marginLeft: 10 }}>{msg}</span>}
      </div>
    </div>
  );
}
