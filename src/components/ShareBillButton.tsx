"use client";

import { useState } from "react";
import { billWhatsAppLinkAction } from "@/lib/bill-share-actions";

/**
 * Sends the bill on WhatsApp.
 * Automatic mode (owner switched it on): the app sends it and says so; if WhatsApp refuses, a button opens WhatsApp so staff send by hand.
 * Manual mode: WhatsApp opens in a new tab with the message ready, so the bill page stays open.
 */
export default function ShareBillButton({ saleId, label, disabled, style, auto = false }: { saleId: number; label: string; disabled?: boolean; style?: React.CSSProperties; auto?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [fallback, setFallback] = useState<{ url: string; note: string } | null>(null);
  async function share() {
    setBusy(true);
    setError("");
    setDone("");
    setFallback(null);
    // Manual mode: open the tab straight away (browsers block tabs opened after a wait), then point it at WhatsApp.
    const tab = auto ? null : window.open("about:blank", "_blank");
    try {
      const r = await billWhatsAppLinkAction(saleId);
      if (r.sent) setDone("Sent to the customer on WhatsApp.");
      else if (r.url && auto) setFallback({ url: r.url, note: r.note ?? "" });
      else if (r.url && tab) tab.location.href = r.url;
      else if (r.url) window.location.href = r.url;
      else { tab?.close(); setError(r.error ?? "Could not open WhatsApp."); }
    } catch {
      tab?.close();
      setError("Could not open WhatsApp. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="btn-link btn-link-primary" style={{ cursor: "pointer", ...style }} disabled={disabled || busy} onClick={share}>
        {busy ? (auto ? "Sending…" : "Opening…") : label}
      </button>
      {done && <p role="status" style={{ color: "#166534", margin: "6px 0 0" }}>{done}</p>}
      {fallback && (
        <p role="alert" style={{ margin: "6px 0 0", color: "#92400e" }}>
          {fallback.note}{" "}
          <a className="btn-link btn-link-primary" href={fallback.url} target="_blank" rel="noreferrer">Open WhatsApp to send by hand</a>
        </p>
      )}
      {error && <p role="alert" style={{ color: "#b91c1c", margin: "6px 0 0" }}>{error}</p>}
    </>
  );
}
