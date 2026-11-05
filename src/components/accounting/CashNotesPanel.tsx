"use client";

import { useState } from "react";
import { NOTE_KINDS, notesValue, type NoteCounts } from "@/lib/cash-notes";

const inr = (n: number) => n.toLocaleString("en-IN");
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, marginTop: 8, background: "#fff" };
const cellInput: React.CSSProperties = { width: 80, padding: "10px 8px", fontSize: 16, textAlign: "center" };

function Counter({ label, notes, onChange }: { label: string; notes: NoteCounts; onChange: (n: NoteCounts) => void }) {
  const set = (v: number, raw: string) => {
    const n = Math.max(0, Math.floor(Number(raw.replace(/\D/g, "")) || 0));
    const next = { ...notes };
    if (n > 0) next[String(v)] = n; else delete next[String(v)];
    onChange(next);
  };
  return (
    <div style={{ marginBottom: 8 }}>
      <strong>{label}</strong>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
        {NOTE_KINDS.map(v => (
          <label key={v} style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 14 }}>
            ₹{v}
            <input
              inputMode="numeric" placeholder="0" aria-label={`${label}: number of ₹${v} notes`}
              value={notes[String(v)] ?? ""} onChange={e => set(v, e.target.value)} style={cellInput}
            />
          </label>
        ))}
      </div>
      <div style={{ marginTop: 4, color: "#475569" }}>Total ₹{inr(notesValue(notes))}</div>
    </div>
  );
}

/** For one cash payment: which notes the customer gave, and which notes went back as change. */
export default function CashNotesPanel({
  amount, notesIn, notesOut, onChange,
}: {
  amount: string;
  notesIn: NoteCounts;
  notesOut: NoteCounts;
  onChange: (patch: { notesIn?: NoteCounts; notesOut?: NoteCounts }) => void;
}) {
  const [open, setOpen] = useState(false);
  const pay = Number(amount) || 0;
  const got = notesValue(notesIn);
  const back = notesValue(notesOut);
  const due = got > 0 ? Math.max(0, got - pay) : 0;
  const entered = got > 0 || back > 0;
  const wrong = entered && Math.abs(got - back - pay) >= 1;

  return (
    <div style={{ flexBasis: "100%" }}>
      <button type="button" onClick={() => setOpen(!open)} style={{ cursor: "pointer", fontSize: 16, padding: "12px 16px", minHeight: 44 }}>
        {open ? "Hide notes" : entered ? `Notes noted: received ₹${inr(got)}, change ₹${inr(back)}` : "Note the notes (received and change)"}
      </button>
      {open && (
        <div style={box}>
          <Counter label="Notes the customer gave" notes={notesIn} onChange={n => onChange({ notesIn: n })} />
          {got > 0 && (
            <p style={{ margin: "6px 0", fontWeight: 600, color: due > 0 ? "#92400e" : "#166534" }}>
              {due > 0 ? `Give back ₹${inr(due)} as change` : got === pay ? "Exact amount, no change" : got < pay ? `₹${inr(pay - got)} more to receive in notes (coins or other)` : ""}
            </p>
          )}
          {due > 0 && <Counter label="Notes you gave back" notes={notesOut} onChange={n => onChange({ notesOut: n })} />}
          {wrong && due > 0 && (
            <p style={{ color: "#b91c1c" }}>
              Change given is ₹{inr(back)} but ₹{inr(due)} is due. Please check the notes.
            </p>
          )}
          <p style={{ color: "#64748b", margin: "6px 0 0" }}>
            This is only a record for closing the day. The bill amount above is what is saved as paid.
          </p>
        </div>
      )}
    </div>
  );
}
