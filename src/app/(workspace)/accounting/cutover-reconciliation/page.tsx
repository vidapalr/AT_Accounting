
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type Props = {
  searchParams: Promise<{ cutover?: string }>;
};

interface FundingRow extends RowDataPacket {
  agreement_id: number;
  agreement_no: string;
  investor: string;
  funding_type: string;
  agreement_status: string;
  division_id: number | null;
  branch_id: number | null;
  received: string;
  repaid: string;
  returns_paid: string;
  verified_count: number;
  unposted_count: number;
  posted_count: number;
}

interface JournalActivity extends RowDataPacket {
  journal_count: number;
  opening_journals: number;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  );
}

function paise(value: string): bigint {
  const s = String(value);

  if (!/^-?\d+(?:\.\d{1,2})?$/.test(s)) {
    throw new Error("Invalid database amount");
  }

  const negative = s.startsWith("-");
  const raw = negative ? s.slice(1) : s;
  const [whole, decimal = ""] = raw.split(".");

  const result =
    BigInt(whole) * 100n +
    BigInt(decimal.padEnd(2, "0"));

  return negative ? -result : result;
}

function money(value: bigint): string {
  const negative = value < 0n;
  const amount = negative ? -value : value;

  return (
    `${negative ? "-" : ""}₹${amount / 100n}.` +
    String(amount % 100n).padStart(2, "0")
  );
}

const td: React.CSSProperties = {
  padding: 10,
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

async function ReconciliationContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const requestedDate = query.cutover ?? "";
  const cutover = validDate(requestedDate)
    ? requestedDate
    : null;

  const [batches] = await db.execute<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(opening_date, '%Y-%m-%d')
         AS opening_date,
       status
     FROM acct_opening_balance_batches
     WHERE legal_business_id = ?
     LIMIT 1`,
    [businessId]
  );

  const savedDate = batches[0]?.opening_date ?? null;
  const effectiveDate = cutover ?? savedDate;

  let funding: FundingRow[] = [];
  let journalActivity: JournalActivity | null = null;

  if (effectiveDate) {
    const [fundingRows] =
      await db.execute<FundingRow[]>(
        `SELECT
           a.id AS agreement_id,
           a.agreement_no,
           p.full_name AS investor,
           a.funding_type,
           a.status AS agreement_status,
           a.division_id,
           a.branch_id,

           CAST(COALESCE(SUM(
             CASE
               WHEN t.status = 'VERIFIED'
                AND t.transaction_type = 'FUNDING_RECEIVED'
               THEN t.amount ELSE 0
             END
           ), 0) AS CHAR) AS received,

           CAST(COALESCE(SUM(
             CASE
               WHEN t.status = 'VERIFIED'
                AND t.transaction_type = 'PRINCIPAL_REPAID'
               THEN t.amount ELSE 0
             END
           ), 0) AS CHAR) AS repaid,

           CAST(COALESCE(SUM(
             CASE
               WHEN t.status = 'VERIFIED'
                AND t.transaction_type = 'RETURN_PAID'
               THEN t.amount ELSE 0
             END
           ), 0) AS CHAR) AS returns_paid,

           COUNT(DISTINCT CASE
             WHEN t.status = 'VERIFIED'
             THEN t.id END
           ) AS verified_count,

           COUNT(DISTINCT CASE
             WHEN t.status = 'VERIFIED'
              AND (
                t.journal_entry_id IS NULL
                OR j.id IS NULL
                OR j.status <> 'POSTED'
              )
             THEN t.id END
           ) AS unposted_count,

           COUNT(DISTINCT CASE
             WHEN t.status = 'VERIFIED'
              AND j.status = 'POSTED'
             THEN t.id END
           ) AS posted_count

         FROM acct_funding_agreements a
         JOIN acct_funding_parties p
           ON p.id = a.party_id
          AND p.legal_business_id = a.legal_business_id

         LEFT JOIN acct_funding_transactions t
           ON t.agreement_id = a.id
          AND t.legal_business_id = a.legal_business_id
          AND t.transaction_date <= ?

         LEFT JOIN acct_journal_entries j
           ON j.id = t.journal_entry_id
          AND j.legal_business_id = t.legal_business_id

         WHERE a.legal_business_id = ?
           AND a.effective_from <= ?

         GROUP BY
           a.id,
           a.agreement_no,
           p.full_name,
           a.funding_type,
           a.status,
           a.division_id,
           a.branch_id

         ORDER BY a.agreement_no`,
        [effectiveDate, businessId, effectiveDate]
      );

    funding = fundingRows;

    const [activityRows] =
      await db.execute<JournalActivity[]>(
        `SELECT
           COUNT(*) AS journal_count,
           COALESCE(SUM(
             CASE WHEN source_type = 'OPENING_BALANCE'
             THEN 1 ELSE 0 END
           ), 0) AS opening_journals
         FROM acct_journal_entries
         WHERE legal_business_id = ?
           AND status = 'POSTED'
           AND entry_date <= ?`,
        [businessId, effectiveDate]
      );

    journalActivity = activityRows[0] ?? null;
  }

  const totals = funding.reduce(
    (acc, row) => ({
      received: acc.received + paise(row.received),
      repaid: acc.repaid + paise(row.repaid),
      returnsPaid:
        acc.returnsPaid + paise(row.returns_paid),
    }),
    {
      received: 0n,
      repaid: 0n,
      returnsPaid: 0n,
    }
  );

  return (
    <main style={{
      maxWidth: 1450,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link className="btn-link" href="/accounting/opening-balances/review">
        ← Opening Balance Review
      </Link>

      <h1>Historical Cutover Reconciliation</h1>

      <p>
        Review investor funding and posted accounting
        activity through the selected cutover date.
      </p>

      <form
        method="get"
        style={{
          display: "flex",
          alignItems: "end",
          gap: 12,
          flexWrap: "wrap",
          marginTop: 20,
        }}
      >
        <label>
          Cutover Date
          <input
            type="date"
            name="cutover"
            defaultValue={effectiveDate ?? ""}
            required
            style={{
              display: "block",
              padding: 9,
              marginTop: 5,
            }}
          />
        </label>

        <button type="submit" style={{ padding: 10 }}>
          Review Transactions
        </button>
      </form>

      {requestedDate && !cutover && (
        <p role="alert">
          Invalid date supplied. Showing the saved
          opening date, if available.
        </p>
      )}

      {!effectiveDate ? (
        <p>
          Select a cutover date to run the reconciliation.
        </p>
      ) : (
        <>
          <section style={{ marginTop: 24 }}>
            <h2>Consolidated Funding Summary</h2>

            <p>
              Verified funding received:{" "}
              <strong>{money(totals.received)}</strong>
            </p>

            <p>
              Verified principal repaid:{" "}
              <strong>{money(totals.repaid)}</strong>
            </p>

            <p>
              Calculated outstanding principal:{" "}
              <strong>
                {money(totals.received - totals.repaid)}
              </strong>
            </p>

            <p>
              Returns paid, shown separately:{" "}
              <strong>
                {money(totals.returnsPaid)}
              </strong>
            </p>

            <p>
              Posted journals through cutover:{" "}
              <strong>
                {journalActivity?.journal_count ?? 0}
              </strong>
            </p>
          </section>

          <section style={{ marginTop: 28 }}>
            <h2>Agreement-wise Reconciliation</h2>

            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
              }}>
                <thead>
                  <tr>
                    {[
                      "Agreement",
                      "Investor",
                      "Type",
                      "Scope",
                      "Received",
                      "Principal Repaid",
                      "Outstanding",
                      "Unposted Verified Transactions",
                      "Review",
                    ].map((heading) => (
                      <th key={heading} style={td}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {funding.map((row) => {
                    const outstanding =
                      paise(row.received) -
                      paise(row.repaid);

                    const unposted =
                      Number(row.unposted_count);

                    const needsReview =
                      outstanding < 0n ||
                      unposted > 0 ||
                      row.funding_type !== "LOAN";

                    return (
                      <tr key={row.agreement_id}>
                        <td style={td}>
                          {row.agreement_no}
                        </td>

                        <td style={td}>
                          {row.investor}
                        </td>

                        <td style={td}>
                          {row.funding_type}
                        </td>

                        <td style={td}>
                          {row.division_id === null
                            ? "Group"
                            : (
                              row.branch_id === null
                                ? `Division ${row.division_id}`
                                : `Division ${row.division_id} / Branch ${row.branch_id}`
                            )}
                        </td>

                        <td style={td}>
                          {money(paise(row.received))}
                        </td>

                        <td style={td}>
                          {money(paise(row.repaid))}
                        </td>

                        <td style={td}>
                          <strong>{money(outstanding)}</strong>
                        </td>

                        <td style={td}>
                          {row.unposted_count}
                        </td>

                        <td style={td}>
                          {needsReview
                            ? "Review required"
                            : "Amount calculated"}
                        </td>
                      </tr>
                    );
                  })}

                  {funding.length === 0 && (
                    <tr>
                      <td colSpan={9} style={td}>
                        No applicable funding agreements
                        found through this date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{
            marginTop: 24,
            padding: 16,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
          }}>
            <h2>Reconciliation Status</h2>

            <p>
              This is a read-only reconciliation report.
              It does not import transactions, modify
              opening balances or post journal entries.
            </p>

            <p>
              Funding amounts must also agree with
              signed agreement terms and supporting
              transaction evidence.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

export default function CutoverReconciliationPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Historical Cutover Reconciliation</h1>
          <p>Loading reconciliation…</p>
        </main>
      }
    >
      <ReconciliationContent {...props} />
    </Suspense>
  );
}
