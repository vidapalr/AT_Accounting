"use client";

import { useState } from "react";

const NOTES = [500, 200, 100, 50, 20, 10];
const inr = (n: number) => n.toLocaleString("en-IN");
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };

/** Count notes by kind; the total fills the "counted" amount. Typing the amount directly still works. */
export default function NoteCounter() {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [coins, setCoins] = useState("");
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);

  const n = (v: number) => Math.max(0, Math.floor(Number(counts[v] || 0)) || 0);
  const coinsRs = Math.max(0, Math.floor(Number(coins || 0)) || 0);
  const used = NOTES.some((v) => n(v) > 0) || coinsRs > 0;
  const total = NOTES.reduce((s, v) => s + n(v) * v, 0) + coinsRs;
  const payload = used
    ? JSON.stringify({ notes: Object.fromEntries(NOTES.map((v) => [String(v), n(v)])), coins: coinsRs * 100 })
    : "";

  return (
    <div style={{ flexBasis: "100%" }}>
      <label>Cash you counted now (₹)<br />
        <input
          name="counted" inputMode="decimal" required placeholder="0"
          value={used ? String(total) : typed}
          readOnly={used}
          onChange={(e) => setTyped(e.target.value)}
          style={{ ...field, width: 170, background: used ? "#f1f5f9" : undefined }}
        />
      </label>
      <input type="hidden" name="denominations" value={payload} />
      <p style={{ margin: "8px 0" }}>
        <button type="button" onClick={() => setOpen(!open)} style={{ cursor: "pointer", fontSize: 15, padding: "8px 14px" }}>
          {open ? "Hide note counter" : "Count by notes"}
        </button>
        {used && <span style={{ marginLeft: 12, color: "#166534" }}>Total from notes: ₹{inr(total)}</span>}
      </p>
      {open && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, maxWidth: 460 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr><th align="left">Note</th><th align="left">How many</th><th align="right">Amount</th></tr></thead>
            <tbody>
              {NOTES.map((v) => (
                <tr key={v}>
                  <td style={{ padding: "6px 4px" }}>₹{v}</td>
                  <td>
                    <input inputMode="numeric" value={counts[v] ?? ""} placeholder="0" aria-label={`Number of ₹${v} notes`}
                      onChange={(e) => setCounts({ ...counts, [v]: e.target.value.replace(/\D/g, "") })}
                      style={{ ...field, width: 90 }} />
                  </td>
                  <td align="right">₹{inr(n(v) * v)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: "6px 4px" }}>Coins (₹)</td>
                <td>
                  <input inputMode="numeric" value={coins} placeholder="0" aria-label="Total rupees in coins"
                    onChange={(e) => setCoins(e.target.value.replace(/\D/g, ""))} style={{ ...field, width: 90 }} />
                </td>
                <td align="right">₹{inr(coinsRs)}</td>
              </tr>
              <tr><td colSpan={2}><strong>Total</strong></td><td align="right"><strong>₹{inr(total)}</strong></td></tr>
            </tbody>
          </table>
          <p style={{ color: "#64748b", marginBottom: 0 }}>The total is put in the box above. Clear all counts to type the amount yourself.</p>
        </div>
      )}
    </div>
  );
}
