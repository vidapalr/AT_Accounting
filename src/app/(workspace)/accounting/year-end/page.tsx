import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import { closeYearAction, startNextYearAction } from "@/lib/year-end-actions";
import { nextYearStart, yearLabel } from "@/lib/period-math";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const bigBtn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "12px 22px" };
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const q = await searchParams;

  const [years] = await db.execute<RowDataPacket[]>(
    `SELECT id, label, status, DATE_FORMAT(starts_on,'%Y-%m-%d') AS s, DATE_FORMAT(ends_on,'%Y-%m-%d') AS e
       FROM acct_financial_years WHERE legal_business_id = ? ORDER BY starts_on DESC`,
    [businessId]
  );
  const sync = await getSyncStatus(db, businessId);
  const notInLedger = sync.pending.length;
  const review = sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length;

  const latest = years[0];
  // The next year counts as set up once a year that starts in the future exists.
  const nextExists = Boolean(latest) && String(latest.s) > today();
  const nextLabel = !latest ? "" : nextExists ? String(latest.label) : yearLabel(nextYearStart(String(latest.e)));
  const open = years.filter((y) => y.status === "OPEN").sort((a, b) => String(a.s).localeCompare(String(b.s)));
  const ended = open.find((y) => String(y.e) < today());
  const t = today();
  const daysLeft = latest ? Math.ceil((Date.parse(`${latest.e}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86400000) : 0;

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <h1>Year end</h1>
      <p style={{ color: "#64748b" }}>
        Your books carry on from year to year by themselves, so no balances have to be typed in again.
        This page only starts the new year and locks the old one.
      </p>
      {q.saved && <p style={{ color: "#166534" }}>{q.saved.slice(0, 250)}</p>}
      {q.error && <p style={{ color: "#b91c1c" }}>{q.error.slice(0, 250)}</p>}

      <section style={box}>
        <h2>Years</h2>
        <ul>
          {years.map((y) => (
            <li key={String(y.id)}>
              <strong>{String(y.label)}</strong> ({String(y.s)} to {String(y.e)}): {y.status === "OPEN" ? "open" : "closed"}
            </li>
          ))}
        </ul>
      </section>

      <section style={box}>
        <h2>Step 1: start the next year{nextLabel ? ` (${nextLabel})` : ""}</h2>
        {nextExists ? (
          <p style={{ color: "#166534" }}>Year {nextLabel} is already set up. You can post into it from 1 April.</p>
        ) : (
          <>
            <p>
              Without this step nothing can be posted after {latest ? String(latest.e) : "the year end"}.
              {daysLeft > 0 && daysLeft <= 45 ? ` The year ends in ${daysLeft} days, so do this now.` : " Do it a few weeks before 31 March."}
            </p>
            <form action={startNextYearAction}>
              <button type="submit" className="btn-link btn-link-primary" style={bigBtn}>Start year {nextLabel}</button>
            </form>
          </>
        )}
      </section>

      <section style={box}>
        <h2>Step 2: close the old year (after it has ended)</h2>
        <ul>
          <li style={{ color: notInLedger === 0 ? "#166534" : "#b91c1c" }}>
            {notInLedger === 0 ? "Every record is in the ledger." : `${notInLedger} record(s) are not in the ledger yet.`}{" "}
            <Link href="/accounting/reports">Reports</Link>
          </li>
          <li style={{ color: review === 0 ? "#166534" : "#b91c1c" }}>
            {review === 0 ? "Nothing needs review." : `${review} item(s) need review.`}
          </li>
          <li>Run the year&apos;s depreciation: <Link href="/accounting/fixed-assets">Fixed assets</Link></li>
          <li>Do the last stock count: <Link href="/accounting/stock-count">Stock count</Link></li>
        </ul>
        {ended ? (
          <form action={closeYearAction}>
            <input type="hidden" name="year_id" value={String(ended.id)} />
            <label style={{ display: "block", margin: "8px 0" }}>
              <input type="checkbox" name="confirm" value="yes" /> I have checked the above and want to close {String(ended.label)}.
              Nothing can be posted into it afterwards.
            </label>
            <button type="submit" className="btn-link btn-link-primary" style={bigBtn}>Close year {String(ended.label)}</button>
          </form>
        ) : (
          <p style={{ color: "#64748b" }}>No year has ended yet. This step becomes available after 31 March.</p>
        )}
      </section>
    </main>
  );
}

export default function YearEndPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
