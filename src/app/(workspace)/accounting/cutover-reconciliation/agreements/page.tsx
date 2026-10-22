
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type Props = {
  searchParams: Promise<{ cutover?: string }>;
};

interface Agreement extends RowDataPacket {
  id: number;
  agreement_no: string;
  party_id: number;
  investor_name: string;
  funding_type: string;
  status: string;
  division_id: number | null;
  branch_id: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface Version extends RowDataPacket {
  id: number;
  agreement_id: number;
  version_no: number;
  version_status: string;
  policy_status: string | null;
  effective_from: string;
  effective_to: string | null;
}

interface Movement extends RowDataPacket {
  agreement_id: number;
  received: string;
  repaid: string;
  returns_paid: string;
  verified_count: number;
  linked_posted_count: number;
  unlinked_count: number;
  linked_other_count: number;
}

interface Opening extends RowDataPacket {
  agreement_id: number | null;
  party_id: number;
  division_id: number | null;
  branch_id: number | null;
  classification: string;
  opening_amount: string;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }

  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  );
}

function toPaise(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid stored money amount");
  }

  const negative = value.startsWith("-");
  const raw = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = raw.split(".");

  const result =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  return negative ? -result : result;
}

function rupees(n: bigint): string {
  const sign = n < 0n ? "-" : "";
  const abs = n < 0n ? -n : n;

  return (
    `${sign}₹${abs / 100n}.` +
    String(abs % 100n).padStart(2, "0")
  );
}

function idOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

const cell: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

async function AgreementReconciliationContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const [batches] = await db.execute<RowDataPacket[]>(
    `SELECT
       id,
       status,
       DATE_FORMAT(opening_date, '%Y-%m-%d')
         AS opening_date
     FROM acct_opening_balance_batches
     WHERE legal_business_id = ?
     LIMIT 1`,
    [businessId]
  );

  const batch = batches[0] ?? null;

  // This reconciliation must match the actual saved
  // opening balance date, not an arbitrary report date.
  const requested = query.cutover ?? "";
  const cutover = batch?.opening_date ?? null;

  if (!cutover) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Agreement Cutover Reconciliation</h1>
        <p>Create an opening balance worksheet first.</p>
        <Link href="/accounting/opening-balances">
          Opening Balances
        </Link>
      </main>
    );
  }

  const [agreements] = await db.execute<Agreement[]>(
    `SELECT
       a.id,
       a.agreement_no,
       a.party_id,
       p.full_name AS investor_name,
       a.funding_type,
       a.status,
       a.division_id,
       a.branch_id,
       DATE_FORMAT(a.effective_from, '%Y-%m-%d')
         AS effective_from,
       DATE_FORMAT(a.effective_to, '%Y-%m-%d')
         AS effective_to
     FROM acct_funding_agreements a
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
     WHERE a.legal_business_id = ?
     ORDER BY a.agreement_no`,
    [businessId]
  );

  const [versions] = await db.execute<Version[]>(
    `SELECT
       v.id,
       v.agreement_id,
       v.version_no,
       v.version_status,
       DATE_FORMAT(v.effective_from, '%Y-%m-%d')
         AS effective_from,
       DATE_FORMAT(v.effective_to, '%Y-%m-%d')
         AS effective_to,
       p.policy_status
     FROM acct_agreement_versions v
     LEFT JOIN acct_agreement_funding_policies p
       ON p.agreement_version_id = v.id
      AND p.agreement_id = v.agreement_id
      AND p.legal_business_id = v.legal_business_id
     WHERE v.legal_business_id = ?
     ORDER BY v.agreement_id, v.version_no DESC`,
    [businessId]
  );

  const [movements] = await db.execute<Movement[]>(
    `SELECT
       t.agreement_id,

       CAST(COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'FUNDING_RECEIVED'
           THEN t.amount ELSE 0
         END
       ), 0) AS CHAR) AS received,

       CAST(COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'PRINCIPAL_REPAID'
           THEN t.amount ELSE 0
         END
       ), 0) AS CHAR) AS repaid,

       CAST(COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'RETURN_PAID'
           THEN t.amount ELSE 0
         END
       ), 0) AS CHAR) AS returns_paid,

       COUNT(*) AS verified_count,

       SUM(
         CASE WHEN j.status = 'POSTED'
         THEN 1 ELSE 0 END
       ) AS linked_posted_count,

       SUM(
         CASE WHEN t.journal_entry_id IS NULL
         THEN 1 ELSE 0 END
       ) AS unlinked_count,

       SUM(
         CASE
           WHEN t.journal_entry_id IS NOT NULL
            AND (j.id IS NULL OR j.status <> 'POSTED')
           THEN 1 ELSE 0 END
       ) AS linked_other_count

     FROM acct_funding_transactions t
     LEFT JOIN acct_journal_entries j
       ON j.id = t.journal_entry_id
      AND j.legal_business_id = t.legal_business_id
     WHERE t.legal_business_id = ?
       AND t.transaction_date <= ?
       AND t.status = 'VERIFIED'
     GROUP BY t.agreement_id`,
    [businessId, cutover]
  );

  const [opening] = await db.execute<Opening[]>(
    `SELECT
       f.agreement_id,
       f.funding_party_id AS party_id,
       l.division_id,
       l.branch_id,
       f.classification,
       CAST(f.opening_amount AS CHAR)
         AS opening_amount
     FROM acct_opening_funding_details f
     JOIN acct_opening_balance_lines l
       ON l.id = f.opening_line_id
      AND l.legal_business_id = f.legal_business_id
     WHERE f.legal_business_id = ?
       AND l.batch_id = ?`,
    [businessId, batch.id]
  );

  const movementMap = new Map(
    movements.map((m) => [Number(m.agreement_id), m])
  );

  const versionMap = new Map<number, Version[]>();

  for (const version of versions) {
    const key = Number(version.agreement_id);
    const current = versionMap.get(key) ?? [];
    current.push(version);
    versionMap.set(key, current);
  }

  const openingMap = new Map<number, Opening[]>();

  for (const line of opening) {
    if (line.agreement_id === null) continue;

    const key = Number(line.agreement_id);
    const current = openingMap.get(key) ?? [];
    current.push(line);
    openingMap.set(key, current);
  }

  const report = agreements.map((agreement) => {
    const movement = movementMap.get(Number(agreement.id));

    const received = toPaise(movement?.received ?? "0");
    const repaid = toPaise(movement?.repaid ?? "0");
    const returnsPaid =
      toPaise(movement?.returns_paid ?? "0");

    const outstanding = received - repaid;
    const openingLines =
      openingMap.get(Number(agreement.id)) ?? [];

    const openingAmount = openingLines.reduce(
      (sum, line) =>
        sum + toPaise(line.opening_amount),
      0n
    );

    const applicableVersions =
      (versionMap.get(Number(agreement.id)) ?? [])
        .filter(
          (v) =>
            ["APPROVED", "SUPERSEDED"].includes(
              v.version_status
            ) &&
            v.effective_from <= cutover &&
            (
              v.effective_to === null ||
              v.effective_to >= cutover
            )
        );

    const issues: string[] = [];

    if (
      agreement.status !== "ACTIVE" ||
      agreement.effective_from > cutover ||
      (
        agreement.effective_to !== null &&
        agreement.effective_to < cutover
      )
    ) {
      issues.push("Agreement not active at cutover");
    }

    if (applicableVersions.length !== 1) {
      issues.push("Requires exactly one applicable version");
    } else if (
      applicableVersions[0].policy_status !== "CONFIRMED"
    ) {
      issues.push("Funding policy not confirmed");
    }

    if (openingLines.length > 1) {
      issues.push("Multiple opening lines for one agreement");
    }

    if (openingLines.length === 1) {
      const line = openingLines[0];

      if (
        Number(line.party_id) !== Number(agreement.party_id) ||
        idOrNull(line.division_id) !==
          idOrNull(agreement.division_id) ||
        idOrNull(line.branch_id) !==
          idOrNull(agreement.branch_id)
      ) {
        issues.push("Investor or scope does not match");
      }

      if (line.classification !== "REPAYABLE_LIABILITY") {
        issues.push("Funding classification requires review");
      }
    }

    if (outstanding < 0n) {
      issues.push("Negative outstanding principal");
    }

    if (openingAmount !== outstanding) {
      issues.push("Opening amount differs from transactions");
    }

    if (agreement.funding_type !== "LOAN") {
      issues.push("Profit-linked terms require accounting review");
    }

    if (Number(movement?.linked_posted_count ?? 0) > 0) {
      issues.push("Existing posted GL funding requires cutover review");
    }

    if (Number(movement?.unlinked_count ?? 0) > 0) {
      issues.push("Verified transactions without GL links");
    }

    if (Number(movement?.linked_other_count ?? 0) > 0) {
      issues.push("Funding linked to a non-posted journal");
    }

    return {
      agreement,
      outstanding,
      openingAmount,
      received,
      repaid,
      returnsPaid,
      version: applicableVersions.length === 1
        ? applicableVersions[0]
        : null,
      issues,
    };
  });

  const unlinkedOpening = opening.filter(
    (line) =>
      line.agreement_id === null ||
      !agreements.some(
        (agreement) =>
          Number(agreement.id) === Number(line.agreement_id)
      )
  );

  const needsAttention = report.filter(
    (row) => row.issues.length > 0
  ).length + unlinkedOpening.length;

  return (
    <main style={{
      maxWidth: 1500,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting/cutover-reconciliation">
        ← Cutover Reconciliation
      </Link>

      <h1>Agreement-Level Cutover Reconciliation</h1>

      <p>
        Saved opening date: <strong>{cutover}</strong>
      </p>

      {requested && (
        <p>
          This report uses the saved opening date,
          not a separate reporting date.
        </p>
      )}

      <p>
        Agreements reviewed: <strong>{report.length}</strong>
        {" | "}
        Requiring attention: <strong>{needsAttention}</strong>
      </p>

      <section style={{ marginTop: 24 }}>
        <h2>Investor Funding Reconciliation</h2>

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
                  "Applicable Version",
                  "Received",
                  "Principal Repaid",
                  "Outstanding",
                  "Opening Amount",
                  "Difference",
                  "Review Findings",
                ].map((heading) => (
                  <th key={heading} style={cell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {report.map((row) => (
                <tr key={row.agreement.id}>
                  <td style={cell}>
                    {row.agreement.agreement_no}
                  </td>

                  <td style={cell}>
                    {row.agreement.investor_name}
                  </td>

                  <td style={cell}>
                    {row.agreement.funding_type}
                  </td>

                  <td style={cell}>
                    {row.version
                      ? `V${row.version.version_no}`
                      : "Not uniquely resolved"}
                  </td>

                  <td style={cell}>
                    {rupees(row.received)}
                  </td>

                  <td style={cell}>
                    {rupees(row.repaid)}
                  </td>

                  <td style={cell}>
                    {rupees(row.outstanding)}
                  </td>

                  <td style={cell}>
                    {rupees(row.openingAmount)}
                  </td>

                  <td style={cell}>
                    {rupees(
                      row.openingAmount - row.outstanding
                    )}
                  </td>

                  <td style={cell}>
                    {row.issues.length === 0
                      ? "Calculated amounts agree"
                      : row.issues.join("; ")}
                  </td>
                </tr>
              ))}

              {report.length === 0 && (
                <tr>
                  <td colSpan={10} style={cell}>
                    No funding agreements found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {unlinkedOpening.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Unlinked Opening Funding</h2>

          <p role="alert">
            {unlinkedOpening.length} opening funding
            line(s) have no valid agreement reference.
            These must be corrected before posting.
          </p>
        </section>
      )}

      <section style={{
        marginTop: 24,
        padding: 18,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
      }}>
        <h2>Reconciliation Interpretation</h2>

        <p>
          A matching amount does not by itself prove
          that historical funding is complete or that
          the investment has been classified correctly.
        </p>

        <p>
          Verified funding records, agreements and
          previous journal postings must be reviewed
          together before allowing cutover adjustments.
        </p>

        <p>
          No changes to the General Ledger are
          performed by this report.
        </p>
      </section>
    </main>
  );
}

export default function AgreementReconciliationPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Agreement Reconciliation</h1>
          <p>Loading agreement records…</p>
        </main>
      }
    >
      <AgreementReconciliationContent {...props} />
    </Suspense>
  );
}
