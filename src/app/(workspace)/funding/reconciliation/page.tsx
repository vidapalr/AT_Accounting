
import Link from "next/link";
import { requireGroupOwner } from "@/lib/auth";

import {
  getParticipationReconciliation,
} from "@/lib/participation-reconciliation";

import {
  formatShareUnits,
} from "@/lib/effective-profit-participation";

type Props = {
  searchParams: Promise<{
    date?: string;
  }>;
};

export default async function ReconciliationPage({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const search = await searchParams;

  const report = await getParticipationReconciliation(
    user.legal_business_id
  );

  const selectedDate = report.dates.includes(
    search.date ?? ""
  )
    ? search.date!
    : report.dates.at(-1) ?? "";

  const selectedRows = report.rows.filter(
    (row) => row.date === selectedDate
  );

  const selectedFindings = report.findings.filter(
    (finding) =>
      finding.date <= selectedDate
  );

  return (
    <main
      style={{
        maxWidth: 1250,
        margin: "0 auto",
        padding: 24,
      }}
    >
      <header>
        <h1>Profit Participation Reconciliation</h1>

        <p>
          Validate contractual profit shares
          across Group, Division and Branch pools.
          No financial transactions are posted.
        </p>

        <p>
          <Link href="/funding/participation">
            ← Investor Participation Register
          </Link>
        </p>
      </header>

      <section
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 12,
          padding: 20,
          marginTop: 20,
        }}
      >
        <h2>Reconciliation Summary</h2>

        <p>
          <strong>Errors:</strong>{" "}
          {report.errorCount}
          {" | "}
          <strong>Items for review:</strong>{" "}
          {report.reviewCount}
          {" | "}
          <strong>Boundary dates:</strong>{" "}
          {report.dates.length}
        </p>

        <form method="GET">
          <label htmlFor="date">
            Reconciliation date
          </label>

          <select
            id="date"
            name="date"
            defaultValue={selectedDate}
            style={{
              marginLeft: 12,
              padding: 8,
            }}
          >
            {report.dates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>

          <button
            type="submit"
            style={{
              marginLeft: 10,
              padding: 9,
            }}
          >
            View
          </button>
        </form>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Direct Profit Pool Reconciliation</h2>

        <p>
          Each pool is checked independently.
          Inherited division participation is
          excluded from the direct branch total.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                <th>Pool</th>
                <th>Investors</th>
                <th>Allocated</th>
                <th>Group Residual</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {selectedRows.map((row) => (
                <tr key={row.scope}>
                  <td>{row.poolName}</td>
                  <td>{row.investorCount}</td>
                  <td>
                    {formatShareUnits(
                      row.allocatedUnits
                    )}
                  </td>
                  <td>
                    {row.residualUnits < 0
                      ? "INVALID"
                      : formatShareUnits(
                          row.residualUnits
                        )}
                  </td>
                  <td>
                    {row.residualUnits < 0
                      ? formatShareUnits(
                          row.allocatedUnits
                        )
                      : "100.0000%"}
                  </td>
                  <td>{row.status}</td>
                </tr>
              ))}

              {selectedRows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    No approved agreement boundaries
                    are available to reconcile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Reconciliation Findings</h2>

        {selectedFindings.length === 0 ? (
          <p>
            No findings recorded up to the
            selected boundary date.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Date</th>
                  <th>Pool</th>
                  <th>Finding</th>
                </tr>
              </thead>

              <tbody>
                {selectedFindings.map(
                  (finding, index) => (
                    <tr key={index}>
                      <td>
                        {finding.severity}
                      </td>
                      <td>{finding.date}</td>
                      <td>{finding.scope}</td>
                      <td>{finding.detail}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Interpretation</h2>

        <p>
          BALANCED means the direct pool does not
          exceed 100% and its residual can be
          calculated. It does not certify profit
          eligibility, signed-document validity,
          capital receipt or payout readiness.
        </p>

        <p>
          ERROR means a contractual percentage or
          its reconciliation requires correction.
          REVIEW means additional contractual
          evidence or policy confirmation is needed.
        </p>
      </section>
    </main>
  );
}
