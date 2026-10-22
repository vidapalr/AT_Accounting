
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../accounting.module.css";
import {
  createDraftJournalAction,
} from "@/lib/draft-journal-actions";

import {
  postDraftJournalAction,
} from "@/lib/journal-posting-actions";

import {
  reversePostedJournalAction,
} from "@/lib/journal-reversal-actions";

type Props = {
  searchParams: Promise<{ result?: string ; posting?: string ; reversal?: string }>;
};

interface FinancialYear extends RowDataPacket {
  id: number;
}

interface Period extends RowDataPacket {
  id: number;
  period_name: string;
  fiscal_year_label: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface Account extends RowDataPacket {
  id: number;
  account_code: string;
  account_name: string;
  requires_division: number;
  requires_branch: number;
}

interface Division extends RowDataPacket {
  id: number;
  name: string;
  code: string;
}

interface Branch extends RowDataPacket {
  id: number;
  division_id: number;
  branch_name: string;
  branch_code: string;
}

interface Journal extends RowDataPacket {
  id: number;
  journal_no: string;
  entry_date: string;
  description: string;
  status: string;
  total_debit: string;
  total_credit: string;
  line_count: number;
}

const messages: Record<string, string> = {
  created: "Draft journal saved successfully.",
  invalid: "Review the journal fields and lines.",
  unbalanced: "Total debits and credits must be equal.",
  "not-found": "Invalid financial year or accounting period.",
  "period-date-mismatch":
    "Journal date does not fall inside the selected month.",
  closed: "Cannot create a draft in a closed period.",
  "invalid-account":
    "Select active posting accounts and required dimensions.",
  "invalid-dimension":
    "The selected branch or division is not valid.",
  failed: "Unable to save the draft journal.",
};


const postingMessages: Record<string, string> = {
  posted: "Journal posted successfully.",
  invalid: "Select a journal and confirm the action.",
  "not-found": "Journal or legal business not found.",
  "already-processed":
    "This journal has already been processed.",
  "source-restricted":
    "Source-linked journals require their dedicated workflow.",
  "period-required":
    "An accounting period must be assigned.",
  "financial-period-missing":
    "The financial year or accounting month is missing.",
  "period-not-open":
    "Both the financial year and accounting month must be OPEN.",
  "date-mismatch":
    "Journal date, financial year and month do not match.",
  "invalid-lines":
    "One or more journal lines are invalid.",
  "restricted-account":
    "This ledger account requires a specialized posting workflow.",
  unbalanced:
    "Total debits must equal total credits.",
  "invalid-dimension":
    "A Division or Branch relationship is invalid.",
  "sequence-exhausted":
    "Journal numbering capacity has been reached.",
  failed: "Posting failed. Review the server logs.",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 100,
  padding: 8,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const cellStyle: React.CSSProperties = {
  padding: 8,
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
  textAlign: "left",
};

async function JournalsContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [
    [years],
    [periods],
    [accounts],
    [divisions],
    [branches],
    [journals],
  ] = await Promise.all([
    db.execute<FinancialYear[]>(
      `SELECT id
       FROM acct_financial_years
       WHERE legal_business_id = ?
       ORDER BY id DESC`,
      [businessId]
    ),

    db.execute<Period[]>(
      `SELECT
         id,
         period_name,
         fiscal_year_label,
         status,
         DATE_FORMAT(start_date, '%Y-%m-%d')
           AS start_date,
         DATE_FORMAT(end_date, '%Y-%m-%d')
           AS end_date
       FROM acct_accounting_periods
       WHERE legal_business_id = ?
         AND status <> 'CLOSED'
       ORDER BY start_date DESC`,
      [businessId]
    ),

    db.execute<Account[]>(
      `SELECT
         id,
         account_code,
         account_name,
         requires_division,
         requires_branch
       FROM acct_chart_of_accounts
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
         AND is_posting_account = 1
       ORDER BY account_code`,
      [businessId]
    ),

    db.execute<Division[]>(
      `SELECT id, name, code
       FROM acct_divisions
       WHERE legal_business_id = ?
       ORDER BY name`,
      [businessId]
    ),

    db.execute<Branch[]>(
      `SELECT
         id,
         division_id,
         branch_name,
         branch_code
       FROM acct_branches
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
       ORDER BY division_id, branch_name`,
      [businessId]
    ),

    db.execute<Journal[]>(
      `SELECT
         j.id,
         j.journal_no,
         DATE_FORMAT(j.entry_date, '%Y-%m-%d')
           AS entry_date,
         j.description,
         j.status,
         CAST(COALESCE(SUM(l.debit), 0)
           AS CHAR) AS total_debit,
         CAST(COALESCE(SUM(l.credit), 0)
           AS CHAR) AS total_credit,
         COUNT(l.id) AS line_count
       FROM acct_journal_entries j
       LEFT JOIN acct_journal_lines l
         ON l.journal_entry_id = j.id
        AND l.legal_business_id = j.legal_business_id
       WHERE j.legal_business_id = ?
       GROUP BY
         j.id,
         j.journal_no,
         j.entry_date,
         j.description,
         j.status
       ORDER BY j.id DESC
       LIMIT 50`,
      [businessId]
    ),
  ]);

  return (
    <main className={accountingStyles.page}>
      <header>
        <h1>Journal Entries</h1>
        <p>
          Create balanced draft journals for Abhiram Group.
          Financial posting is not enabled yet.
        </p>

        <Link href="/accounting/periods">
          View Accounting Periods
        </Link>
      </header>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process request."}
        </p>
      )}

      {query.posting && (
        <p role="status">
          {postingMessages[query.posting] ??
            "Unable to process posting."}
        </p>
      )}

      <section style={{
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        marginTop: 22,
      }}>
        <h2>Create Draft Journal</h2>

        <form
          action={createDraftJournalAction}
          style={{ display: "grid", gap: 18 }}
        >
          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
          }}>
            <label>
              Financial Year
              <select
                name="financial_year_id"
                required
                defaultValue=""
                style={inputStyle}
              >
                <option value="" disabled>
                  Select Financial Year
                </option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    Financial Year ID {year.id}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Accounting Period
              <select
                name="accounting_period_id"
                required
                defaultValue=""
                style={inputStyle}
              >
                <option value="" disabled>
                  Select Month
                </option>
                {periods.map((period) => (
                  <option
                    key={period.id}
                    value={period.id}
                  >
                    {period.period_name}
                    {" — "}
                    {period.status}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Journal Date
              <input
                type="date"
                name="entry_date"
                required
                style={inputStyle}
              />
            </label>
          </div>

          <label>
            Journal Description
            <textarea
              name="description"
              required
              minLength={5}
              maxLength={500}
              rows={2}
              placeholder="Describe the accounting transaction"
              style={inputStyle}
            />
          </label>

          <div style={{ overflowX: "auto" }}>
            <h3>Debit / Credit Lines</h3>

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
                    "Debit ₹",
                    "Credit ₹",
                  ].map((header) => (
                    <th key={header} style={cellStyle}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {Array.from({ length: 6 }, (_, index) => (
                  <tr key={index}>
                    <td style={cellStyle}>
                      {index + 1}
                    </td>

                    <td style={cellStyle}>
                      <select
                        name={`line_${index}_account`}
                        defaultValue=""
                        style={{
                          ...inputStyle,
                          minWidth: 205,
                        }}
                      >
                        <option value="">
                          Select Account
                        </option>

                        {accounts.map((account) => (
                          <option
                            key={account.id}
                            value={account.id}
                          >
                            {account.account_code}
                            {" — "}
                            {account.account_name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={cellStyle}>
                      <select
                        name={`line_${index}_division`}
                        defaultValue=""
                        style={{
                          ...inputStyle,
                          minWidth: 145,
                        }}
                      >
                        <option value="">
                          Group Level
                        </option>

                        {divisions.map((division) => (
                          <option
                            key={division.id}
                            value={division.id}
                          >
                            {division.code}
                            {" — "}
                            {division.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={cellStyle}>
                      <select
                        name={`line_${index}_branch`}
                        defaultValue=""
                        style={{
                          ...inputStyle,
                          minWidth: 145,
                        }}
                      >
                        <option value="">
                          Not Applicable
                        </option>

                        {branches.map((branch) => (
                          <option
                            key={branch.id}
                            value={branch.id}
                          >
                            {branch.branch_code}
                            {" — "}
                            {branch.branch_name}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={cellStyle}>
                      <input
                        name={`line_${index}_description`}
                        maxLength={500}
                        placeholder="Optional"
                        style={{
                          ...inputStyle,
                          minWidth: 160,
                        }}
                      />
                    </td>

                    <td style={cellStyle}>
                      <input
                        name={`line_${index}_debit`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </td>

                    <td style={cellStyle}>
                      <input
                        name={`line_${index}_credit`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        style={inputStyle}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p>
            Each used line must contain a debit or
            credit, not both. At least two lines are
            required, and total debit must equal
            total credit.
          </p>

          <button
            type="submit"
            style={{
              padding: "12px 20px",
              justifySelf: "start",
            }}
          >
            Save Draft Journal
          </button>
        </form>
      </section>

      <section style={{
        marginTop: 24,
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
      }}>
        <h2>Recent Journal Register</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "Journal No",
                  "Date",
                  "Description",
                  "Lines",
                  "Debit",
                  "Credit",
                  "Status",
                  "Action",
                ].map((header) => (
                  <th key={header} style={cellStyle}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {journals.map((journal) => (
                <tr key={journal.id}>
                  <td style={cellStyle}>
                    <Link href={`/accounting/journals/${journal.id}`}>
                      {journal.journal_no}
                    </Link>
                  </td>

                  <td style={cellStyle}>
                    {journal.entry_date}
                  </td>

                  <td style={cellStyle}>
                    {journal.description}
                  </td>

                  <td style={cellStyle}>
                    {journal.line_count}
                  </td>

                  <td style={cellStyle}>
                    ₹{journal.total_debit}
                  </td>

                  <td style={cellStyle}>
                    ₹{journal.total_credit}
                  </td>

                  <td style={cellStyle}>
                    {journal.status}
                  </td>

                  <td style={cellStyle}>
                    {journal.status === "DRAFT" ? (
                      <form
                        action={postDraftJournalAction}
                        style={{
                          display: "grid",
                          gap: 6,
                          minWidth: 135,
                        }}
                      >
                        <input
                          type="hidden"
                          name="journal_id"
                          value={journal.id}
                        />

                        <label>
                          <input
                            type="checkbox"
                            name="confirm"
                            value="POST"
                            required
                          />
                          {" "}Confirm posting
                        </label>

                        <button
                          type="submit"
                          style={{ padding: 8 }}
                        >
                          Post Journal
                        </button>
                      </form>
                    ) : (
                      <span>
                        {journal.status === "POSTED"
                          ? "Posted — Locked"
                          : "Reversed"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {journals.length === 0 && (
                <tr>
                  <td colSpan={8} style={cellStyle}>
                    No journal entries created yet.
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

export default function JournalsPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Journal Entries</h1>
          <p>Loading journal register…</p>
        </main>
      }
    >
      <JournalsContent {...props} />
    </Suspense>
  );
}
