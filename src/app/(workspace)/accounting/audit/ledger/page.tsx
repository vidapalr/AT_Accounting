import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

type Props = {
  searchParams: Promise<{ from?: string; to?: string; account?: string; source?: string; q?: string }>;
};
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const field: React.CSSProperties = { padding: "8px 10px", fontSize: 15, minWidth: 0 };
const isDate = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const inr = (v: string | number | null) =>
  Number(v ?? 0) === 0 ? "" : Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LIMIT = 500;

async function LedgerContent({ searchParams }: Props) {
  const user = await requireAccess("audit_view");
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const [years] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on FROM acct_financial_years
     WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ? LIMIT 1`,
    [businessId, today, today]
  );
  const from = isDate(query.from) ? query.from : String(years[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const to = isDate(query.to) ? query.to : today;
  const account = /^\d{3,10}$/.test(query.account ?? "") ? String(query.account) : "";
  const source = /^[A-Z_]{1,48}$/.test(query.source ?? "") ? String(query.source) : "";
  const q = (query.q ?? "").trim().slice(0, 80);

  const [accounts] = await db.execute<Row[]>(
    `SELECT account_code, account_name FROM acct_chart_of_accounts
     WHERE legal_business_id = ? AND is_posting_account = 1 ORDER BY account_code`,
    [businessId]
  );
  const [sources] = await db.execute<Row[]>(
    `SELECT DISTINCT source_type FROM acct_journal_entries
     WHERE legal_business_id = ? AND source_type IS NOT NULL ORDER BY source_type`,
    [businessId]
  );

  const where = [
    "j.legal_business_id = ?",
    "j.status <> 'DRAFT'",
    "j.entry_date BETWEEN ? AND ?",
  ];
  const params: (string | number)[] = [businessId, from, to];
  if (account) { where.push("a.account_code = ?"); params.push(account); }
  if (source) { where.push("j.source_type = ?"); params.push(source); }
  if (q) { where.push("(j.description LIKE ? OR l.description LIKE ? OR j.journal_no LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const [lines] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(j.entry_date, '%d %b %Y') AS d, j.journal_no, j.source_type,
            COALESCE(NULLIF(l.description, ''), j.description) AS memo,
            a.account_code, a.account_name, l.debit, l.credit
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
       JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
      WHERE ${where.join(" AND ")}
      ORDER BY j.entry_date, j.id, l.line_no
      LIMIT ${LIMIT}`,
    params
  );
  const [tot] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n, COALESCE(SUM(l.debit),0) AS dr, COALESCE(SUM(l.credit),0) AS cr
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
       JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
      WHERE ${where.join(" AND ")}`,
    params
  );

  return (
    <main style={{ padding: 24 }}>
      <h1>Every ledger line</h1>
      <p style={{ color: "#64748b" }}>
        All posted entries, line by line. This page only shows; nothing here can be changed.
      </p>
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", margin: "12px 0" }}>
        <label>From<br /><input type="date" name="from" defaultValue={from} style={field} /></label>
        <label>To<br /><input type="date" name="to" defaultValue={to} style={field} /></label>
        <label>Account<br />
          <select name="account" defaultValue={account} style={{ ...field, maxWidth: 260 }}>
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={String(a.account_code)} value={String(a.account_code)}>{a.account_code} {a.account_name}</option>
            ))}
          </select>
        </label>
        <label>Kind of entry<br />
          <select name="source" defaultValue={source} style={field}>
            <option value="">All</option>
            {sources.map((s) => (
              <option key={String(s.source_type)} value={String(s.source_type)}>{String(s.source_type).replaceAll("_", " ").toLowerCase()}</option>
            ))}
          </select>
        </label>
        <label>Words<br /><input name="q" defaultValue={q} placeholder="invoice no, name…" style={{ ...field, width: 180 }} /></label>
        <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 15, padding: "9px 18px" }}>Show</button>
      </form>
      <p>
        {Number(tot[0].n).toLocaleString("en-IN")} lines · Debit ₹{inr(tot[0].dr) || "0.00"} · Credit ₹{inr(tot[0].cr) || "0.00"}
        {Number(tot[0].n) > LIMIT ? ` · showing the first ${LIMIT}; narrow the dates or pick an account` : ""}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead>
            <tr><th style={cell}>Date</th><th style={cell}>Entry</th><th style={cell}>Kind</th><th style={cell}>Account</th><th style={cell}>Details</th><th style={num}>Debit</th><th style={num}>Credit</th></tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={cell}>{l.d}</td>
                <td style={cell}>{l.journal_no}</td>
                <td style={cell}>{l.source_type ? String(l.source_type).replaceAll("_", " ").toLowerCase() : "manual"}</td>
                <td style={cell}>{l.account_code} {l.account_name}</td>
                <td style={cell}>{l.memo}</td>
                <td style={num}>{inr(l.debit)}</td>
                <td style={num}>{inr(l.credit)}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td style={cell} colSpan={7}>No entries for these choices.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function LedgerPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <LedgerContent {...props} />
    </Suspense>
  );
}
