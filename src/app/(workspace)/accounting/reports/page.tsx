import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { postPendingEntriesAction } from "@/lib/ledger-sync-actions";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import {
  balanceSheet,
  profitByScope,
  type LedgerTotal,
} from "@/lib/reports/profit-levels";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; posted?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const isDate = (v: string | undefined): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

function toPaise(value: string | number | null): bigint {
  const text = String(value ?? "0");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const paise = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -paise : paise;
}

function inr(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const decimals = String(abs % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}₹${(abs / 100n).toLocaleString("en-IN")}.${decimals}`;
}

function percent(part: bigint, whole: bigint): string {
  if (whole <= 0n) return "—";
  return `${(Number((part * 10000n) / whole) / 100).toFixed(1)}%`;
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "right",
  whiteSpace: "nowrap",
};
const left: React.CSSProperties = { ...cell, textAlign: "left" };

async function ReportsContent({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
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

  const [divisionRows] = await db.execute<Row[]>(
    `SELECT id, name FROM acct_divisions WHERE legal_business_id = ?`,
    [businessId]
  );
  const [branchRows] = await db.execute<Row[]>(
    `SELECT id, division_id, branch_name FROM acct_branches WHERE legal_business_id = ?`,
    [businessId]
  );
  const divisionName = new Map(divisionRows.map((d) => [Number(d.id), String(d.name)]));
  const branchName = new Map(branchRows.map((b) => [Number(b.id), String(b.branch_name)]));
  const divisionOfBranch = new Map(branchRows.map((b) => [Number(b.id), Number(b.division_id)]));

  // Profit: posted journals inside the chosen dates.
  const [profitRows] = await db.execute<Row[]>(
    `SELECT a.account_code, l.division_id, l.branch_id,
            SUM(l.debit) AS debit, SUM(l.credit) AS credit
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED'
       AND j.entry_date BETWEEN ? AND ?
       AND a.account_code >= '4'
     GROUP BY a.account_code, l.division_id, l.branch_id`,
    [businessId, from, to]
  );
  const lines: LedgerTotal[] = profitRows.map((r) => ({
    accountCode: String(r.account_code),
    divisionId: r.division_id === null ? null : Number(r.division_id),
    branchId: r.branch_id === null ? null : Number(r.branch_id),
    debit: toPaise(r.debit),
    credit: toPaise(r.credit),
  }));
  const scopes = profitByScope(lines, divisionOfBranch);

  // Balance sheet and trial balance: everything posted up to the end date.
  const [balanceRows] = await db.execute<Row[]>(
    `SELECT a.account_code, a.account_name,
            SUM(l.debit) AS debit, SUM(l.credit) AS credit
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date <= ?
     GROUP BY a.account_code, a.account_name
     ORDER BY a.account_code`,
    [businessId, to]
  );
  const accountName = new Map(balanceRows.map((r) => [String(r.account_code), String(r.account_name)]));
  const totals = balanceRows.map((r) => ({
    accountCode: String(r.account_code),
    debit: toPaise(r.debit),
    credit: toPaise(r.credit),
  }));
  const sheet = balanceSheet(totals);
  const tbDebit = totals.reduce((s, t) => s + t.debit, 0n);
  const tbCredit = totals.reduce((s, t) => s + t.credit, 0n);

  const scopeLabel = (s: (typeof scopes)[number]) =>
    s.scope === "GROUP"
      ? "Group (all)"
      : s.scope === "DIVISION"
        ? `Division: ${divisionName.get(s.divisionId!) ?? s.divisionId}`
        : `  Branch: ${branchName.get(s.branchId!) ?? s.branchId}`;

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

      <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, margin: "12px 0" }}>
        <strong>Ledger status:</strong>{" "}
        {sync.pending.length === 0 && needsReview === 0
          ? "Up to date. Every sale, purchase, payment and expense is in the ledger."
          : `${sync.pending.length} new record(s) not yet in the ledger, so the figures below are out of date.`}
        {sync.pending.length > 0 && (
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
      </form>

      <h2>Profit — {from} to {to}</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["", "Sales", "Discounts", "Cost of goods", "Gross profit", "Gross %", "Running expenses",
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
