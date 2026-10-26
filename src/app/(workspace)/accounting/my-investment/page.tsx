import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { inr, isDate, todayInIndia } from "@/lib/reports/money";
import { loadInvestorStatement } from "@/lib/investor-statement";
import PrintHeader from "@/components/PrintHeader";
import PrintButton from "@/components/PrintButton";

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

async function Content({ searchParams }: Props) {
  const user = await requireAccess("investor_view");
  const businessId = user.legal_business_id;
  const query = await searchParams;

  if (!user.party_id) {
    return <main style={{ padding: 16 }}><h1>My investment</h1><p>Your login is not tied to an investor yet. Please ask the owner to set it up.</p></main>;
  }

  const today = todayInIndia();
  const [fy] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on FROM acct_financial_years WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ? LIMIT 1`,
    [businessId, today, today]
  );
  const from = isDate(query.from) ? query.from! : String(fy[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const to = isDate(query.to) ? query.to! : today;

  const s = await loadInvestorStatement(db, businessId, Number(user.party_id), from, to);
  if (!s) return <main style={{ padding: 16 }}><h1>My investment</h1><p>Your investor record was not found. Please ask the owner.</p></main>;

  const totalIn = s.agreements.reduce((t, a) => t + a.received, 0n);
  const totalBack = s.agreements.reduce((t, a) => t + a.paidBack, 0n);
  const totalPaid = s.agreements.reduce((t, a) => t + a.returnsPaid, 0n);
  const shareTotal = s.payableByAgreement.reduce((t, x) => t + x.payable, 0n);

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <PrintHeader title={`Investment statement: ${s.partyName}`} subtitle={`Profit period ${pretty(from)} to ${pretty(to)}`} />
      <h1>My investment</h1>
      <p style={{ color: "#64748b" }}>{s.partyName}. This page shows only your own agreements and money.</p>

      <section style={box}>
        <h2>Money in and out</h2>
        <p style={{ fontSize: 18 }}>
          You put in <strong>{inr(totalIn)}</strong>. Capital paid back to you <strong>{inr(totalBack)}</strong>. Still invested <strong>{inr(totalIn - totalBack)}</strong>.
          Profit and interest paid to you so far <strong>{inr(totalPaid)}</strong>.
        </p>
      </section>

      <section style={box}>
        <h2>Your agreements</h2>
        {s.agreements.length === 0 ? <p>No active agreements.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr><th style={cell}>Agreement</th><th style={cell}>Profit share</th><th style={right}>Agreed amount</th><th style={right}>Put in</th><th style={right}>Paid back</th><th style={cell}>Dates</th></tr></thead>
              <tbody>
                {s.agreements.map((a) => (
                  <tr key={a.id}>
                    <td style={cell}><strong>{a.no}</strong><br /><span style={{ color: "#64748b", fontSize: 13 }}>{a.type} · pays {a.payoutFrequency}{a.status === "CLOSED" ? " · closed" : ""}</span></td>
                    <td style={cell}>{a.sharePercent ? `${a.sharePercent} of ${a.basis?.toLowerCase() ?? "profit"}` : "Fixed terms"}</td>
                    <td style={right}>{inr(a.committed)}</td>
                    <td style={right}>{inr(a.received)}</td>
                    <td style={right}>{inr(a.paidBack)}</td>
                    <td style={cell}>{pretty(a.from)}{a.to ? ` to ${pretty(a.to)}` : " onwards"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={box}>
        <h2>Your profit share</h2>
        <form className="no-print" method="GET" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", margin: "8px 0" }}>
          <label>From<input type="date" name="from" defaultValue={from} /></label>
          <label>To<input type="date" name="to" defaultValue={to} /></label>
          <button type="submit" className="btn-link btn-link-primary">Show</button> <PrintButton />
        </form>
        {s.profit.length === 0 ? <p>No profit-linked agreement applies in these dates.</p> : (
          <>
            <p style={{ fontSize: 18 }}>Your share for these dates: <strong>{inr(shareTotal)}</strong></p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead><tr><th style={cell}>Agreement</th><th style={cell}>Dates</th><th style={cell}>Share of</th><th style={right}>That profit</th><th style={right}>Your part</th></tr></thead>
                <tbody>
                  {s.profit.map((r, i) => (
                    <tr key={i}>
                      <td style={cell}>{r.agreementNo}</td>
                      <td style={cell}>{pretty(r.from)} to {pretty(r.to)}</td>
                      <td style={cell}>{r.sharePercent} of {r.basis.toLowerCase()}</td>
                      <td style={right}>{inr(r.profitBase)}</td>
                      <td style={right}>{inr(r.share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "#64748b" }}>A calculation from the books for these dates. The amount actually paid appears under &ldquo;Money in and out&rdquo; once the owner pays it. A loss reduces later profit and is never charged to you as a payment.</p>
          </>
        )}
      </section>

      <section style={box}>
        <h2>Payments and receipts</h2>
        {s.transactions.length === 0 ? <p>Nothing recorded yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead><tr><th style={cell}>Date</th><th style={cell}>What</th><th style={cell}>Agreement</th><th style={right}>Amount</th></tr></thead>
              <tbody>
                {s.transactions.map((t) => (
                  <tr key={t.no}><td style={cell}>{pretty(t.date)}</td><td style={cell}>{t.type}<br /><span style={{ color: "#64748b", fontSize: 13 }}>{t.no} · {t.method}</span></td><td style={cell}>{t.agreementNo}</td><td style={right}>{inr(t.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
