"use client";

import { useState, useTransition } from "react";
import { markMessageSentAction } from "@/lib/customer-message-actions";
import CopyTextButton from "@/components/CopyTextButton";

type Person = {
  id: number;
  name: string;
  phone: string;
  lastVisit: string | null;
  sent: boolean;
};

/** Pick the words once, then tap each customer. WhatsApp opens with the message ready. */
export default function ShareComposer({
  customers,
  defaultText,
  batchKey,
}: {
  customers: Person[];
  defaultText: string;
  batchKey: string;
}) {
  const [text, setText] = useState(defaultText);
  const [sent, setSent] = useState<Record<number, boolean>>(
    Object.fromEntries(customers.filter(c => c.sent).map(c => [c.id, true]))
  );
  const [, start] = useTransition();
  const [hideSent, setHideSent] = useState(false);

  const shown = customers.filter(c => !(hideSent && sent[c.id]));
  const doneCount = Object.values(sent).filter(Boolean).length;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>1. The message</h2>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={7}
          style={{ width: "100%", padding: 12, fontSize: 16, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box" }}
        />
        <p style={{ color: "#64748b", margin: "8px 0" }}>
          Each customer&apos;s name is added at the start (&ldquo;Hi Ravi,&rdquo;). Add the photo yourself in WhatsApp after it opens.
        </p>
        <CopyTextButton text={text} label="Copy for a WhatsApp group or Instagram" />
      </section>

      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>2. Tap each customer</h2>
        <p style={{ color: "#64748b" }}>
          {customers.length} customer(s) who agreed to WhatsApp messages. Sent: <strong>{doneCount}</strong>.
          {" "}
          <label style={{ marginLeft: 8 }}>
            <input type="checkbox" checked={hideSent} onChange={e => setHideSent(e.target.checked)} /> Hide those already sent
          </label>
        </p>

        {shown.length === 0 && <p>No customers to show.</p>}

        <div style={{ display: "grid", gap: 8 }}>
          {shown.map(c => {
            const personal = `Hi ${c.name.split(" ")[0]},\n${text}`;
            const link = `https://wa.me/91${c.phone}?text=${encodeURIComponent(personal)}`;
            const done = sent[c.id];
            return (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "10px 12px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  background: done ? "#f0fdf4" : "#fff",
                }}
              >
                <div>
                  <strong>{c.name}</strong>
                  <div style={{ color: "#64748b", fontSize: 13 }}>
                    {c.phone.slice(0, 5)} {c.phone.slice(5)}
                    {c.lastVisit ? ` · last visit ${c.lastVisit}` : ""}
                  </div>
                </div>
                <a
                  className={`btn-link${done ? "" : " btn-link-primary"}`}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setSent(s => ({ ...s, [c.id]: true }));
                    start(async () => {
                      await markMessageSentAction(c.id, batchKey, "NEW_STOCK");
                    });
                  }}
                >
                  {done ? "Sent ✔ (send again)" : "Send on WhatsApp"}
                </a>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
