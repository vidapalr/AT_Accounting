import { Fragment, Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { loadCashFlow } from "@/lib/reports/cash-flow-data";
import { inr, isDate, todayInIndia } from "@/lib/reports/money";

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const field: React.CSSProperties = { padding: "9px 12px", fontSize: 15, minWidth: 0 };
const money = (v: bigint) => <span style={{ color: v < 0n ? "#b91c1c" : undefined }}>{inr(v)}</span>;

async function CashFlowContent({ searchParams }: Props) {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const today = todayInIndia();
  const [years] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on FROM acct_financial_years
     WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ? LIMIT 1`,
    [businessId, today, today]
  );
  const from = isDate(query.from) ? query.from : String(years[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const to = isDate(query.to) ? query.to : today;
  const flow = await loadCashFlow(db, businessId, from, to);
  const placesTotal = flow.places.reduce((s, p) => s + p.paise, 0n);

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <style>{`@media print { aside, form { display: none !important; } main { padding: 0 !important; } }`}</style>
      <h1>Where the money went</h1>
      <p style={{ color: "#64748b" }}>
        Cash and bank money of the business: what you started with, what came in and went out, and what you have now.
        Money in an investor&apos;s own bank is not included.
      </p>
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", margin: "12px 0" }}>
        <label>From<br /><input type="date" name="from" defaultValue={from} style={field} /></label>
        <label>To<br /><input type="date" name="to" defaultValue={to} style={field} /></label>
        <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 15, padding: "10px 18px" }}>Show</button>
      </form>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          <tr><th style={cell}>Money at the start ({from})</th><th style={num}>{money(flow.openingPaise)}</th></tr>
          {flow.sections.map((s) => (
            <Fragment key={s.section}>
              <tr><th colSpan={2} style={{ ...cell, paddingTop: 16, color: "#334155" }}>{s.title}</th></tr>
              {s.lines.map((l) => (
                <tr key={`${s.section}-${l.label}`}><td style={{ ...cell, paddingLeft: 24 }}>{l.label}</td><td style={num}>{money(l.paise)}</td></tr>
              ))}
              <tr><td style={{ ...cell, fontWeight: 600 }}>Net {s.title.toLowerCase()}</td><td style={{ ...num, fontWeight: 600 }}>{money(s.total)}</td></tr>
            </Fragment>
          ))}
          {flow.sections.length === 0 && <tr><td style={cell} colSpan={2}>No money moved in these dates.</td></tr>}
          <tr><th style={{ ...cell, paddingTop: 16 }}>Change in the period</th><th style={{ ...num, paddingTop: 16 }}>{money(flow.movement)}</th></tr>
          <tr><th style={cell}>Money at the end ({to})</th><th style={num}>{money(flow.closingPaise)}</th></tr>
        </tbody>
      </table>

      <h2 style={{ marginTop: 24 }}>Where it is now</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <tbody>
          {flow.places.map((p) => (
            <tr key={p.code}><td style={cell}>{p.name}</td><td style={num}>{money(p.paise)}</td></tr>
          ))}
          <tr><th style={cell}>Total</th><th style={num}>{money(placesTotal)}</th></tr>
        </tbody>
      </table>
      {placesTotal !== flow.closingPaise && (
        <p style={{ color: "#b91c1c" }}>The two totals differ. Please tell your developer; the figures should always match.</p>
      )}
      <p style={{ color: "#64748b", marginTop: 12 }}>Only entries already posted to the ledger are included.</p>
    </main>
  );
}

export default function CashFlowPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CashFlowContent {...props} />
    </Suspense>
  );
}
