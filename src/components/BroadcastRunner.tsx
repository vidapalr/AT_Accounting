"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendNextBatchAction } from "@/lib/broadcast-actions";

/** Sends the list a few at a time while this page is open. Safe to close and continue later. */
export default function BroadcastRunner({ broadcastId, waiting, autostart }: { broadcastId: number; waiting: number; autostart: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(0);
  const started = useRef(false);

  async function run() {
    if (running) return;
    setRunning(true); setNote("");
    let total = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const r = await sendNextBatchAction(broadcastId);
        total += r.sent; setSent(total);
        if (r.message) setNote(r.message);
        if (r.state !== "more") break;
      }
    } catch {
      setNote("The connection was lost. Open this page again and press Continue sending: nobody gets the message twice.");
    }
    setRunning(false);
    router.refresh();
  }

  useEffect(() => {
    if (autostart && waiting > 0 && !started.current) { started.current = true; void run(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ marginBottom: 12 }}>
      {waiting > 0 && !running && (
        <button type="button" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 17, padding: "14px 22px" }} onClick={run}>
          Continue sending ({waiting} waiting)
        </button>
      )}
      {running && <p role="status" style={{ fontWeight: 600 }}>Sending… {sent} sent so far. Keep this page open.</p>}
      {note && <p role="alert" style={{ color: "#b91c1c" }}>{note}</p>}
    </div>
  );
}
