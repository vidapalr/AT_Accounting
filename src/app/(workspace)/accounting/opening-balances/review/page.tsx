
import { Suspense } from "react";
import Link from "next/link";
import OpeningSteps from "@/components/OpeningSteps";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../../accounting.module.css";

import {
  postOpeningBalancesAction,
} from "@/lib/opening-balance-posting-actions";

import {
  authorizeOpeningBalancesAction,
} from "@/lib/opening-balance-authorization-actions";

type ReviewProps = {
  searchParams: Promise<{
    authorization?: string;
    posting?: string;
  }>;
};

interface Batch extends RowDataPacket {
  id: number;
  status: string;
  opening_date: string;
  description: string;
  financial_year_id: number;
  accounting_period_id: number;
  fy_status: string;
  period_status: string;
  fy_start: string;
  fy_end: string;
  period_start: string;
  period_end: string;
  posted_journal_id: number | null;
}

interface OpeningLine extends RowDataPacket {
  id: number;
  line_no: number;
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype: string;
  account_status: string;
  is_posting_account: number;
  requires_division: number;
  requires_branch: number;
  division_id: number | null;
  branch_id: number | null;
  division_found: number | null;
  branch_found: number | null;
  debit: string;
  credit: string;
  funding_party_id: number | null;
  funding_party_found: number | null;
  funding_reference: string | null;
  classification: string | null;
  opening_amount: string | null;
  business_bank_count: number;
  cash_count: number;
  cash_division: number | null;
  cash_branch: number | null;
}

interface InvestorBankOpening extends RowDataPacket {
  bank_account_id: number;
  bank_name: string;
  account_label: string;
  account_number_last4: string;
  opening_amount: string | null;
}

function paise(value: string): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid DECIMAL value");
  }

  const [whole, decimal = ""] = value.split(".");

  return (
    BigInt(whole) * 100n +
    BigInt(decimal.padEnd(2, "0"))
  );
}

function formatMoney(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;

  return (
    `${negative ? "-" : ""}` +
    `${abs / 100n}.` +
    `${String(abs % 100n).padStart(2, "0")}`
  );
}

function numericId(
  value: number | null
): number | null {
  return value === null ? null : Number(value);
}

const cellStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

async function ReviewContent({
  searchParams,
}: ReviewProps) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [batches] = await db.execute<Batch[]>(
    `SELECT
       b.id,
       b.status,
       b.description,
       b.financial_year_id,
       b.accounting_period_id,
       b.posted_journal_id,
       DATE_FORMAT(b.opening_date, '%Y-%m-%d')
         AS opening_date,
       fy.status AS fy_status,
       p.status AS period_status,
       DATE_FORMAT(fy.starts_on, '%Y-%m-%d')
         AS fy_start,
       DATE_FORMAT(fy.ends_on, '%Y-%m-%d')
         AS fy_end,
       DATE_FORMAT(p.start_date, '%Y-%m-%d')
         AS period_start,
       DATE_FORMAT(p.end_date, '%Y-%m-%d')
         AS period_end
     FROM acct_opening_balance_batches b
     JOIN acct_financial_years fy
       ON fy.id = b.financial_year_id
      AND fy.legal_business_id = b.legal_business_id
     JOIN acct_accounting_periods p
       ON p.id = b.accounting_period_id
      AND p.legal_business_id = b.legal_business_id
     WHERE b.legal_business_id = ?
     LIMIT 1`,
    [businessId]
  );

  const batch = batches[0] ?? null;

  if (!batch) {
    return (
      <main className={accountingStyles.page}>
        <h1>Opening Balance Review</h1>
        <p>No opening balance worksheet exists yet.</p>
        <Link className="btn-link" href="/accounting/opening-balances">
          Create Opening Balance Draft
        </Link>
      </main>
    );
  }

  const [authorizationRows] =
    await db.execute<RowDataPacket[]>(
      `SELECT
         status,
         approved_by,
         DATE_FORMAT(approved_at, '%Y-%m-%d %H:%i')
           AS approved_at
       FROM acct_opening_balance_authorizations
       WHERE legal_business_id = ?
         AND batch_id = ?
       ORDER BY approved_at DESC
       LIMIT 1`,
      [businessId, batch.id]
    );

  const authorization = authorizationRows[0] ?? null;

  const [lines] = await db.execute<OpeningLine[]>(
    `SELECT
       l.id,
       l.line_no,
       l.account_id,
       l.division_id,
       l.branch_id,
       CAST(l.debit AS CHAR) AS debit,
       CAST(l.credit AS CHAR) AS credit,

       a.account_code,
       a.account_name,
       a.account_type,
       a.account_subtype,
       a.status AS account_status,
       a.is_posting_account,
       a.requires_division,
       a.requires_branch,

       d.id AS division_found,
       br.id AS branch_found,

       f.funding_party_id,
       f.funding_reference,
       f.classification,
       CAST(f.opening_amount AS CHAR)
         AS opening_amount,

       party.id AS funding_party_found,

       (
         SELECT COUNT(*)
         FROM acct_bank_accounts bank
         WHERE bank.legal_business_id =
               l.legal_business_id
           AND bank.gl_account_id = l.account_id
           AND bank.ownership_type = 'BUSINESS'
           AND bank.status = 'ACTIVE'
           AND bank.verification_status = 'VERIFIED'
       ) AS business_bank_count,

       (
         SELECT COUNT(*)
         FROM acct_cash_accounts cash
         WHERE cash.legal_business_id =
               l.legal_business_id
           AND cash.gl_account_id = l.account_id
           AND cash.status = 'ACTIVE'
       ) AS cash_count,

       (
         SELECT cash.division_id
         FROM acct_cash_accounts cash
         WHERE cash.legal_business_id =
               l.legal_business_id
           AND cash.gl_account_id = l.account_id
         LIMIT 1
       ) AS cash_division,

       (
         SELECT cash.branch_id
         FROM acct_cash_accounts cash
         WHERE cash.legal_business_id =
               l.legal_business_id
           AND cash.gl_account_id = l.account_id
         LIMIT 1
       ) AS cash_branch

     FROM acct_opening_balance_lines l
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id
      AND a.legal_business_id = l.legal_business_id

     LEFT JOIN acct_divisions d
       ON d.id = l.division_id
      AND d.legal_business_id = l.legal_business_id

     LEFT JOIN acct_branches br
       ON br.id = l.branch_id
      AND br.division_id = l.division_id
      AND br.legal_business_id = l.legal_business_id

     LEFT JOIN acct_opening_funding_details f
       ON f.opening_line_id = l.id
      AND f.legal_business_id = l.legal_business_id

     LEFT JOIN acct_funding_parties party
       ON party.id = f.funding_party_id
      AND party.legal_business_id = l.legal_business_id

     WHERE l.legal_business_id = ?
       AND l.batch_id = ?
     ORDER BY l.line_no`,
    [businessId, batch.id]
  );

  const [investorBankBalances] =
    await db.execute<InvestorBankOpening[]>(
      `SELECT
         b.id AS bank_account_id,
         b.bank_name,
         b.account_label,
         b.account_number_last4,
         CAST(x.opening_amount AS CHAR) AS opening_amount
       FROM acct_bank_accounts b
       LEFT JOIN acct_opening_investor_bank_balances x
         ON x.legal_business_id = b.legal_business_id
        AND x.bank_account_id = b.id
        AND x.batch_id = ?
       WHERE b.legal_business_id = ?
         AND b.ownership_type = 'INVESTOR'
       ORDER BY b.bank_name, b.account_label, b.id`,
      [batch.id, businessId]
    );

  const [activity] = await db.execute<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS journal_count,
       MIN(DATE_FORMAT(entry_date, '%Y-%m-%d'))
         AS first_date,
       MAX(DATE_FORMAT(entry_date, '%Y-%m-%d'))
         AS last_date
     FROM acct_journal_entries
     WHERE legal_business_id = ?
       AND status = 'POSTED'
       AND entry_date < ?
       AND (
         source_type IS NULL
         OR source_type <> 'OPENING_BALANCE'
       )`,
    [businessId, batch.opening_date]
  );

  const [previousOpening] =
    await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS journal_count
       FROM acct_journal_entries
       WHERE legal_business_id = ?
         AND status = 'POSTED'
         AND source_type = 'OPENING_BALANCE'`,
      [businessId]
    );

  const errors: string[] = [];
  const warnings: string[] = [];

  if (batch.status !== "DRAFT") {
    errors.push("The opening worksheet is not a draft.");
  }

  if (
    batch.fy_status !== "OPEN" ||
    batch.period_status !== "OPEN"
  ) {
    errors.push(
      "Both the financial year and accounting month must be OPEN."
    );
  }

  if (
    batch.opening_date < batch.fy_start ||
    batch.opening_date > batch.fy_end ||
    batch.opening_date < batch.period_start ||
    batch.opening_date > batch.period_end ||
    batch.period_start < batch.fy_start ||
    batch.period_end > batch.fy_end
  ) {
    errors.push(
      "Opening date, financial year and accounting month do not match."
    );
  }

  if (lines.length < 2) {
    errors.push(
      "At least two balanced opening lines are required."
    );
  }

  if (
    investorBankBalances.some(
      (item) => item.opening_amount === null
    )
  ) {
    errors.push(
      "Opening activity balances are required for every investor bank account."
    );
  }

  let totalDebit = 0n;
  let totalCredit = 0n;
  let fundingCount = 0;

  const physicalAccounts = new Set<number>();
  const fundingKeys = new Set<string>();

  for (const line of lines) {
    const dr = paise(line.debit);
    const cr = paise(line.credit);

    totalDebit += dr;
    totalCredit += cr;

    const prefix = `Line ${line.line_no}`;

    if (
      !(
        (dr > 0n && cr === 0n) ||
        (cr > 0n && dr === 0n)
      )
    ) {
      errors.push(`${prefix}: invalid debit/credit amount.`);
    }

    if (
      line.account_status !== "ACTIVE" ||
      Number(line.is_posting_account) !== 1 ||
      !["ASSET", "LIABILITY", "EQUITY"].includes(
        line.account_type
      )
    ) {
      errors.push(`${prefix}: invalid GL account.`);
    }

    if (
      (Number(line.requires_division) === 1 &&
        line.division_id === null) ||
      (Number(line.requires_branch) === 1 &&
        line.branch_id === null)
    ) {
      errors.push(`${prefix}: required scope is missing.`);
    }

    if (
      (line.division_id !== null &&
        line.division_found === null) ||
      (line.branch_id !== null &&
        (line.division_id === null ||
          line.branch_found === null))
    ) {
      errors.push(
        `${prefix}: Division/Branch relationship is invalid.`
      );
    }

    const bankCount = Number(line.business_bank_count);
    const cashCount = Number(line.cash_count);

    const isBank =
      line.account_subtype === "BANK" ||
      bankCount > 0;

    const isCash =
      line.account_subtype === "CASH" ||
      cashCount > 0;

    if (isBank || isCash) {
      if (physicalAccounts.has(Number(line.account_id))) {
        errors.push(
          `${prefix}: duplicate cash/bank account balance.`
        );
      }

      physicalAccounts.add(Number(line.account_id));
    }

    if (isBank) {
      if (bankCount !== 1) {
        errors.push(
          `${prefix}: bank must have exactly one active, verified business mapping.`
        );
      }

      if (line.division_id !== null ||
          line.branch_id !== null) {
        errors.push(
          `${prefix}: bank mapping currently requires Group scope.`
        );
      }
    }

    if (isCash) {
      if (
        cashCount !== 1 ||
        numericId(line.cash_division) !==
          numericId(line.division_id) ||
        numericId(line.cash_branch) !==
          numericId(line.branch_id)
      ) {
        errors.push(
          `${prefix}: cash ledger and registered location differ.`
        );
      }
    }

    if (line.funding_party_id !== null) {
      fundingCount++;

      if (
        line.funding_party_found === null ||
        !line.funding_reference ||
        !line.classification
      ) {
        errors.push(
          `${prefix}: investor identification is incomplete.`
        );
      }

      if (
        cr <= 0n ||
        line.opening_amount === null ||
        paise(line.opening_amount) !== cr
      ) {
        errors.push(
          `${prefix}: funding detail does not equal the credit balance.`
        );
      }

      const expectedType =
        line.classification === "OTHER_EQUITY"
          ? "EQUITY"
          : "LIABILITY";

      if (line.account_type !== expectedType) {
        errors.push(
          `${prefix}: funding classification and ledger type differ.`
        );
      }

      const key = JSON.stringify([
        line.funding_party_id,
        line.funding_reference?.toUpperCase(),
        line.division_id,
        line.branch_id,
      ]);

      if (fundingKeys.has(key)) {
        errors.push(
          `${prefix}: duplicate funding relationship.`
        );
      }

      fundingKeys.add(key);
    } else if (
      line.account_subtype
        .toUpperCase()
        .includes("INVESTOR")
    ) {
      errors.push(
        `${prefix}: investor funding attribution is missing.`
      );
    }
  }

  if (totalDebit === 0n ||
      totalDebit !== totalCredit) {
    errors.push(
      "Opening debits and credits must balance exactly."
    );
  }

  if (Number(activity[0]?.journal_count ?? 0) > 0) {
    errors.push(
      "Existing posted journal activity before the opening date requires reconciliation."
    );
  }

  if (
    Number(previousOpening[0]?.journal_count ?? 0) > 0
  ) {
    errors.push(
      "A posted opening-balance journal already exists."
    );
  }

  if (fundingCount > 0) {
    warnings.push(
      "Investor funding references must be matched to signed funding agreements and supporting transactions."
    );
  }

  warnings.push(
    "Bank statements, physical cash counts, stock valuation and supplier balances require supporting review."
  );

  const structurallyReady = errors.length === 0;

  return (
    <main className={accountingStyles.page}>
      <h1>Opening Balances: Check, Authorise and Post</h1>
      <OpeningSteps current={2} />

      {query.authorization && (
        <p role="status">
          {({
            authorized:
              "Opening balances authorized for final validation.",
            invalid:
              "Complete all confirmations and reconciliation notes.",
            "not-found":
              "Opening balance worksheet not found.",
            "already-posted":
              "The opening balance is already posted.",
            "investor-bank-opening-required":
              "Enter an opening activity balance for every investor bank account.",
            "period-invalid":
              "Financial year, month or opening date is invalid.",
            unbalanced:
              "Opening debits and credits do not balance.",
            "existing-activity":
              "Earlier posted journal activity must be reconciled first.",
            failed:
              "Authorization failed. Review the server logs.",
          } as Record<string, string>)[query.authorization] ??
            "Unable to process authorization."}
        </p>
      )}

      {query.posting && (
        <p role="status">
          {({
            posted:
              "Opening balances posted successfully.",
            invalid:
              "Confirm posting before submitting.",
            "not-found":
              "Opening balance worksheet not found.",
            "already-posted":
              "The initial opening balances are already posted.",
            "period-invalid":
              "Financial year or accounting month is not open.",
            "authorization-required":
              "Approve the current worksheet before posting.",
            "investor-bank-opening-required":
              "Enter an opening activity balance for every investor bank account.",
            "approval-stale":
              "Worksheet changed after approval. Reauthorize it.",
            "existing-activity":
              "Existing posted transactions require cutover reconciliation.",
            "invalid-lines":
              "Opening balance accounts or debit/credit amounts are invalid.",
            "invalid-scope":
              "Division/Branch relationships are invalid.",
            "funding-mismatch":
              "Investor funding amounts do not agree with verified records.",
            "agreement-mismatch":
              "Investor, agreement, opening date or scope does not match.",
            "agreement-version-invalid":
              "Exactly one approved agreement version must apply at the opening date.",
            "funding-policy-invalid":
              "The applicable funding policy has not been confirmed.",
            "funding-principal-mismatch":
              "Opening funding balance does not match verified outstanding principal.",
            "missing-opening-funding":
              "An agreement has outstanding principal missing from the opening worksheet.",
            "funding-gl-overlap":
              "A historical funding transaction already has a posted GL journal. Cutover reconciliation is required.",
            "funding-transaction-invalid":
              "One or more historical funding transactions require reconciliation.",
            "profit-linked-requires-review":
              "Profit-linked funding requires contractual accounting classification before posting.",
            "sequence-exhausted":
              "Journal numbering capacity was reached.",
            "number-conflict":
              "Journal numbering conflicts with existing records.",
            "posting-conflict":
              "The opening journal could not be finalized.",
            failed:
              "Posting failed. Review the server logs.",
          } as Record<string, string>)[query.posting] ??
            "Unable to process opening balance posting."}
        </p>
      )}

      <p>
        Review the accounting position before
        authorizing the initial General Ledger journal.
      </p>

      <section style={{
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: 20,
        marginTop: 20,
      }}>
        <h2>Opening Position Summary</h2>

        <p>Opening date: <strong>{batch.opening_date}</strong></p>
        <p>Worksheet status: <strong>{batch.status}</strong></p>
        <p>Financial year status: {batch.fy_status}</p>
        <p>Accounting month status: {batch.period_status}</p>

        <div style={{
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
        }}>
          <div>
            <strong>Total Debit</strong>
            <p>₹{formatMoney(totalDebit)}</p>
          </div>
          <div>
            <strong>Total Credit</strong>
            <p>₹{formatMoney(totalCredit)}</p>
          </div>
          <div>
            <strong>Difference</strong>
            <p>
              ₹{formatMoney(totalDebit - totalCredit)}
            </p>
          </div>
        </div>

        <p>
          <strong>
            {structurallyReady
              ? "Structure validated — evidence review pending"
              : "Posting blocked — issues require resolution"}
          </strong>
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Validation Results</h2>

        {errors.length > 0 ? (
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        ) : (
          <p>
            No structural validation issues detected
            from the stored worksheet.
          </p>
        )}

        <h3>Items requiring reconciliation</h3>

        <ul>
          {warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>

        <p>
          Posted journal activity through cutover:{" "}
          <strong>
            {Number(activity[0]?.journal_count ?? 0)}
          </strong>
        </p>

        {activity[0]?.first_date && (
          <p>
            Activity range: {activity[0].first_date}
            {" to "}
            {activity[0].last_date}
          </p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Investor Bank Activity Opening Positions</h2>
        <p>
          These amounts represent only Group-related activity in each
          investor bank account, not personal account statement balances.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                <th style={cellStyle}>Investor Bank Account</th>
                <th style={cellStyle}>Opening Activity Balance</th>
              </tr>
            </thead>
            <tbody>
              {investorBankBalances.map((item) => (
                <tr key={item.bank_account_id}>
                  <td style={cellStyle}>
                    {item.bank_name} — {item.account_label}
                    {" ••••"}{item.account_number_last4}
                  </td>
                  <td style={cellStyle}>
                    {item.opening_amount === null
                      ? "Missing"
                      : `₹${item.opening_amount}`}
                  </td>
                </tr>
              ))}
              {investorBankBalances.length === 0 && (
                <tr>
                  <td style={cellStyle} colSpan={2}>
                    No investor bank accounts are registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Account-wise Review</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "#",
                  "GL Account",
                  "Division",
                  "Branch",
                  "Investor Reference",
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
                <tr key={line.id}>
                  <td style={cellStyle}>
                    {line.line_no}
                  </td>

                  <td style={cellStyle}>
                    {line.account_code}
                    {" — "}
                    {line.account_name}
                  </td>

                  <td style={cellStyle}>
                    {line.division_id ?? "Group"}
                  </td>

                  <td style={cellStyle}>
                    {line.branch_id ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {line.funding_reference ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    ₹{line.debit}
                  </td>

                  <td style={cellStyle}>
                    ₹{line.credit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 20,
          marginTop: 24,
        }}
      >
        <h2 id="authorization">Opening Balance Authorization</h2>

        <p>
          Confirm each reconciliation only after reviewing
          the corresponding supporting records.
        </p>

        {errors.length > 0 && (
          <p role="alert">
            Resolve the validation errors above before
            authorizing the opening balances.
          </p>
        )}

        <form
          action={authorizeOpeningBalancesAction}
          style={{
            display: "grid",
            gap: 16,
            maxWidth: 760,
          }}
        >
          {[
            [
              "cash_count_confirmed",
              "Physical cash amounts agree with the cash count",
            ],
            [
              "bank_statements_confirmed",
              "All business bank balances agree with statements",
            ],
            [
              "inventory_valuation_confirmed",
              "Inventory has been verified at its opening cost value",
            ],
            [
              "liabilities_confirmed",
              "Supplier, other liability and capital balances are reconciled",
            ],
            [
              "funding_reconciliation_confirmed",
              "Investor funding amounts agree with supporting agreements and records",
            ],
            [
              "cutover_reconciliation_confirmed",
              "The cutover has been checked for missing or duplicate transactions",
            ],
          ].map(([name, label]) => (
            <label key={name}>
              <input
                type="checkbox"
                name={name}
                value="yes"
                required
              />
              {" "}{label}
            </label>
          ))}

          <label style={{ display: "grid", gap: 6 }}>
            Reconciliation Notes
            <textarea
              name="reconciliation_notes"
              minLength={20}
              maxLength={10000}
              required
              rows={5}
              placeholder={
                "Describe the records reviewed, statement dates, " +
                "cash count, inventory valuation and funding reconciliation."
              }
              style={{
                padding: 10,
                border: "1px solid #cbd5e1",
                borderRadius: 6,
              }}
            />
          </label>

          <label>
            <input
              type="checkbox"
              name="confirm"
              value="AUTHORIZE"
              required
            />
            {" "}I authorize the reviewed opening position
            for further posting validation.
          </label>

          <button
            type="submit"
            disabled={!structurallyReady}
            style={{
              padding: "12px 20px",
              justifySelf: "start",
            }}
          >
            Authorize Opening Balances
          </button>
        </form>

        <p>
          Authorization alone does not create a journal.
          Posting performs additional server-side validation
          before creating the opening journal.
        </p>
      </section>

      <section
        style={{
          marginTop: 24,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 20,
        }}
      >
        <h2 id="post">Step 3: Post Opening Balances</h2>

        <p>
          Authorization status:{" "}
          <strong>
            {authorization?.status ?? "NOT AUTHORIZED"}
          </strong>
        </p>

        {authorization?.approved_at && (
          <p>
            Authorized on: {authorization.approved_at}
          </p>
        )}

        <p>
          Posting creates a permanent opening journal,
          locks the worksheet and establishes the starting
          balances used by the General Ledger.
        </p>

        {batch.status === "POSTED" ? (
          <p>
            Opening balances are already posted.
            {batch.posted_journal_id && (
              <>
                {" "}
                <Link
                  href={
                    `/accounting/journals/${batch.posted_journal_id}`
                  }
                >
                  View Posted Journal
                </Link>
              </>
            )}
          </p>
        ) : (
          <form
            action={postOpeningBalancesAction}
            style={{ display: "grid", gap: 14 }}
          >
            <label>
              <input
                type="checkbox"
                name="confirm"
                value="POST_OPENING"
                required
              />
              {" "}
              I confirm that these opening balances
              have been reviewed and should be posted
              to the General Ledger.
            </label>

            <button
              type="submit"
              disabled={
                !structurallyReady ||
                authorization?.status !== "APPROVED"
              }
              style={{
                padding: "12px 20px",
                justifySelf: "start",
              }}
            >
              Post Opening Balances
            </button>
          </form>
        )}

        <p>
          The server revalidates the worksheet, authorization,
          bank/cash mapping and investor funding balances
          before committing. A displayed approval does not
          bypass those checks.
        </p>
      </section>
    </main>
  );
}

export default function OpeningBalanceReviewPage(
  props: ReviewProps
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Opening Balance Review</h1>
          <p>Loading review…</p>
        </main>
      }
    >
      <ReviewContent {...props} />
    </Suspense>
  );
}
