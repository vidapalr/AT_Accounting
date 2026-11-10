import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { inr, toPaise } from "@/lib/reports/money";
import { monthRange, sourceLink } from "@/lib/budget-math";

type Props = { searchParams: Promise<{ month?: string; kind?: string; branch?: string; division?: string }> };
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const num = (v: string | undefined) => (/^[1-9]\d*$/.test(v ?? "") ? Number(v) : null);

async function Content({ searchParams }: Props) {
  const user = await requireAccess("reports");
  const biz = user.legal_business_id;
  const q = await searchParams;
  const range = monthRange(q.month ?? "");
  const kind = q.kind === "expenses" ? "expenses" : "sales";
  if (!range) return <main style={{ padding: 16 }}><p>Pick a month on the <Link href="/accounting/budgets">budget page</Link>.</p></main>;
  const branch = num(q.branch);
  const division = num(q.division);

  const codeTest = kind === "sales" ? `a.account_code IN ('4000','4300')` : `a.account_code LIKE '6%' AND a.account_code <> '6900'`;
  const scope = branch ? `AND l.branch_id = ${branch}` : division ? `AND l.division_id = ${division}` : "";
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT j.id, j.journal_no, DATE_FORMAT(j.entry_date, '%Y-%m-%d') AS day, j.description, j.source_type, j.source_id,
            a.account_code, a.account_name, SUM(l.debit) AS debit, SUM(l.credit) AS credit
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
       JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
      WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date BETWEEN ? AND ? AND ${codeTest} ${scope}
      GROUP BY j.id, a.account_code, a.account_name
      ORDER BY j.entry_date DESC, j.id DESC LIMIT 500`,
    [biz, range.from, range.to]);

  let total = 0n;
  const list = rows.map((r) => {
    const amount = kind === "sales" ? toPaise(r.credit) - toPaise(r.debit) : toPaise(r.debit) - toPaise(r.credit);
    total += amount;
    return { r, amount };
  });

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <h1>{kind === "sales" ? "Sales" : "Running expenses"} behind the figure</h1>
      <p style={{ color: "#64748b" }}>Month {q.month}{branch ? `, branch ${branch}` : division ? `, division ${division}` : ", whole group"}. Posted ledger entries only. Total {inr(total)}{rows.length === 500 ? " (first 500 entries shown)" : ""}.</p>
      <p><Link className="btn-link" href={`/accounting/budgets?month=${q.month}`}>&larr; Back to budgets</Link></p>
      {list.length === 0 ? <p style={{ fontSize: 18 }}>No entries.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead><tr><th style={cell}>Day</th><th style={cell}>Entry</th><th style={cell}>Account</th><th style={cell}>What</th><th style={{ ...cell, textAlign: "right" }}>Amount</th><th style={cell}>Document</th></tr></thead>
            <tbody>
              {list.map(({ r, amount }) => {
                const link = sourceLink(String(r.source_type), r.source_id === null ? null : Number(r.source_id));
                return (
                  <tr key={`${r.id}-${r.account_code}`}>
                    <td style={cell}>{String(r.day)}</td>
                    <td style={cell}><Link href={`/accounting/journals/${r.id}`}>{String(r.journal_no)}</Link></td>
                    <td style={cell}>{String(r.account_code)} {String(r.account_name)}</td>
                    <td style={cell}>{String(r.description ?? "")}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{inr(amount)}</td>
                    <td style={cell}>{link ? <Link href={link}>Open</Link> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<main style={{ padding: 16 }}>Loading...</main>}><Content {...props} /></Suspense>;
}
