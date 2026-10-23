
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../accounting.module.css";
import {
  createAccountingPeriodsAction,
} from "@/lib/accounting-period-actions";

import {
  changeAccountingPeriodStatusAction,
} from "@/lib/accounting-period-status-actions";

type Props = {
  searchParams: Promise<{
    year?: string;
    result?: string;
    status_result?: string;
  }>;
};

interface PeriodRow extends RowDataPacket {
  id: number;
  fiscal_year_label: string;
  period_no: number;
  period_name: string;
  start_date: string;
  end_date: string;
  status: string;
  status_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
}

const messages: Record<string, string> = {
  created: "All 12 accounting periods were created.",
  "already-exists":
    "Periods already exist or overlap this financial year.",
  "invalid-year": "Enter a valid financial year start.",
  "not-found": "Legal business not found.",
  failed: "Period generation failed. Check server logs.",
};

const statusMessages: Record<string, string> = {
  updated: "Accounting period status updated successfully.",
  invalid: "Enter a valid action and a reason of at least 10 characters.",
  "not-found": "The accounting period was not found.",
  "invalid-transition":
    "This transition is not allowed from the current period status.",
  "earlier-not-closed":
    "Close all earlier periods in the financial year first.",
  failed: "Unable to change the accounting period status.",
};

type PeriodOperation =
  | "OPEN"
  | "SOFT_CLOSE"
  | "FINAL_CLOSE"
  | "REOPEN";

function availableOperation(
  status: string
): { value: PeriodOperation; label: string }[] {
  switch (status) {
    case "NOT_OPENED":
      return [{ value: "OPEN", label: "Open Period" }];
    case "OPEN":
      return [{ value: "SOFT_CLOSE", label: "Soft Close" }];
    case "SOFT_CLOSED":
      return [
        { value: "FINAL_CLOSE", label: "Final Close" },
        { value: "REOPEN", label: "Reopen for Corrections" },
      ];
    default:
      return [];
  }
}


const thStyle: React.CSSProperties = {
  padding: "11px 12px",
  textAlign: "left",
  borderBottom: "1px solid #cbd5e1",
};

const tdStyle: React.CSSProperties = {
  padding: "11px 12px",
  borderBottom: "1px solid #e2e8f0",
};

export default function AccountingPeriodsPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading accounting periods...
        </main>
      }
    >
      <AccountingPeriodsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AccountingPeriodsContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;

  const [yearRows] = await db.execute<RowDataPacket[]>(
    `SELECT DISTINCT fiscal_year_label
     FROM acct_accounting_periods
     WHERE legal_business_id = ?
     ORDER BY fiscal_year_label DESC`,
    [user.legal_business_id]
  );

  const years = yearRows.map(
    (row) => String(row.fiscal_year_label)
  );

  const chosenYear =
    query.year && years.includes(query.year)
      ? query.year
      : years[0] ?? "";

  const [periods] = chosenYear
    ? await db.execute<PeriodRow[]>(
        `SELECT
           id,
           fiscal_year_label,
           period_no,
           period_name,
           DATE_FORMAT(start_date, '%Y-%m-%d')
             AS start_date,
           DATE_FORMAT(end_date, '%Y-%m-%d')
             AS end_date,
           status,
           status_reason,
           DATE_FORMAT(opened_at, '%Y-%m-%d %H:%i')
             AS opened_at,
           DATE_FORMAT(closed_at, '%Y-%m-%d %H:%i')
             AS closed_at
         FROM acct_accounting_periods
         WHERE legal_business_id = ?
           AND fiscal_year_label = ?
         ORDER BY period_no`,
        [user.legal_business_id, chosenYear]
      )
    : [[] as PeriodRow[]];

  const counts = periods.reduce(
    (acc, period) => {
      acc[period.status] =
        (acc[period.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const defaultYear = new Date().getUTCFullYear();

  return (
    <main className={accountingStyles.page}>
      <header>
        <h1>Accounting Periods</h1>

        <p>
          Manage monthly posting periods for
          Abhiram Group&apos;s April–March
          financial years.
        </p>

        <Link className="btn-link" href="/accounting/chart-of-accounts">
          ← Chart of Accounts
        </Link>
      </header>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process request."}
        </p>
      )}

      {query.status_result && (
        <p role="status">
          {statusMessages[query.status_result] ??
            "Unable to process the request."}
        </p>
      )}

      <section style={{
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        marginTop: 24,
      }}>
        <h2>Create Financial Year Periods</h2>

        <p>
          Generates April through March as
          12 initially locked periods.
          Existing periods will not be overwritten.
        </p>

        <form
          action={createAccountingPeriodsAction}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <label style={{
            display: "grid",
            gap: 6,
          }}>
            Financial Year Starting Year
            <input
              name="start_year"
              type="number"
              min={2000}
              max={2098}
              defaultValue={defaultYear}
              required
              style={{ padding: 10 }}
            />
          </label>

          <button
            type="submit"
            style={{ padding: 11 }}
          >
            Generate 12 Periods
          </button>
        </form>
      </section>

      <section style={{
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        marginTop: 24,
      }}>
        <h2>Financial Period Register</h2>

        {years.length > 0 && (
          <form
            method="GET"
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <label htmlFor="year">
              Financial Year
            </label>

            <select
              id="year"
              name="year"
              defaultValue={chosenYear}
              style={{ padding: 10 }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  FY {year}
                </option>
              ))}
            </select>

            <button type="submit">View</button>
          </form>
        )}

        <div style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 18,
        }}>
          <span>
            <strong>Not opened:</strong>{" "}
            {counts.NOT_OPENED ?? 0}
          </span>

          <span>
            <strong>Open:</strong>{" "}
            {counts.OPEN ?? 0}
          </span>

          <span>
            <strong>Soft closed:</strong>{" "}
            {counts.SOFT_CLOSED ?? 0}
          </span>

          <span>
            <strong>Closed:</strong>{" "}
            {counts.CLOSED ?? 0}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                <th style={thStyle}>Period</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>To</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Last Opening</th>
                <th style={thStyle}>Last Closing</th>
                <th style={thStyle}>Notes</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>

            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <td style={tdStyle}>
                    <strong>
                      {period.period_no}.
                      {" "}
                      {period.period_name}
                    </strong>
                  </td>

                  <td style={tdStyle}>
                    {period.start_date}
                  </td>

                  <td style={tdStyle}>
                    {period.end_date}
                  </td>

                  <td style={tdStyle}>
                    {period.status}
                  </td>

                  <td style={tdStyle}>
                    {period.opened_at ?? "—"}
                  </td>

                  <td style={tdStyle}>
                    {period.closed_at ?? "—"}
                  </td>

                  <td style={tdStyle}>
                    {period.status_reason ?? "—"}
                  </td>

                  <td style={tdStyle}>
                    {period.status === "CLOSED" ? (
                      <span>Finalized — Locked</span>
                    ) : (
                      <form
                        action={changeAccountingPeriodStatusAction}
                        style={{
                          display: "grid",
                          gap: 8,
                          minWidth: 230,
                        }}
                      >
                        <input
                          type="hidden"
                          name="period_id"
                          value={period.id}
                        />

                        <select
                          name="operation"
                          required
                          defaultValue=""
                          style={{
                            padding: 8,
                            border: "1px solid #cbd5e1",
                            borderRadius: 5,
                          }}
                        >
                          <option value="" disabled>
                            Select Action
                          </option>
                          {availableOperation(period.status).map(
                            (operation) => (
                              <option
                                key={operation.value}
                                value={operation.value}
                              >
                                {operation.label}
                              </option>
                            )
                          )}
                        </select>

                        <textarea
                          name="reason"
                          placeholder="Reason for this status change"
                          minLength={10}
                          maxLength={1000}
                          rows={2}
                          required
                          style={{
                            padding: 8,
                            border: "1px solid #cbd5e1",
                            borderRadius: 5,
                          }}
                        />

                        <button
                          type="submit"
                          style={{ padding: 8 }}
                        >
                          Confirm Action
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}

              {periods.length === 0 && (
                <tr>
                  <td colSpan={8} style={tdStyle}>
                    No accounting periods generated
                    for the selected financial year.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
