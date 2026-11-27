"use client";

import { useMemo, useState } from "react";

import SubmitButton from "@/components/SubmitButton";
import { saveBankTicksAction } from "@/lib/bank-reconcile-actions";

/** Money arrives as paise strings (the page cannot hand bigint to the browser). */
export type ReconRow = { id: number; date: string; text: string; moneyIn: string; moneyOut: string; running?: string; ticked: boolean };

const rs = (paise: bigint) => {
  const neg = paise < 0n, a = neg ? -paise : paise;
  return `${neg ? "−" : ""}₹${(a / 100n).toLocaleString("en-IN")}.${String(a % 100n).padStart(2, "0")}`;
};
const toPaise = (raw: string): bigint | null => {
  const s = raw.replace(/[,₹\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const [w, f = ""] = s.replace("-", "").split(".");
  const p = BigInt(w) * 100n + BigInt((f + "00").slice(0, 2));
  return neg ? -p : p;
};
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", verticalAlign: "top" };
const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const tile: React.CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 10, padding: 14, background: "#fff" };

export default function BankReconcileTable(p: {
  bankId: number; from: string; to: string; opening: string; booksBalance: string; tickedOffScreen: string;
  older: ReconRow[]; lines: ReconRow[]; bankBalance: string;
}) {
  const all = useMemo(() => [...p.older, ...p.lines], [p.older, p.lines]);
  const [ticks, setTicks] = useState<Set<number>>(() => new Set(all.filter((l) => l.ticked).map((l) => l.id)));
  const [bankText, setBankText] = useState(p.bankBalance);

  const ticked = all.reduce((sum, l) => (ticks.has(l.id) ? sum + BigInt(l.moneyIn) - BigInt(l.moneyOut) : sum), BigInt(p.tickedOffScreen));
  const bank = bankText.trim() ? toPaise(bankText) : null;
  const diff = bank === null ? null : bank - ticked;
  const toggle = (id: number) => setTicks((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setAll = (on: boolean) => setTicks(on ? new Set(all.map((l) => l.id)) : new Set());

  const row = (l: ReconRow) => {
    const inn = BigInt(l.moneyIn), out = BigInt(l.moneyOut), on = ticks.has(l.id);
    return (
      <tr key={l.id} style={on ? { background: "#f0fdf4" } : undefined}>
        <td style={cell}><input type="checkbox" checked={on} onChange={() => toggle(l.id)} aria-label={`Seen on the bank statement: ${l.text}`} style={{ width: 20, height: 20 }} /></td>
        <td style={{ ...cell, whiteSpace: "nowrap" }}>{pretty(l.date)}</td>
        <td style={cell}>{l.text}</td>
        <td style={num}>{inn > 0n ? rs(inn) : ""}</td>
        <td style={num}>{out > 0n ? rs(out) : ""}</td>
        <td style={num}>{l.running !== undefined ? rs(BigInt(l.running)) : ""}</td>
      </tr>
    );
  };

  return (
    <form action={saveBankTicksAction}>
      <input type="hidden" name="bank" value={p.bankId} />
      <input type="hidden" name="from" value={p.from} />
      <input type="hidden" name="to" value={p.to} />
      <input type="hidden" name="shown_json" value={JSON.stringify(all.map((l) => l.id))} />
      <input type="hidden" name="ticked_json" value={JSON.stringify([...ticks])} />

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", margin: "12px 0" }}>
        <div style={tile}><div style={{ color: "#64748b" }}>Opening balance (books)</div><strong style={{ fontSize: 20 }}>{rs(BigInt(p.opening))}</strong><div style={{ color: "#64748b", fontSize: 13 }}>Before {pretty(p.from)}</div></div>
        <div style={tile}><div style={{ color: "#64748b" }}>Books balance</div><strong style={{ fontSize: 20 }}>{rs(BigInt(p.booksBalance))}</strong><div style={{ color: "#64748b", fontSize: 13 }}>On {pretty(p.to)}</div></div>
        <div style={tile}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ color: "#64748b" }}>Bank&rsquo;s balance on {pretty(p.to)}</span>
            <input name="bank_balance" inputMode="decimal" value={bankText} onChange={(e) => setBankText(e.target.value)} placeholder="From the statement" style={{ fontSize: 18, padding: "6px 8px", border: "1px solid #94a3b8", borderRadius: 6 }} />
          </label>
        </div>
        <div style={tile}><div style={{ color: "#64748b" }}>Ticked balance</div><strong style={{ fontSize: 20 }}>{rs(ticked)}</strong><div style={{ color: "#64748b", fontSize: 13 }}>Only entries seen in the bank</div></div>
        <div style={{ ...tile, borderColor: diff === null ? "#cbd5e1" : diff === 0n ? "#16a34a" : "#dc2626" }}>
          <div style={{ color: "#64748b" }}>Difference</div>
          <strong style={{ fontSize: 20, color: diff === null ? undefined : diff === 0n ? "#166534" : "#b91c1c" }}>{diff === null ? "—" : diff === 0n ? "Matched" : rs(diff)}</strong>
          <div style={{ color: "#64748b", fontSize: 13 }}>{diff === null ? "Type the bank's balance" : diff === 0n ? "Ticked entries equal the bank" : "Still to find"}</div>
        </div>
      </div>

      <p style={{ color: "#475569", margin: "4px 0 10px" }}>
        Go down the bank statement and tick each entry you can see there. When the ticked balance equals the bank&rsquo;s balance, everything is matched.
        Entries left unticked are ones the bank has not shown yet (a cheque not cleared, a deposit on the way) or a mistake to look into.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <button type="button" className="btn-link" onClick={() => setAll(true)}>Tick all</button>
        <button type="button" className="btn-link" onClick={() => setAll(false)}>Untick all</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>
              <th style={cell} title="Seen on the bank statement">Seen</th><th style={cell}>Date</th><th style={cell}>What</th>
              <th style={num}>Money in</th><th style={num}>Money out</th><th style={num}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {p.older.length > 0 && (
              <tr><td colSpan={6} style={{ ...cell, background: "#fffbeb", fontWeight: 600 }}>From before {pretty(p.from)}, not yet seen in the bank</td></tr>
            )}
            {p.older.map(row)}
            <tr style={{ background: "#f8fafc" }}>
              <td style={cell}></td><td style={{ ...cell, whiteSpace: "nowrap" }}>{pretty(p.from)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>Opening balance</td><td style={num}></td><td style={num}></td>
              <td style={{ ...num, fontWeight: 700 }}>{rs(BigInt(p.opening))}</td>
            </tr>
            {p.lines.map(row)}
            {p.lines.length === 0 && <tr><td colSpan={6} style={{ ...cell, color: "#64748b" }}>No entries in these dates.</td></tr>}
            <tr style={{ background: "#f8fafc" }}>
              <td style={cell}></td><td style={{ ...cell, whiteSpace: "nowrap" }}>{pretty(p.to)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>Closing balance (books)</td><td style={num}></td><td style={num}></td>
              <td style={{ ...num, fontWeight: 700 }}>{rs(BigInt(p.booksBalance))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
        <SubmitButton label="Save ticks" />
        <button type="submit" name="finish" value="1" className="btn-link btn-link-primary" disabled={diff !== 0n}
          title={diff === 0n ? "" : "Possible once the difference is 0"} style={{ padding: "10px 16px" }}>
          Save as matched up to {pretty(p.to)}
        </button>
      </div>
    </form>
  );
}
