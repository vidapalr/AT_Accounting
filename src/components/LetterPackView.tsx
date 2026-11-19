import Letterhead from "@/components/Letterhead";
import type { LetterPack, MoneyRow, PackBlock } from "@/lib/letter-pack";
import { inr } from "@/lib/reports/money";

const NAVY = "#142c50";
const LINE = "#cbd5e1";
const SHADE = "#eef2f8";
const td: React.CSSProperties = { border: `1px solid ${LINE}`, padding: "6px 9px", verticalAlign: "top" };

function Money({ rows }: { rows: MoneyRow[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, margin: "8px 0 14px" }}>
      <thead>
        <tr style={{ background: NAVY, color: "#fff" }}>
          <th style={{ ...td, textAlign: "left" }}>Component</th><th style={{ ...td, textAlign: "right" }}>Monthly</th><th style={{ ...td, textAlign: "right" }}>Annual</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ background: r.style === "grand" ? "#dbe4f1" : r.style ? SHADE : undefined, fontWeight: r.style ? 700 : 400, color: r.style === "head" ? NAVY : undefined }}>
            <td style={td}>{r.label}</td>
            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{r.monthly == null ? "" : inr(r.monthly)}</td>
            <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{r.annual == null ? "" : inr(r.annual)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Block({ b, pack, compact }: { b: PackBlock; pack: LetterPack; compact: boolean }) {
  if (b.kind === "p") return <p style={{ textAlign: "justify", margin: compact ? "0 0 6px" : "0 0 10px" }}>{b.text}</p>;
  if (b.kind === "h") return <h3 style={{ color: NAVY, fontSize: compact ? 13 : 14.5, margin: compact ? "8px 0 2px" : "14px 0 4px" }}>{b.text}</h3>;
  if (b.kind === "note") return <p style={{ color: "#64748b", fontSize: 12 }}>{b.text}</p>;
  if (b.kind === "list") return <ul style={{ paddingLeft: 22, margin: "4px 0 10px" }}>{b.items.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{t}</li>)}</ul>;
  if (b.kind === "facts") {
    return (
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, margin: "8px 0 14px" }}>
        <tbody>{b.rows.map(([k, v]) => <tr key={k}><td style={{ ...td, background: SHADE, color: NAVY, fontWeight: 700, width: "36%" }}>{k}</td><td style={td}>{v}</td></tr>)}</tbody>
      </table>
    );
  }
  if (b.kind === "money") return <Money rows={b.rows} />;
  if (b.kind === "sign") {
    return (
      <div style={{ marginTop: 18 }}>
        <div>Yours sincerely,</div>
        <div style={{ fontWeight: 700 }}>For {pack.employer}</div>
        <div style={{ marginTop: 44, borderTop: "1px solid #0f172a", width: 220, paddingTop: 4 }}>Authorised Signatory</div>
      </div>
    );
  }
  return (
    <div style={{ border: `1.5px solid ${NAVY}`, padding: "12px 14px", marginTop: 18 }}>
      <div style={{ color: NAVY, fontWeight: 800 }}>{b.title}</div>
      <p style={{ textAlign: "justify", margin: "6px 0 34px" }}>{b.text}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, color: "#64748b", fontSize: 12 }}>
        {["Signature", "Date", "Place"].map((l) => <div key={l} style={{ borderTop: "1px solid #0f172a", paddingTop: 4 }}>{l}</div>)}
      </div>
    </div>
  );
}

/**
 * A staff letter on screen, one A4 sheet per page of the pack, ready to print. Draws the same
 * LetterPack as the PDF (src/lib/letter-pack-pdf.ts).
 */
export default function LetterPackView({ pack, address }: { pack: LetterPack; address: string }) {
  const total = pack.pages.length;
  return (
    <>
      {pack.pages.map((page, i) => (
        <section key={i} data-print-sheet style={{ border: "1px solid #cbd5e1", padding: 32, background: "#fff", color: "#0f172a", lineHeight: 1.55, marginBottom: 20, breakAfter: i < total - 1 ? "page" : "auto", fontSize: page.compact ? 12.5 : 14.5 }}>
          <Letterhead address={address} />
          {i === 0 ? (
            <>
              {total > 1 && <div style={{ color: NAVY, fontWeight: 800, fontSize: 11, marginTop: 14 }}>PRIVATE AND CONFIDENTIAL</div>}
              <div style={{ display: "flex", justifyContent: "space-between", margin: "10px 0 14px" }}><span>Ref: {pack.ref}</span><span>Date: {pack.date}</span></div>
              {pack.to.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div>To,</div>
                  {pack.to.map((l, j) => <div key={j} style={{ fontWeight: j === 0 ? 700 : 400 }}>{l}</div>)}
                </div>
              )}
              <p style={{ fontWeight: 700, margin: "0 0 14px" }}>Subject: {pack.subject}</p>
            </>
          ) : (
            <h2 style={{ textAlign: "center", color: NAVY, margin: "18px 0 14px", fontSize: 18 }}>{page.title}</h2>
          )}
          {page.blocks.map((b, j) => <Block key={j} b={b} pack={pack} compact={page.compact === true} />)}
          <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${LINE}`, marginTop: 22, paddingTop: 6, color: "#64748b", fontSize: 11 }}>
            <span>Ref: {pack.ref}</span><span>Page {i + 1} of {total}</span><span>{total > 1 && i > 0 ? "Employee's initials: ________" : pack.employer}</span>
          </div>
        </section>
      ))}
    </>
  );
}
