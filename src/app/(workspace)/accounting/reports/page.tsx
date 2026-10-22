import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { postPendingEntriesAction } from "@/lib/ledger-sync-actions";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import { getBalanceReport, getProfitReport } from "@/lib/reports/report-data";
import { inr, isDate, percent, todayInIndia } from "@/lib/reports/money";
import PrintButton from "@/components/PrintButton";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; posted?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "right",
  whiteSpace: "nowrap",
};
const left: React.CSSProperties = { ...cell, textAlign: "left" };

async function ReportsContent({ searchParams }: Props) {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const today = todayInIndia();
  const [years] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on
     FROM acct_financial_years
     WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ?
     LIMIT 1`,
    [businessId, today, today]
  );
  const from = isDate(query.from) ? query.from : String(years[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const to = isDate(query.to) ? query.to : today;

  const sync = await getSyncStatus(db, businessId);
  const needsReview =
    sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length;

  const scopes = await getProfitReport(db, businessId, from, to);
  const { accounts, names: accountName, sheet } = await getBalanceReport(db, businessId, to);
  const totals = accounts.map((a) => ({ accountCode: a.code, debit: a.debit, credit: a.credit }));
  const tbDebit = totals.reduce((s, t) => s + t.debit, 0n);
  const tbCredit = totals.reduce((s, t) => s + t.credit, 0n);

  const scopeLabel = (s: (typeof scopes)[number]) =>
    s.depth === 2 ? `\u00A0\u00A0${s.label}` : s.label;

  const section = (title: string, rows: { code: string; amount: bigint }[]) => (
    <>
      <tr><th colSpan={2} style={left}>{title}</th></tr>
      {rows.map((r) => (
        <tr key={r.code}>
          <td style={left}>{r.code} {accountName.get(r.code)}</td>
          <td style={cell}>{inr(r.amount)}</td>
        </tr>
      ))}
    </>
  );

  return (
    <main style={{ padding: 24 }}>
      <style>{`@media print { aside, form, section[data-noprint] { display: none !important; } main { padding: 0 !important; } }`}</style>
      <h1>Reports</h1>
      <p style={{ color: "#64748b" }}>
        From posted journals only. Dividing profit into gross, operating and net:
        gross = sales after discounts − cost of goods; operating = gross − running expenses;
        net = operating − set-up costs.
      </p>

      {query.posted !== undefined && (
        <p style={{ color: "#166534" }}>Posted {query.posted.replace(/\D/g, "")} entries to the ledger.</p>
      )}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <section data-noprint style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, margin: "12px 0" }}>
        <strong>Ledger status:</strong>{" "}
        {sync.pending.length === 0 && needsReview === 0
          ? "Up to date. Every sale, purchase, payment and expense is in the ledger."
          : `${sync.pending.length} new record(s) not yet in the ledger, so the figures below are out of date.`}
        {sync.pending.length > 0 && user.role === "GROUP_OWNER" && (
          <form action={postPendingEntriesAction} style={{ marginTop: 8 }}>
            <button type="submit">Post {sync.pending.length} pending entries to the ledger</button>
          </form>
        )}
        {needsReview > 0 && (
          <ul style={{ color: "#b91c1c", marginTop: 8 }}>
            {sync.problems.map((p) => <li key={p}>{p}</li>)}
            {sync.changedAfterPosting.map((p) => <li key={p}>Changed after posting: {p}. Needs a reversal and re-entry.</li>)}
            {sync.noLongerValid.map((p) => <li key={p}>Posted, but the record is no longer valid: {p}. Needs a reversal.</li>)}
          </ul>
        )}
      </section>

      <form method="get" style={{ display: "flex", gap: 12, alignItems: "end", margin: "16px 0" }}>
        <label>From<br /><input type="date" name="from" defaultValue={from} /></label>
        <label>To<br /><input type="date" name="to" defaultValue={to} /></label>
        <button type="submit">Show</button>
        <PrintButton />
        <a href={`/api/reports/export?from=${from}&to=${to}`}>Download Excel</a>
      </form>

      <h2>Profit — {from} to {to}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["", "Sales", "Discounts and returns", "Cost of goods", "Gross profit", "Gross %", "Running expenses",
                "Operating profit", "Set-up costs", "Net profit"].map((h) => (
                <th key={h} style={h ? cell : left}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={`${s.scope}-${s.divisionId}-${s.branchId}`}
                  style={s.scope === "GROUP" ? { fontWeight: 700 } : undefined}>
                <td style={left}>{scopeLabel(s)}</td>
                <td style={cell}>{inr(s.figures.sales)}</td>
                <td style={cell}>{inr(s.figures.discounts)}</td>
                <td style={cell}>{inr(s.figures.costOfGoods)}</td>
                <td style={cell}>{inr(s.figures.gross)}</td>
                <td style={cell}>{percent(s.figures.gross, s.figures.sales - s.figures.discounts)}</td>
                <td style={cell}>{inr(s.figures.runningExpenses)}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{inr(s.figures.operating)}</td>
                <td style={cell}>{inr(s.figures.setupCosts)}</td>
                <td style={cell}>{inr(s.figures.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: "#64748b", fontSize: 13 }}>
        Gross % = gross profit ÷ sales after discounts. An expense booked to a division
        (not a branch) shows in that division and the group; one booked to the group shows only in the group row.
      </p>

      <h2 style={{ marginTop: 32 }}>Balance sheet — as at {to}</h2>
      <table style={{ width: "100%", maxWidth: 640, borderCollapse: "collapse" }}>
        <tbody>
          {section("Assets", sheet.assets)}
          <tr><th style={left}>Total assets</th><th style={cell}>{inr(sheet.totalAssets)}</th></tr>
          {section("Liabilities", sheet.liabilities)}
          {section("Capital (owner and investor money)", sheet.capital)}
          <tr><td style={left}>Profit to date (net)</td><td style={cell}>{inr(sheet.profitToDate)}</td></tr>
          <tr><th style={left}>Total liabilities, capital and profit</th>
              <th style={cell}>{inr(sheet.totalLiabilitiesAndCapital)}</th></tr>
        </tbody>
      </table>
      {sheet.totalAssets !== sheet.totalLiabilitiesAndCapital && (
        <p style={{ color: "#b91c1c" }}>The balance sheet does not balance. Please report this.</p>
      )}

      <h2 style={{ marginTop: 32 }}>Trial balance — as at {to}</h2>
      <table style={{ width: "100%", maxWidth: 640, borderCollapse: "collapse" }}>
        <thead><tr><th style={left}>Account</th><th style={cell}>Debit</th><th style={cell}>Credit</th></tr></thead>
        <tbody>
          {totals.map((t) => (
            <tr key={t.accountCode}>
              <td style={left}>{t.accountCode} {accountName.get(t.accountCode)}</td>
              <td style={cell}>{inr(t.debit)}</td>
              <td style={cell}>{inr(t.credit)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}>
            <td style={left}>Total</td><td style={cell}>{inr(tbDebit)}</td><td style={cell}>{inr(tbCredit)}</td>
          </tr>
        </tbody>
      </table>
    </main>
  );
}

export default function ReportsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading reports…</p>}>
      <ReportsContent {...props} />
    </Suspense>
  );
}
