import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { isReversibleSource } from "@/lib/ledger/reversible-sources";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { reversePostedJournalAction } from
  "@/lib/journal-reversal-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reversal?: string }>;
};

interface JournalHeader extends RowDataPacket {
  id: number;
  journal_no: string;
  draft_reference: string | null;
  entry_date: string;
  description: string;
  status: string;
  source_type: string | null;
  source_id: number | null;
  financial_year_label: string;
  financial_year_id: number;
  period_name: string | null;
  period_status: string | null;
  posted_at: string | null;
  created_at: string;
  created_by_name: string | null;
  posted_by_name: string | null;
}

interface JournalLine extends RowDataPacket {
  line_no: number;
  account_code: string;
  account_name: string;
  division_name: string | null;
  branch_name: string | null;
  description: string | null;
  debit: string;
  credit: string;
}

interface JournalReversal extends RowDataPacket {
  original_journal_id: number;
  reversal_journal_id: number;
  reversal_reason: string;
  reversed_at: string;
  original_number: string;
  reversal_number: string;
}

interface OpenPeriod extends RowDataPacket {
  id: number;
  period_name: string;
  start_date: string;
  end_date: string;
}

const cellStyle: React.CSSProperties = {
  borderBottom: "1px solid #e2e8f0",
  padding: "12px 10px",
  textAlign: "left",
  verticalAlign: "top",
};

function money(amount: string): string {
  // MySQL DECIMAL values are retained as strings.
  // Formatting here does not perform arithmetic.
  return `₹${amount}`;
}

async function JournalDetailContent({
  params,
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const { id } = await params;
  const query = await searchParams;

  if (
    !/^[1-9]\d*$/.test(id) ||
    !Number.isSafeInteger(Number(id))
  ) {
    notFound();
  }

  const journalId = Number(id);
  const businessId = user.legal_business_id;

  const [headerRows] =
    await db.execute<JournalHeader[]>(
      `SELECT
         j.id,
         j.journal_no,
         j.draft_reference,
         DATE_FORMAT(j.entry_date, '%Y-%m-%d')
             AS entry_date,
         j.description,
         j.status,
         j.source_type,
         j.source_id,
         j.financial_year_id,
         fy.label AS financial_year_label,
         ap.period_name,
         ap.status AS period_status,
         DATE_FORMAT(j.created_at, '%Y-%m-%d %H:%i')
             AS created_at,
         DATE_FORMAT(j.posted_at, '%Y-%m-%d %H:%i')
             AS posted_at,
         creator.full_name AS created_by_name,
         poster.full_name AS posted_by_name
       FROM acct_journal_entries j
       JOIN acct_financial_years fy
         ON fy.id = j.financial_year_id
        AND fy.legal_business_id = j.legal_business_id
       LEFT JOIN acct_accounting_periods ap
         ON ap.id = j.accounting_period_id
        AND ap.legal_business_id = j.legal_business_id
       LEFT JOIN acct_app_users creator
         ON creator.id = j.created_by
       LEFT JOIN acct_app_users poster
         ON poster.id = j.posted_by
       WHERE j.id = ?
         AND j.legal_business_id = ?
       LIMIT 1`,
      [journalId, businessId]
    );

  const header = headerRows[0];

  if (!header) {
    notFound();
  }

  const [lines] = await db.execute<JournalLine[]>(
    `SELECT
       l.line_no,
       a.account_code,
       a.account_name,
       d.name AS division_name,
       b.branch_name,
       l.description,
       CAST(l.debit AS CHAR) AS debit,
       CAST(l.credit AS CHAR) AS credit
     FROM acct_journal_lines l
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id
      AND a.legal_business_id = l.legal_business_id
     LEFT JOIN acct_divisions d
       ON d.id = l.division_id
      AND d.legal_business_id = l.legal_business_id
     LEFT JOIN acct_branches b
       ON b.id = l.branch_id
      AND b.division_id = l.division_id
      AND b.legal_business_id = l.legal_business_id
     WHERE l.journal_entry_id = ?
       AND l.legal_business_id = ?
     ORDER BY l.line_no`,
    [journalId, businessId]
  );

  const [totals] = await db.execute<RowDataPacket[]>(
    `SELECT
       CAST(COALESCE(SUM(debit), 0) AS CHAR)
           AS total_debit,
       CAST(COALESCE(SUM(credit), 0) AS CHAR)
           AS total_credit
     FROM acct_journal_lines
     WHERE journal_entry_id = ?
       AND legal_business_id = ?`,
    [journalId, businessId]
  );

  const total = totals[0];

  const [reversalRows] = await db.execute<JournalReversal[]>(
    `SELECT
       r.original_journal_id,
       r.reversal_journal_id,
       r.reversal_reason,
       DATE_FORMAT(r.reversed_at, '%Y-%m-%d %H:%i')
         AS reversed_at,
       original.journal_no AS original_number,
       reversing.journal_no AS reversal_number
     FROM acct_journal_reversals r
     JOIN acct_journal_entries original
       ON original.id = r.original_journal_id
      AND original.legal_business_id =
          r.legal_business_id
     JOIN acct_journal_entries reversing
       ON reversing.id = r.reversal_journal_id
      AND reversing.legal_business_id =
          r.legal_business_id
     WHERE r.legal_business_id = ?
       AND (
         r.original_journal_id = ?
         OR r.reversal_journal_id = ?
       )
     LIMIT 1`,
    [businessId, journalId, journalId]
  );

  const reversal = reversalRows[0] ?? null;

  const [openPeriods] = await db.execute<OpenPeriod[]>(
    `SELECT
       p.id,
       p.period_name,
       DATE_FORMAT(p.start_date, '%Y-%m-%d')
         AS start_date,
       DATE_FORMAT(p.end_date, '%Y-%m-%d')
         AS end_date
     FROM acct_accounting_periods p
     WHERE p.legal_business_id = ?
       AND p.status = 'OPEN'
       AND EXISTS (
         SELECT 1
         FROM acct_financial_years fy
         WHERE fy.legal_business_id = p.legal_business_id
           AND fy.status = 'OPEN'
           AND p.start_date >= fy.starts_on
           AND p.end_date <= fy.ends_on
       )
     ORDER BY p.start_date DESC`,
    [businessId]
  );

  return (
    <main style={{
      maxWidth: 1250,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link className="btn-link" href="/accounting/journals">
        ← Back to Journal Register
      </Link>

      <header style={{ marginTop: 20 }}>
        <h1>Journal Details</h1>
        <h2>{header.journal_no}</h2>
        <p>Status: <strong>{header.status}</strong></p>
      </header>

      <section style={{
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: 20,
        marginTop: 20,
      }}>
        <h3>Journal Information</h3>

        <dl style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}>
          <div>
            <dt>Journal Date</dt>
            <dd>{header.entry_date}</dd>
          </div>

          <div>
            <dt>Financial Year</dt>
            <dd>{header.financial_year_label}</dd>
          </div>

          <div>
            <dt>Accounting Period</dt>
            <dd>{header.period_name ?? "Not assigned"}</dd>
          </div>

          <div>
            <dt>Period Status</dt>
            <dd>{header.period_status ?? "—"}</dd>
          </div>

          <div>
            <dt>Original Draft Reference</dt>
            <dd>{header.draft_reference ?? "—"}</dd>
          </div>

          <div>
            <dt>Created By</dt>
            <dd>{header.created_by_name ?? "—"}</dd>
          </div>

          <div>
            <dt>Created At</dt>
            <dd>{header.created_at}</dd>
          </div>

          <div>
            <dt>Posted By</dt>
            <dd>{header.posted_by_name ?? "—"}</dd>
          </div>

          <div>
            <dt>Posted At</dt>
            <dd>{header.posted_at ?? "Not posted"}</dd>
          </div>

          <div>
            <dt>Source</dt>
            <dd>
              {header.source_type
                ? `${header.source_type} / ${header.source_id}`
                : "Manual journal"}
            </dd>
          </div>
        </dl>

        <h4>Narration</h4>
        <p>{header.description}</p>
      </section>

      <section style={{
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: 20,
        marginTop: 20,
      }}>
        <h3>Debit and Credit Lines</h3>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "#",
                  "Ledger Account",
                  "Division",
                  "Branch",
                  "Description",
                  "Debit",
                  "Credit",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {lines.map((line) => (
                <tr key={line.line_no}>
                  <td style={cellStyle}>{line.line_no}</td>

                  <td style={cellStyle}>
                    {line.account_code}
                    {" — "}
                    {line.account_name}
                  </td>

                  <td style={cellStyle}>
                    {line.division_name ?? "Group"}
                  </td>

                  <td style={cellStyle}>
                    {line.branch_name ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {line.description ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {money(line.debit)}
                  </td>

                  <td style={cellStyle}>
                    {money(line.credit)}
                  </td>
                </tr>
              ))}

              <tr>
                <td colSpan={5} style={cellStyle}>
                  <strong>Total</strong>
                </td>

                <td style={cellStyle}>
                  <strong>{money(total.total_debit)}</strong>
                </td>

                <td style={cellStyle}>
                  <strong>{money(total.total_credit)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {header.status === "POSTED" && (
          <p style={{ marginTop: 20 }}>
            This journal is posted and protected
            against ordinary modification.
          </p>
        )}

        {header.status === "REVERSED" && (
          <p style={{ marginTop: 20 }}>
            This journal has been reversed.
            The original accounting lines
            remain preserved.
          </p>
        )}
      </section>

      <section
        style={{
          padding: 20,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          marginTop: 24,
        }}
      >
        <h2>Journal Reversal</h2>

        {query.reversal && (
          <p role="status">
            {({
              reversed: "Reversal journal posted successfully.",
              invalid: "Check the reversal request.",
              "not-found": "Journal not found.",
              "not-posted": "Only posted journals can be reversed.",
              "source-restricted":
                "Source-linked journals need their original module.",
              "already-reversed":
                "This journal is already reversed or is itself a reversal.",
              "period-missing":
                "Select an available accounting period.",
              "period-not-open": "The selected month is not open.",
              "date-mismatch":
                "The reversal date must belong to the selected month and cannot precede the original.",
              "financial-year-mismatch":
                "No single open financial year matches the reversal month.",
              "invalid-original":
                "The original journal lines are not valid for reversal.",
              "sequence-exhausted":
                "Journal numbering capacity has been reached.",
              "number-conflict":
                "Existing journal numbering requires reconciliation.",
              "posting-conflict":
                "The reversal posting could not be finalized.",
              failed: "Reversal failed.",
            } as Record<string, string>)[query.reversal] ??
              "Unable to process reversal."}
          </p>
        )}

        {reversal ? (
          <div>
            {Number(reversal.original_journal_id) === journalId ? (
              <>
                <p>
                  <strong>POSTED — REVERSED</strong>
                </p>
                <p>
                  Reversal Journal:{" "}
                  <Link
                    href={
                      `/accounting/journals/${reversal.reversal_journal_id}`
                    }
                  >
                    {reversal.reversal_number}
                  </Link>
                </p>
              </>
            ) : (
              <p>
                This is a reversal of{" "}
                <Link
                  href={
                    `/accounting/journals/${reversal.original_journal_id}`
                  }
                >
                  {reversal.original_number}
                </Link>
              </p>
            )}

            <p>Reason: {reversal.reversal_reason}</p>
            <p>Reversed at: {reversal.reversed_at}</p>
          </div>
        ) : header.status === "POSTED" &&
            (header.source_type === null || isReversibleSource(header.source_type)) ? (
          <form
            action={reversePostedJournalAction}
            style={{
              display: "grid",
              gap: 14,
              maxWidth: 650,
            }}
          >
            <input
              type="hidden"
              name="original_journal_id"
              value={journalId}
            />

            <label style={{ display: "grid", gap: 6 }}>
              Reversal Accounting Period
              <select
                name="accounting_period_id"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select Open Month
                </option>
                {openPeriods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.period_name}
                    {" ("}{period.start_date}
                    {" to "}{period.end_date}{")"}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Reversal Date
              <input
                type="date"
                name="reversal_date"
                min={header.entry_date}
                required
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Reason for Reversal
              <textarea
                name="reversal_reason"
                minLength={10}
                maxLength={1000}
                rows={3}
                placeholder="Explain why the original journal must be reversed."
                required
              />
            </label>

            <label>
              <input
                type="checkbox"
                name="confirm"
                value="REVERSE"
                required
              />
              {" "}I confirm that the original journal must
              be reversed, and that this will create a
              new posted journal.
            </label>

            <button
              type="submit"
              disabled={openPeriods.length === 0}
              style={{ padding: 12 }}
            >
              Post Reversal Journal
            </button>
          </form>
        ) : (
          <p>Reversal is not available for this journal.</p>
        )}
      </section>
    </main>
  );
}

export default function JournalDetailPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Journal Details</h1>
          <p>Loading journal information…</p>
        </main>
      }
    >
      <JournalDetailContent {...props} />
    </Suspense>
  );
}
