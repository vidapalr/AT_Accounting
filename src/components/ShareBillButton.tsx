"use client";

import { useState } from "react";
import { billWhatsAppLinkAction } from "@/lib/bill-share-actions";

/** Opens WhatsApp in a new tab, so the bill page stays open and no Back button is needed. */
export default function ShareBillButton({ saleId, label, disabled, style }: { saleId: number; label: string; disabled?: boolean; style?: React.CSSProperties }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function share() {
    setBusy(true);
    setError("");
    // Open the tab straight away (browsers block tabs opened after a wait), then point it at WhatsApp.
    const tab = window.open("about:blank", "_blank");
    try {
      const r = await billWhatsAppLinkAction(saleId);
      if (r.url && tab) tab.location.href = r.url;
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
        {busy ? "Opening…" : label}
      </button>
      {error && <p role="alert" style={{ color: "#b91c1c", margin: "6px 0 0" }}>{error}</p>}
    </>
  );
}
