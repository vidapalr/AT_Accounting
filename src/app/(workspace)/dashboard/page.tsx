import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import {
  getAccountPositions,
  getBalanceReport,
  getCashByPlace,
  getDailySeries,
  getExpenseBreakdown,
  getProfitReport,
} from "@/lib/reports/report-data";
import { addDays, inr, inrShort, percent, todayInIndia, toNumber } from "@/lib/reports/money";
import BarChart from "@/components/BarChart";
import styles from "./dashboard.module.css";

type Props = { searchParams: Promise<{ period?: string }> };

export default function DashboardPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading dashboard…</p>}>
      <DashboardContent {...props} />
    </Suspense>
  );
}

const money = (value: bigint) => (
  <span className={value < 0n ? styles.negative : undefined}>{inr(value)}</span>
);

async function DashboardContent({ searchParams }: Props) {
  const user = await requireAccess("dashboard");
  const businessId = user.legal_business_id;
  const { period } = await searchParams;

  const today = todayInIndia();
  const monthStart = `${today.slice(0, 8)}01`;
  const [fyRows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on
     FROM acct_financial_years
     WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ?
     LIMIT 1`,
    [businessId, today, today]
  );
  const fyStart = String(fyRows[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const showYear = period === "year";
  const from = showYear ? fyStart : monthStart;
  const periodLabel = showYear ? "this financial year" : "this month";

  const [sync, scopes, todayScopes, positions, balances, daily, expenses, owed] = await Promise.all([
    getSyncStatus(db, businessId),
    getProfitReport(db, businessId, from, today),
    getProfitReport(db, businessId, today, today),
    getAccountPositions(db, businessId, today),
    getBalanceReport(db, businessId, today),
    getDailySeries(db, businessId, addDays(today, -29), today),
    getExpenseBreakdown(db, businessId, from, today),
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

  const pendingOpeningHeld = [...positions.banks, ...positions.cash].reduce(
    (s, a) => s + a.openingPending,
    0n
  );
  const byPlace = await getCashByPlace(db, businessId, today, pendingOpeningHeld);

  const period_ = scopes[0].figures;
  const day = todayScopes[0].figures;
  const netSales = (f: typeof day) => f.sales - f.discounts;

  const net = (a: { debit: bigint; credit: bigint }) => a.debit - a.credit;
  const byCode = (code: string) => balances.accounts.find((a) => a.code === code);
  const receivables = byCode("1100") ? net(byCode("1100")!) : 0n;
  const payables = byCode("2000") ? -net(byCode("2000")!) : 0n;
  const stock = byCode("1200") ? net(byCode("1200")!) : 0n;
  const investorMoney = byCode("3200") ? -net(byCode("3200")!) : 0n;
  const setupAsset = byCode("1320") ? net(byCode("1320")!) : 0n;
  const refundsOwed = BigInt(Math.round(Number(owed[0][0]?.owed ?? 0) * 100));

  const businessHeld = [...positions.banks, ...positions.cash];
  const totalHeld = businessHeld.reduce((s, a) => s + a.balance, 0n);
  const needsReview = sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length;

  const running = expenses.filter((e) => !e.setup);
  const setup = expenses.filter((e) => e.setup);
  const f = period_;
  const discountsOnly = f.discounts - f.returns;
  const costOnly = f.costOfGoods - f.damagedStock;

  return (
    <div className={styles.page}>
      <div className={styles.titleRow}>
        <h1>Dashboard</h1>
        <span className={styles.asAt}>As at {today} · all figures from posted accounts</span>
      </div>

      {sync.pending.length > 0 && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          {sync.pending.length} new record(s) are not in the ledger yet, so profit figures are behind.{" "}
          <Link href="/accounting/reports">Post them from Reports</Link>.
        </p>
      )}
      {needsReview > 0 && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          {needsReview} posted item(s) no longer match their records. <Link href="/accounting/reports">Review on Reports</Link>.
        </p>
      )}
      {user.role === "GROUP_OWNER" && !positions.openingBatchPosted && positions.openingPendingTotal > 0n && (
        <p className={`${styles.notice} ${styles.noticeWarn}`}>
          Opening balances of {inr(positions.openingPendingTotal)} are entered but not posted to the ledger yet.
          The balances below include them. Approve and post them in{" "}
          <Link href="/accounting/opening-balances">Opening Balances</Link> so the ledger and reports agree.
        </p>
      )}

      <h2 className={styles.sectionTitle}>Today</h2>
      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.kpi}`}>
          <p className={styles.kpiLabel}>Net sales today</p>
          <p className={styles.kpiValue}>{inrShort(netSales(day))}</p>
          <p className={styles.kpiNote}>After discounts and returns</p>
        </article>
        <article className={`${styles.card} ${styles.kpiGood}`}>
          <p className={styles.kpiLabel}>Operating profit today</p>
          <p className={styles.kpiValue}>{inrShort(day.operating)}</p>
          <p className={styles.kpiNote}>Gross profit {inrShort(day.gross)} less running expenses</p>
        </article>
        <article className={`${styles.card} ${styles.kpiMoney}`}>
          <p className={styles.kpiLabel}>Cash and bank (business)</p>
          <p className={styles.kpiValue}>{inrShort(totalHeld)}</p>
          <p className={styles.kpiNote}>{businessHeld.length} accounts · details below</p>
        </article>
        <article className={`${styles.card} ${styles.kpiMoney}`}>
          <p className={styles.kpiLabel}>Customers owe you</p>
          <p className={styles.kpiValue}>{inrShort(receivables)}</p>
          <p className={styles.kpiNote}>{refundsOwed > 0n ? `Refunds you owe customers: ${inrShort(refundsOwed)}` : "No refunds pending"}</p>
        </article>
      </section>

      <div className={styles.titleRow} style={{ marginTop: 28 }}>
        <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Profit {periodLabel}</h2>
        <span>
          <Link href="/dashboard">This month</Link>{" · "}
          <Link href="/dashboard?period=year">This financial year</Link>
        </span>
      </div>
      <section className={styles.grid2}>
        <article className={styles.card}>
          <h3 className={styles.cardTitle}>How net profit is worked out</h3>
          <p className={styles.cardHint}>From {from} to {today}. Each line is taken from posted accounts.</p>
          <ul className={styles.flow}>
            <li><span>Sales at selling price</span>{money(f.sales)}</li>
            <li className={styles.minus}><span>Discounts given</span>{money(discountsOnly)}</li>
            <li className={styles.minus}><span>Customer returns</span>{money(f.returns)}</li>
            <li className={`${styles.result}`}><span>Net sales</span>{money(netSales(f))}</li>
            <li className={styles.minus}><span>Cost of the goods sold</span>{money(costOnly)}</li>
            <li className={styles.minus}><span>Damaged and lost stock</span>{money(f.damagedStock)}</li>
            <li className={styles.result}>
              <span>Gross profit ({percent(f.gross, netSales(f))})</span>{money(f.gross)}
            </li>
            {running.map((e) => (
              <li key={e.code} className={`${styles.minus} ${styles.indent}`}>
                <span>{e.name}</span>{money(e.amount)}
              </li>
            ))}
            {running.length === 0 && (
              <li className={`${styles.minus} ${styles.indent}`}><span>Running expenses</span>{money(0n)}</li>
            )}
            <li className={styles.result}>
              <span>Operating profit ({percent(f.operating, netSales(f))})</span>{money(f.operating)}
            </li>
            {setup.map((e) => (
              <li key={e.code} className={styles.minus}>
                <span>{e.name} (one-off costs of starting)</span>{money(e.amount)}
              </li>
            ))}
            <li className={`${styles.result} ${styles.resultFinal}`}>
              <span>Net profit</span>{money(f.net)}
            </li>
          </ul>
          {setupAsset > 0n && (
            <p className={styles.cardHint} style={{ marginTop: 10 }}>
              Starting costs of {inr(setupAsset)} are carried as an asset on the balance sheet,
              so they are not taken off profit.
            </p>
          )}
        </article>

        <article className={styles.card}>
          <h3 className={styles.cardTitle}>Money you hold now</h3>
          <p className={styles.cardHint}>
            Current balance of each business account, with opening balances included.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Account</th><th>Opening balance</th><th>Trading since opening</th><th>Balance now</th></tr>
              </thead>
              <tbody>
                {[...positions.banks.map((a) => ({ key: `b${a.id}`, a })), ...positions.cash.map((a) => ({ key: `c${a.id}`, a }))].map(({ key, a }) => (
                  <tr key={key}>
                    <td>{a.label}<span className={styles.sub}>{a.detail}{a.openingPending !== 0n ? " · opening not yet posted" : ""}</span></td>
                    <td>{money(a.opening)}</td>
                    <td>{money(a.trading)}</td>
                    <td>{money(a.balance)}</td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Total cash and bank</td>
                  <td>{money(businessHeld.reduce((s, a) => s + a.opening, 0n))}</td>
                  <td>{money(businessHeld.reduce((s, a) => s + a.trading, 0n))}</td>
                  <td>{money(totalHeld)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className={styles.cardHint} style={{ marginTop: 6 }}>
            Opening balance = what the business started with on the opening date. Trading = money in
            from sales less money out for purchases, expenses and refunds since then.
          </p>

          <h4 style={{ margin: "18px 0 4px", fontSize: 14 }}>Cash and bank by place</h4>
          <p className={styles.cardHint}>
            Which part of the group, division or branch the money belongs to. Opening balances sit at group level.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Place</th><th>Opening balance</th><th>Trading since opening</th><th>Balance now</th></tr>
              </thead>
              <tbody>
                {byPlace.map((r, i) => (
                  <tr key={i}>
                    <td style={{ paddingLeft: 8 + r.depth * 18 }}>{r.label}</td>
                    <td>{money(r.opening)}</td>
                    <td>{money(r.trading)}</td>
                    <td>{money(r.balance)}</td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td>Total</td>
                  <td>{money(byPlace.reduce((s, r) => s + r.opening, 0n))}</td>
                  <td>{money(byPlace.reduce((s, r) => s + r.trading, 0n))}</td>
                  <td>{money(byPlace.reduce((s, r) => s + r.balance, 0n))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {positions.investorBanks.length > 0 && (
            <>
              <h4 style={{ margin: "18px 0 4px", fontSize: 14 }}>Investor&apos;s own bank accounts</h4>
              <p className={styles.cardHint}>
                Business money that moved through the investor&apos;s account. A negative balance means
                payments made from it are larger than the deposits recorded, so deposits still need to be entered.
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Account</th><th>Deposits</th><th>From customers</th><th>Paid out</th><th>Balance</th></tr>
                  </thead>
                  <tbody>
                    {positions.investorBanks.map((a) => (
                      <tr key={a.id}>
                        <td>{a.label}<span className={styles.sub}>{a.detail}</span></td>
                        <td>{inr(a.opening + a.deposits)}</td>
                        <td>{inr(a.received)}</td>
                        <td>{inr(a.paidOut)}</td>
                        <td>{money(a.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </article>
      </section>

      <h2 className={styles.sectionTitle}>This month so far</h2>
      <section className={styles.grid}>
        {(() => {
          const m = scopes[0].figures;
          return (
            <>
              <article className={`${styles.card} ${styles.kpi}`}>
                <p className={styles.kpiLabel}>Net sales</p>
                <p className={styles.kpiValue}>{inrShort(netSales(m))}</p>
              </article>
              <article className={`${styles.card} ${styles.kpiGood}`}>
                <p className={styles.kpiLabel}>Gross profit</p>
                <p className={styles.kpiValue}>{inrShort(m.gross)}</p>
                <p className={styles.kpiNote}>{percent(m.gross, netSales(m))} of net sales</p>
              </article>
              <article className={`${styles.card} ${styles.kpiGood}`}>
                <p className={styles.kpiLabel}>Operating profit</p>
                <p className={styles.kpiValue}>{inrShort(m.operating)}</p>
                <p className={styles.kpiNote}>{percent(m.operating, netSales(m))} of net sales</p>
              </article>
              <article className={`${styles.card} ${styles.kpiGood}`}>
                <p className={styles.kpiLabel}>Net profit</p>
                <p className={styles.kpiValue}>{inrShort(m.net)}</p>
                <p className={styles.kpiNote}>After set-up costs {inrShort(m.setupCosts)}</p>
              </article>
            </>
          );
        })()}
      </section>

      <h2 className={styles.sectionTitle}>Last 30 days</h2>
      <section className={styles.grid2}>
        <div className={styles.card}>
          <BarChart
            title="Net sales per day (₹)"
            points={daily.map((d) => ({ label: d.date.slice(5), value: toNumber(d.sales) }))}
          />
        </div>
        <div className={styles.card}>
          <BarChart
            title="Operating profit per day (₹)"
            color="#059669"
            points={daily.map((d) => ({ label: d.date.slice(5), value: toNumber(d.operating) }))}
          />
        </div>
      </section>

      <h2 className={styles.sectionTitle}>Profit by place — {periodLabel}</h2>
      <div className={`${styles.card} ${styles.tableWrap}`}>
        <table className={styles.table}>
          <thead>
            <tr><th></th><th>Net sales</th><th>Gross profit</th><th>Operating profit</th><th>Net profit</th></tr>
          </thead>
          <tbody>
            {scopes.map((s) => (
              <tr key={`${s.scope}-${s.divisionId}-${s.branchId}`} style={s.depth === 0 ? { fontWeight: 700 } : undefined}>
                <td style={{ paddingLeft: 10 + s.depth * 18 }}>{s.label}</td>
                <td>{inr(netSales(s.figures))}</td>
                <td>{inr(s.figures.gross)}</td>
                <td>{inr(s.figures.operating)}</td>
                <td>{money(s.figures.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={styles.sectionTitle}>Stock, suppliers and investors</h2>
      <section className={styles.grid}>
        <article className={`${styles.card} ${styles.kpiMoney}`}>
          <p className={styles.kpiLabel}>Stock on hand (at cost)</p>
          <p className={styles.kpiValue}>{inrShort(stock)}</p>
        </article>
        <article className={`${styles.card} ${styles.kpiMoney}`}>
          <p className={styles.kpiLabel}>You owe suppliers</p>
          <p className={styles.kpiValue}>{inrShort(payables)}</p>
        </article>
        <article className={`${styles.card} ${styles.kpiMoney}`}>
          <p className={styles.kpiLabel}>Investor money in the business</p>
          <p className={styles.kpiValue}>{inrShort(investorMoney)}</p>
          <p className={styles.kpiNote}>Treated as capital</p>
        </article>
      </section>

      <p className={styles.links}>
        <Link href="/accounting/reports">Reports, balance sheet and Excel</Link>
        <Link href="/accounting/returns">Returns and damaged stock</Link>
        <Link href="/accounting/sales">Sales</Link>
      </p>
    </div>
  );
}
