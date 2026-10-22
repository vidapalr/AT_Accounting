import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import {
  getBalanceReport,
  getDailySeries,
  getProfitReport,
} from "@/lib/reports/report-data";
import { addDays, inr, inrShort, percent, todayInIndia, toNumber } from "@/lib/reports/money";
import BarChart from "@/components/BarChart";
import styles from "./dashboard.module.css";

export default function DashboardPage() {
  return (
    <Suspense fallback={<main className={styles.page}>Loading...</main>}>
      <DashboardContent />
    </Suspense>
  );
}

const tile: React.CSSProperties = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 16,
  minWidth: 0,
};
const tileLabel: React.CSSProperties = { color: "#64748b", fontSize: 13, margin: 0 };
const tileValue: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: "4px 0 0" };
const tileNote: React.CSSProperties = { color: "#64748b", fontSize: 12, margin: "4px 0 0" };
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
  margin: "14px 0 26px",
};
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "right" };

async function DashboardContent() {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const today = todayInIndia();
  const monthStart = `${today.slice(0, 8)}01`;
  const trendFrom = addDays(today, -29);

  const [sync, monthScopes, todayScopes, balances, daily, owed] = await Promise.all([
    getSyncStatus(db, businessId),
    getProfitReport(db, businessId, monthStart, today),
    getProfitReport(db, businessId, today, today),
    getBalanceReport(db, businessId, today),
    getDailySeries(db, businessId, trendFrom, today),
    db.execute<RowDataPacket[]>(
      `SELECT COALESCE(SUM(r.refund_value), 0) - COALESCE(SUM(f.paid), 0) AS owed
       FROM acct_sales_returns r
       LEFT JOIN (
         SELECT return_id, SUM(amount) AS paid FROM acct_sales_refunds
         WHERE status = 'RECORDED' GROUP BY return_id
       ) f ON f.return_id = r.id
       WHERE r.legal_business_id = ? AND r.status = 'POSTED'`,
      [businessId]
    ),
  ]);

  const month = monthScopes[0].figures;
  const day = todayScopes[0].figures;
  const netSales = (f: typeof month) => f.sales - f.discounts;

  const net = (a: { debit: bigint; credit: bigint }) => a.debit - a.credit;
  const cashBank = balances.accounts.filter((a) => a.subtype === "CASH" || a.subtype === "BANK");
  const cashBankTotal = cashBank.reduce((s, a) => s + net(a), 0n);
  const byCode = (code: string) => balances.accounts.find((a) => a.code === code);
  const receivables = byCode("1100") ? net(byCode("1100")!) : 0n;
  const payables = byCode("2000") ? -net(byCode("2000")!) : 0n;
  const stock = byCode("1200") ? net(byCode("1200")!) : 0n;
  const investorMoney = byCode("3200") ? -net(byCode("3200")!) : 0n;
  const customerRefundsOwed = BigInt(Math.round(Number(owed[0][0]?.owed ?? 0) * 100));
  const needsReview = sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>ABHIRAM GROUP</p>
          <h1>Dashboard</h1>
          <p className={styles.subtitle}>Welcome, {user.full_name} · {today}</p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button className={styles.logout} type="submit">Logout</button>
        </form>
      </header>

      <div className={styles.content}>
        {(sync.pending.length > 0 || needsReview > 0) && (
          <p style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: 12 }}>
            {sync.pending.length > 0 &&
              `${sync.pending.length} new record(s) are not in the ledger yet, so these figures are behind. `}
            {needsReview > 0 && `${needsReview} item(s) need review. `}
            <Link href="/accounting/reports">Open Reports</Link>
          </p>
        )}

        <h2>Today</h2>
        <section style={grid}>
          <article style={tile}>
            <p style={tileLabel}>Net sales today</p>
            <p style={tileValue}>{inrShort(netSales(day))}</p>
            <p style={tileNote}>After discounts and returns</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Operating profit today</p>
            <p style={tileValue}>{inrShort(day.operating)}</p>
            <p style={tileNote}>Gross {inrShort(day.gross)} less running expenses</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Cash and bank</p>
            <p style={tileValue}>{inrShort(cashBankTotal)}</p>
            <p style={tileNote}>{cashBank.length} accounts</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Customers owe you</p>
            <p style={tileValue}>{inrShort(receivables)}</p>
            <p style={tileNote}>{customerRefundsOwed > 0n ? `You owe customers ${inrShort(customerRefundsOwed)} in refunds` : "No refunds pending"}</p>
          </article>
        </section>

        <h2>This month so far</h2>
        <section style={grid}>
          <article style={tile}>
            <p style={tileLabel}>Net sales</p>
            <p style={tileValue}>{inrShort(netSales(month))}</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Gross profit</p>
            <p style={tileValue}>{inrShort(month.gross)}</p>
            <p style={tileNote}>{percent(month.gross, netSales(month))} of net sales</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Operating profit</p>
            <p style={tileValue}>{inrShort(month.operating)}</p>
            <p style={tileNote}>{percent(month.operating, netSales(month))} of net sales</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Net profit</p>
            <p style={tileValue}>{inrShort(month.net)}</p>
            <p style={tileNote}>After set-up costs {inrShort(month.setupCosts)}</p>
          </article>
        </section>

        <h2>Last 30 days</h2>
        <section style={{ ...grid, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div style={tile}>
            <BarChart
              title="Net sales per day (₹)"
              points={daily.map((d) => ({ label: d.date.slice(5), value: toNumber(d.sales) }))}
            />
          </div>
          <div style={tile}>
            <BarChart
              title="Operating profit per day (₹)"
              color="#059669"
              points={daily.map((d) => ({ label: d.date.slice(5), value: toNumber(d.operating) }))}
            />
          </div>
        </section>

        <h2>Where the money stands</h2>
        <section style={grid}>
          <article style={tile}>
            <p style={tileLabel}>Stock on hand (at cost)</p>
            <p style={tileValue}>{inrShort(stock)}</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>You owe suppliers</p>
            <p style={tileValue}>{inrShort(payables)}</p>
          </article>
          <article style={tile}>
            <p style={tileLabel}>Investor money in the business</p>
            <p style={tileValue}>{inrShort(investorMoney)}</p>
            <p style={tileNote}>Treated as capital</p>
          </article>
        </section>

        <h2>Profit by place — this month</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: "white" }}>
            <thead>
              <tr>
                {["", "Net sales", "Gross profit", "Operating profit", "Net profit"].map((h, i) => (
                  <th key={h} style={{ ...cell, textAlign: i === 0 ? "left" : "right" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthScopes.map((s) => (
                <tr key={`${s.scope}-${s.divisionId}-${s.branchId}`} style={s.depth === 0 ? { fontWeight: 700 } : undefined}>
                  <td style={{ ...cell, textAlign: "left", paddingLeft: 10 + s.depth * 16 }}>{s.label}</td>
                  <td style={cell}>{inr(netSales(s.figures))}</td>
                  <td style={cell}>{inr(s.figures.gross)}</td>
                  <td style={cell}>{inr(s.figures.operating)}</td>
                  <td style={cell}>{inr(s.figures.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ marginTop: 20 }}>
          <Link href="/accounting/reports">Reports</Link>{" · "}
          <Link href="/accounting/returns">Returns and damaged stock</Link>{" · "}
          <Link href="/accounting/sales">Sales</Link>
        </p>
      </div>
    </main>
  );
}
