import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getProfitReport } from "@/lib/reports/report-data";
import { inr, todayInIndia } from "@/lib/reports/money";
import { saveBudgetsAction } from "@/lib/budget-actions";
import { ZERO_BUDGET, expenseVerdict, monthRange, reached, salesVerdict, sumBudgets, type Budget, type Verdict } from "@/lib/budget-math";
import SubmitButton from "@/components/SubmitButton";

type Props = { searchParams: Promise<{ month?: string; result?: string }> };
const MSG: Record<string, string> = {
  saved: "Budgets saved.",
  invalid: "Check the month and the amounts (numbers only).",
  failed: "The budgets could not be saved. Nothing was changed.",
};
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const left: React.CSSProperties = { ...cell, textAlign: "left", whiteSpace: "normal" };
const field: React.CSSProperties = { display: "block", width: "100%", padding: 10, fontSize: 16, marginTop: 4, border: "1px solid #cbd5e1", borderRadius: 6 };
const COLOUR: Record<Verdict, string> = { none: "#64748b", ok: "#15803d", watch: "#b45309", over: "#b91c1c" };

function Bar({ actual, budget, verdict }: { actual: bigint; budget: bigint; verdict: Verdict }) {
  const p = reached(actual, budget);
  if (p === null) return <span style={{ color: "#64748b" }}>no budget</span>;
  return <span style={{ color: COLOUR[verdict], fontWeight: 600 }}>{p}%</span>;
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("reports");
  const biz = user.legal_business_id;
  const q = await searchParams;
  const today = todayInIndia();
  const month = monthRange(q.month ?? "") ? (q.month as string) : today.slice(0, 7);
  const range = monthRange(month)!;
  const monthOver = today > range.to;
  const canEdit = user.role === "GROUP_OWNER";

  const [branches] = await db.execute<RowDataPacket[]>(
    `SELECT b.id, b.branch_name, b.division_id, d.name AS division_name
       FROM acct_branches b JOIN acct_divisions d ON d.id = b.division_id AND d.legal_business_id = b.legal_business_id
      WHERE b.legal_business_id = ? ORDER BY d.name, b.branch_name`, [biz]);

  let ready = true;
  const budgets = new Map<number, Budget>();
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT branch_id, sales_target, expense_limit FROM acct_budgets WHERE legal_business_id = ? AND month = ?`, [biz, month]);
    for (const r of rows) budgets.set(Number(r.branch_id), { sales: BigInt(String(r.sales_target)), expenses: BigInt(String(r.expense_limit)) });
  } catch { ready = false; }

  const profit = await getProfitReport(db, biz, range.from, range.to);
  const branchFig = new Map<number, { sales: bigint; spent: bigint }>();
  const divFig = new Map<number, { sales: bigint; spent: bigint }>();
  let group = { sales: 0n, spent: 0n };
  for (const s of profit) {
    const f = { sales: s.figures.sales, spent: s.figures.runningExpenses };
    if (s.scope === "BRANCH" && s.branchId) branchFig.set(s.branchId, f);
    else if (s.scope === "DIVISION" && s.divisionId) divFig.set(s.divisionId, f);
    else if (s.scope === "GROUP") group = f;
  }

  const divisions = new Map<number, { name: string; branches: RowDataPacket[] }>();
  for (const b of branches) {
    const d = divisions.get(Number(b.division_id)) ?? { name: String(b.division_name), branches: [] };
    d.branches.push(b);
    divisions.set(Number(b.division_id), d);
  }

  const drill = (kind: "sales" | "expenses", scope: string) => `/accounting/budgets/entries?month=${month}&kind=${kind}&${scope}`;
  const line = (label: string, bold: boolean, fig: { sales: bigint; spent: bigint }, bud: Budget, scope: string) => (
    <tr key={label} style={bold ? { background: "#f8fafc", fontWeight: 700 } : undefined}>
      <td style={left}>{label}</td>
      <td style={cell}><Link href={drill("sales", scope)}>{inr(fig.sales)}</Link></td>
      <td style={cell}>{bud.sales > 0n ? inr(bud.sales) : "-"}</td>
      <td style={cell}><Bar actual={fig.sales} budget={bud.sales} verdict={salesVerdict(fig.sales, bud.sales, monthOver)} /></td>
      <td style={cell}><Link href={drill("expenses", scope)}>{inr(fig.spent)}</Link></td>
      <td style={cell}>{bud.expenses > 0n ? inr(bud.expenses) : "-"}</td>
      <td style={cell}><Bar actual={fig.spent} budget={bud.expenses} verdict={expenseVerdict(fig.spent, bud.expenses)} /></td>
    </tr>
  );

  const rows: React.ReactNode[] = [];
  const allBudgets: Budget[] = [];
  for (const [divId, d] of divisions) {
    const bs = d.branches.map((b) => budgets.get(Number(b.id)) ?? ZERO_BUDGET);
    allBudgets.push(...bs);
    rows.push(line(`Division: ${d.name}`, true, divFig.get(divId) ?? { sales: 0n, spent: 0n }, sumBudgets(bs), `division=${divId}`));
    for (const b of d.branches) {
      rows.push(line(`   ${String(b.branch_name)}`, false, branchFig.get(Number(b.id)) ?? { sales: 0n, spent: 0n }, budgets.get(Number(b.id)) ?? ZERO_BUDGET, `branch=${b.id}`));
    }
  }

  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <h1>Budget against actual</h1>
      <p style={{ color: "#64748b" }}>Set a sales target and a spending limit for each branch for a month. The figures come from the posted ledger, the same figures as the profit report. Tap any amount to see the entries behind it.</p>
      <p style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 18 }}>
        <Link href={`/accounting/budgets?month=${prev}`}>&larr; Earlier</Link>
        <strong>{month}</strong>
        <Link href={`/accounting/budgets?month=${next}`}>Later &rarr;</Link>
      </p>
      {q.result && MSG[q.result] && <p role="alert" style={{ color: q.result === "saved" ? "#15803d" : "#b91c1c", fontSize: 17 }}>{MSG[q.result]}</p>}
      {!ready && <p style={{ color: "#b91c1c" }}>Budgets need the database file 080_budgets. Run it, then reload. Actual figures are shown below without budgets.</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr>
            <th style={left}>Where</th><th style={cell}>Sales</th><th style={cell}>Target</th><th style={cell}>Reached</th>
            <th style={cell}>Spent</th><th style={cell}>Limit</th><th style={cell}>Used</th>
          </tr></thead>
          <tbody>
            {line("Whole group", true, group, sumBudgets(allBudgets), "")}
            {rows}
          </tbody>
        </table>
      </div>
      <p style={{ color: "#64748b" }}>Spent means running expenses (setup costs are left out). Divisions and the group add up the branch budgets. Who owes you and for how long: <Link href="/accounting/customer-ageing">customer ageing</Link>.</p>

      {canEdit && ready && (
        <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" }}>
          <h2 style={{ marginTop: 0 }}>Set budgets for {month}</h2>
          <form action={saveBudgetsAction} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <input type="hidden" name="month" value={month} />
            {branches.map((b) => {
              const cur = budgets.get(Number(b.id));
              return (
                <fieldset key={String(b.id)} style={{ border: "1px solid #e2e8f0", borderRadius: 6 }}>
                  <legend>{String(b.division_name)} / {String(b.branch_name)}</legend>
                  <label>Sales target (rupees)<input name={`sales_${b.id}`} inputMode="decimal" defaultValue={cur && cur.sales > 0n ? String(Number(cur.sales) / 100) : ""} style={field} /></label>
                  <label>Spending limit (rupees)<input name={`exp_${b.id}`} inputMode="decimal" defaultValue={cur && cur.expenses > 0n ? String(Number(cur.expenses) / 100) : ""} style={field} /></label>
                </fieldset>
              );
            })}
            <div><SubmitButton label="Save budgets" /></div>
          </form>
        </section>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<main style={{ padding: 16 }}>Loading...</main>}><Content {...props} /></Suspense>;
}
