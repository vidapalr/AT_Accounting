import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { inr, isDate, todayInIndia } from "@/lib/reports/money";
import {
  allocate,
  buildSegments,
  checkCapacity,
  formatUnits,
  placeLevel,
  type CapacityIssue,
  type Place,
} from "@/lib/investor-shares/engine";
import { loadShares, profitLookupFor } from "@/lib/investor-shares/data";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ from?: string; to?: string }> };

export default function InvestorSharesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading investor shares…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

const BASIS_LABEL = { GROSS: "Gross profit", OPERATING: "Operating profit", NET: "Net profit" } as const;

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const today = todayInIndia();
  const [fyRows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on FROM acct_financial_years
     WHERE legal_business_id = ? AND starts_on <= ? AND ends_on >= ? LIMIT 1`,
    [businessId, today, today]
  );
  const fyStart = String(fyRows[0]?.starts_on ?? `${today.slice(0, 4)}-04-01`);
  const from = isDate(query.from) ? query.from! : fyStart;
  const to = isDate(query.to) ? query.to! : today;

  const { versions, ownerMinUnits, names, problems } = await loadShares(db, businessId);
  const segments = buildSegments(versions, from, to);
  const lookup = await profitLookupFor(db, businessId, [
    { from, to },
    ...segments.map((s) => ({ from: s.segFrom, to: s.segTo })),
  ]);
  const { rows, totals } = allocate(segments, lookup);
  const issues = checkCapacity(versions, ownerMinUnits);

  const group = lookup({ divisionId: null, branchId: null }, from, to);
  const totalPayable = totals.reduce((s, t) => s + t.payable, 0n);
  const ownerKeeps = group.net - totalPayable;
  const grossBased = rows.some((r) => r.basis === "GROSS");

  const placeName = (p: Place) =>
    placeLevel(p) === "BRANCH"
      ? `Branch: ${names.branches.get(p.branchId!) ?? p.branchId}`
      : placeLevel(p) === "DIVISION"
        ? `Division: ${names.divisions.get(p.divisionId!) ?? p.divisionId}`
        : "Whole group";

  const issueText = (i: CapacityIssue) =>
    i.kind === "GROUP_LIMIT"
      ? `From ${i.date}, group-level investors total ${formatUnits(i.totalUnits)}, above the ${formatUnits(i.limitUnits)} allowed (the owner keeps at least ${formatUnits(ownerMinUnits)}).`
      : `From ${i.date}, shares on ${BASIS_LABEL[i.basis]} for ${placeName(i.place)} (with its division and group) total ${formatUnits(i.totalUnits)}, above 100%.`;

  return (
    <main className={styles.page}>
      <h1>Investor Profit Shares</h1>
      <p>
        What each investor agreement earns from the ledger profit of its own place and profit basis. Where an
        agreement changed during the period, the period is split on the change date and each part uses the profit
        booked inside that part. This is a calculation only: nothing is paid or posted from this page.
      </p>

      <form method="GET" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", margin: "12px 0" }}>
        <label>From<input type="date" name="from" defaultValue={from} /></label>
        <label>To<input type="date" name="to" defaultValue={to} /></label>
        <button type="submit">Show</button>
      </form>

      {(issues.length > 0 || problems.length > 0) && (
        <section role="alert" style={{ color: "#b91c1c", margin: "12px 0" }}>
          <strong>Needs attention</strong>
          <ul>
            {issues.map((i, n) => <li key={`i${n}`}>{issueText(i)}</li>)}
            {problems.map((p, n) => <li key={`p${n}`}>{p}</li>)}
          </ul>
        </section>
      )}

      <h2>Summary for {from} to {to}</h2>
      <table>
        <tbody>
          <tr><td>Net profit of the whole group</td><td>{inr(group.net)}</td></tr>
          <tr><td>Shared with investors</td><td>{inr(totalPayable)}</td></tr>
          <tr><td><strong>Owner keeps</strong></td><td><strong>{inr(ownerKeeps)}</strong></td></tr>
        </tbody>
      </table>
      {ownerKeeps < 0n && (
        <p role="alert" style={{ color: "#b91c1c" }}>
          Investor shares are larger than the group&apos;s net profit for this period
          {grossBased ? ", because some agreements share gross or operating profit, which is before other costs" : ""}.
          The owner would have to fund the difference.
        </p>
      )}
      {ownerKeeps >= 0n && grossBased && (
        <p>Some agreements share gross or operating profit. That is paid before other costs, so check &quot;Owner keeps&quot; each period.</p>
      )}

      <h2>By agreement</h2>
      {rows.length === 0 ? (
        <p>No profit-linked investor agreements apply in this period.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Agreement</th><th>Investor</th><th>Shares profit of</th><th>Profit basis</th>
              <th>Share</th><th>Dates</th><th>Profit in those dates</th><th>Investor&apos;s part</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, n) => (
              <tr key={n}>
                <td>{r.agreementNo} (v{r.versionNo})</td>
                <td>{r.partyName}</td>
                <td>{placeName(r.place)}</td>
                <td>{BASIS_LABEL[r.basis]}</td>
                <td>{formatUnits(r.units)}</td>
                <td>{r.from} to {r.to}</td>
                <td>{inr(r.profitBase)}</td>
                <td>{inr(r.share)}</td>
              </tr>
            ))}
            {totals.map((t) => (
              <tr key={`t${t.agreementId}`}>
                <td colSpan={7}><strong>{t.agreementNo} – {t.partyName}: payable for the period</strong></td>
                <td><strong>{inr(t.payable)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        A loss reduces the next part of the same agreement and is never paid out as a negative. Losses from before
        the start date above are not carried in, so use the start of the financial year for a full picture.
      </p>
    </main>
  );
}
