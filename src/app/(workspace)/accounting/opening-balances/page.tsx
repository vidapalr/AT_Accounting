
import { Suspense } from "react";
import Link from "next/link";
import OpeningSteps from "@/components/OpeningSteps";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../accounting.module.css";
import {
  saveOpeningBalancesAction,
} from "@/lib/opening-balance-actions";
import { OPENING_ROW_COUNT } from "@/lib/opening-balance-constants";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

interface Account extends RowDataPacket {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype: string;
}

interface Bank extends RowDataPacket {
  gl_account_id: number;
  bank_name: string;
  account_label: string;
  account_number_last4: string;
}

interface InvestorBank extends RowDataPacket {
  id: number;
  bank_name: string;
  account_label: string;
  account_number_last4: string;
}

interface Cash extends RowDataPacket {
  gl_account_id: number;
  cash_name: string;
  division_id: number | null;
  branch_id: number | null;
}

interface Division extends RowDataPacket {
  id: number;
  code: string;
  name: string;
}

interface Branch extends RowDataPacket {
  id: number;
  division_id: number;
  branch_code: string;
  branch_name: string;
}

interface Investor extends RowDataPacket {
  id: number;
  full_name: string;
}

interface FundingAgreement extends RowDataPacket {
  id: number;
  party_id: number;
  agreement_no: string;
  funding_type: string;
  division_id: number | null;
  branch_id: number | null;
}

interface SavedLine extends RowDataPacket {
  account_id: number;
  division_id: number | null;
  branch_id: number | null;
  debit: string;
  credit: string;
  notes: string | null;
  agreement_id: number | null;
  funding_party_id: number | null;
  funding_reference: string | null;
  classification: string | null;
}

interface Batch extends RowDataPacket {
  id: number;
  opening_date: string;
  description: string;
  status: string;
  fiscal_year: string;
  period_name: string;
}

interface InvestorBankOpening extends RowDataPacket {
  bank_account_id: number;
  opening_amount: string;
}

const messages: Record<string, string> = {
  saved: "Opening balance draft saved successfully.",
  invalid: "Please correct the opening balance entries.",
  "amount-too-large": "Amount exceeds the supported limit.",
  "already-posted": "Opening balances are already posted.",
  "period-mismatch":
    "The date does not match exactly one financial year and accounting month.",
  "invalid-account":
    "An account, investor, amount or Division/Branch mapping is invalid.",
  "not-found": "Legal business not found.",
  failed: "Unable to save the opening balance draft.",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 8,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const cellStyle: React.CSSProperties = {
  padding: 9,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

function Paise(value: string): bigint {
  const [whole, decimal = ""] = value.split(".");
  return (
    BigInt(whole) * 100n +
    BigInt(decimal.padEnd(2, "0"))
  );
}

function formatPaise(value: bigint): string {
  const negative = value < 0n;
  const n = negative ? -value : value;

  return (
    `${negative ? "-" : ""}${n / 100n}.` +
    String(n % 100n).padStart(2, "0")
  );
}

function amountInput(
  name: string,
  defaultValue: string | undefined
) {
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      defaultValue={
        defaultValue === "0.00"
          ? ""
          : defaultValue ?? ""
      }
      style={{ ...inputStyle, minWidth: 110 }}
    />
  );
}

function hiddenScope(
  prefix: string,
  accountId: number,
  divisionId: number | null,
  branchId: number | null
) {
  return (
    <>
      <input
        type="hidden"
        name={`${prefix}account`}
        value={accountId}
      />
      <input
        type="hidden"
        name={`${prefix}division`}
        value={divisionId ?? ""}
      />
      <input
        type="hidden"
        name={`${prefix}branch`}
        value={branchId ?? ""}
      />
    </>
  );
}

function fixedLine(
  index: number,
  label: string,
  accountId: number,
  divisionId: number | null,
  branchId: number | null,
  saved?: SavedLine
) {
  const p = `line_${index}_`;

  return (
    <tr key={`fixed-${index}`}>
      <td style={cellStyle}>{label}</td>
      <td style={cellStyle}>
        {hiddenScope(p, accountId, divisionId, branchId)}
        Fixed registered account
      </td>
      <td style={cellStyle}>
        {amountInput(p + "debit", saved?.debit)}
      </td>
      <td style={cellStyle}>
        {amountInput(p + "credit", saved?.credit)}
      </td>
      <td style={cellStyle}>
        <input
          name={p + "notes"}
          defaultValue={saved?.notes ?? ""}
          maxLength={500}
          style={inputStyle}
          placeholder="Opening statement / cash count"
        />
      </td>
    </tr>
  );
}

function generalLine(
  index: number,
  accounts: Account[],
  divisions: Division[],
  branches: Branch[],
  investors: Investor[],
  fundingAgreements: FundingAgreement[],
  saved?: SavedLine
) {
  const p = `line_${index}_`;

  return (
    <tr key={`general-${index}`}>
      <td style={cellStyle}>
        <select
          name={p + "account"}
          defaultValue={saved?.account_id ?? ""}
          style={{ ...inputStyle, minWidth: 220 }}
        >
          <option value="">Select GL Account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.account_code} — {a.account_name}
            </option>
          ))}
        </select>
      </td>

      <td style={cellStyle}>
        <select
          name={p + "division"}
          defaultValue={saved?.division_id ?? ""}
          style={{ ...inputStyle, minWidth: 135 }}
        >
          <option value="">Group Level</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>

        <select
          name={p + "branch"}
          defaultValue={saved?.branch_id ?? ""}
          style={{
            ...inputStyle,
            minWidth: 135,
            marginTop: 6,
          }}
        >
          <option value="">No Branch</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.branch_code} — {b.branch_name}
            </option>
          ))}
        </select>
      </td>

      <td style={cellStyle}>
        {amountInput(p + "debit", saved?.debit)}
      </td>

      <td style={cellStyle}>
        {amountInput(p + "credit", saved?.credit)}
      </td>

      <td style={cellStyle}>
        <select
          name={p + "funding_party"}
          defaultValue={saved?.funding_party_id ?? ""}
          style={{ ...inputStyle, minWidth: 165 }}
        >
          <option value="">Not investor funding</option>
          {investors.map((investor) => (
            <option key={investor.id} value={investor.id}>
              {investor.full_name}
            </option>
          ))}
        </select>

        <select
          name={p + "funding_agreement"}
          defaultValue={saved?.agreement_id ?? ""}
          style={{ ...inputStyle, marginTop: 6 }}
        >
          <option value="">Select Funding Agreement</option>

          {fundingAgreements.map((agreement) => (
            <option
              key={agreement.id}
              value={agreement.id}
            >
              {agreement.agreement_no}
              {" — "}
              {agreement.funding_type}
            </option>
          ))}
        </select>

        <input
          name={p + "funding_reference"}
          defaultValue={saved?.funding_reference ?? ""}
          placeholder="Funding reference / description"
          maxLength={100}
          style={{ ...inputStyle, marginTop: 6 }}
        />

        <select
          name={p + "funding_classification"}
          defaultValue={saved?.classification ?? ""}
          style={{ ...inputStyle, marginTop: 6 }}
        >
          <option value="">No funding classification</option>
          <option value="REPAYABLE_LIABILITY">
            Repayable Liability
          </option>
          <option value="OTHER_OBLIGATION">
            Other Obligation
          </option>
          <option value="OTHER_EQUITY">
            Other Equity — only if legally appropriate
          </option>
        </select>

        <input
          name={p + "notes"}
          defaultValue={saved?.notes ?? ""}
          placeholder="Notes"
          maxLength={500}
          style={{ ...inputStyle, marginTop: 6 }}
        />
      </td>
    </tr>
  );
}

async function OpeningBalancesContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const [
    [accounts],
    [banks],
    [investorBanks],
    [cashAccounts],
    [divisions],
    [branches],
    [investors],
    [fundingAgreements],
    [batches],
  ] = await Promise.all([
    db.execute<Account[]>(
      `SELECT id, account_code, account_name,
              account_type, account_subtype
       FROM acct_chart_of_accounts
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
         AND is_posting_account = 1
         AND account_type IN (
           'ASSET', 'LIABILITY', 'EQUITY'
         )
       ORDER BY account_code`,
      [businessId]
    ),

    db.execute<Bank[]>(
      `SELECT gl_account_id, bank_name,
              account_label, account_number_last4
       FROM acct_bank_accounts
       WHERE legal_business_id = ?
         AND ownership_type = 'BUSINESS'
         AND status = 'ACTIVE'
         AND verification_status = 'VERIFIED'
         AND gl_account_id IS NOT NULL
       ORDER BY bank_name, account_label`,
      [businessId]
    ),

    db.execute<InvestorBank[]>(
      `SELECT
         id,
         bank_name,
         account_label,
         account_number_last4
       FROM acct_bank_accounts
       WHERE legal_business_id = ?
         AND ownership_type = 'INVESTOR'
       ORDER BY bank_name, account_label, id`,
      [businessId]
    ),

    db.execute<Cash[]>(
      `SELECT gl_account_id, cash_name,
              division_id, branch_id
       FROM acct_cash_accounts
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
       ORDER BY cash_code`,
      [businessId]
    ),

    db.execute<Division[]>(
      `SELECT id, code, name
       FROM acct_divisions
       WHERE legal_business_id = ?
       ORDER BY name`,
      [businessId]
    ),

    db.execute<Branch[]>(
      `SELECT id, division_id,
              branch_code, branch_name
       FROM acct_branches
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
       ORDER BY division_id, branch_name`,
      [businessId]
    ),

    db.execute<Investor[]>(
      `SELECT id, full_name
       FROM acct_funding_parties
       WHERE legal_business_id = ?
       ORDER BY full_name`,
      [businessId]
    ),

    db.execute<FundingAgreement[]>(
      `SELECT
         id,
         party_id,
         agreement_no,
         funding_type,
         division_id,
         branch_id
       FROM acct_funding_agreements
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
       ORDER BY agreement_no`,
      [businessId]
    ),

    db.execute<Batch[]>(
      `SELECT
         ob.id,
         DATE_FORMAT(ob.opening_date,'%Y-%m-%d')
           AS opening_date,
         ob.description,
         ob.status,
         fy.label AS fiscal_year,
         p.period_name
       FROM acct_opening_balance_batches ob
       JOIN acct_financial_years fy
         ON fy.id = ob.financial_year_id
        AND fy.legal_business_id = ob.legal_business_id
       JOIN acct_accounting_periods p
         ON p.id = ob.accounting_period_id
        AND p.legal_business_id = ob.legal_business_id
       WHERE ob.legal_business_id = ?
       LIMIT 1`,
      [businessId]
    ),
  ]);

  const batch = batches[0] ?? null;

  const [savedLines] = batch
    ? await db.execute<SavedLine[]>(
        `SELECT
           l.account_id,
           l.division_id,
           l.branch_id,
           CAST(l.debit AS CHAR) AS debit,
           CAST(l.credit AS CHAR) AS credit,
           l.notes,
           f.agreement_id,
           f.funding_party_id,
           f.funding_reference,
           f.classification
         FROM acct_opening_balance_lines l
         LEFT JOIN acct_opening_funding_details f
           ON f.opening_line_id = l.id
          AND f.legal_business_id = l.legal_business_id
         WHERE l.legal_business_id = ?
           AND l.batch_id = ?
         ORDER BY l.line_no`,
        [businessId, batch.id]
      )
    : [[] as SavedLine[]];

  const [savedInvestorBankBalances] = batch
    ? await db.execute<InvestorBankOpening[]>(
        `SELECT bank_account_id, CAST(opening_amount AS CHAR)
                  AS opening_amount
         FROM acct_opening_investor_bank_balances
         WHERE legal_business_id = ?
           AND batch_id = ?
         ORDER BY bank_account_id`,
        [businessId, batch.id]
      )
    : [[] as InvestorBankOpening[]];

  const investorOpeningByAccount = new Map(
    savedInvestorBankBalances.map((item) => [
      Number(item.bank_account_id),
      item.opening_amount,
    ])
  );

  const byAccount = new Map(
    savedLines.map((line) => [
      Number(line.account_id),
      line,
    ])
  );

  const physicalIds = new Set([
    ...banks.map((b) => Number(b.gl_account_id)),
    ...cashAccounts.map((c) => Number(c.gl_account_id)),
  ]);

  const otherAccounts = accounts.filter(
    (a) =>
      !physicalIds.has(Number(a.id)) &&
      !["BANK", "CASH"].includes(a.account_subtype)
  );

  const generalSaved = savedLines.filter(
    (line) => !physicalIds.has(Number(line.account_id))
  );

  const debitTotal = savedLines.reduce(
    (sum, line) => sum + Paise(line.debit),
    0n
  );

  const creditTotal = savedLines.reduce(
    (sum, line) => sum + Paise(line.credit),
    0n
  );

  const difference = debitTotal - creditTotal;

  const fixedCount = banks.length + cashAccounts.length;
  const availableGeneralRows = Math.max(
    0,
    OPENING_ROW_COUNT - fixedCount
  );

  const canEdit = !batch || batch.status === "DRAFT";

  const tooManyAccounts =
    fixedCount > OPENING_ROW_COUNT ||
    generalSaved.length > availableGeneralRows;

  return (
    <main className={accountingStyles.page}>
      <h1>Opening Balances</h1>
      <OpeningSteps current={1} />

      <p>
        Enter the opening position for Abhiram Group,
        including registered business banks, cash
        locations, investor-bank Group activity, funding
        and other ledgers.
      </p>

      <nav style={{
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <Link href="/accounting/bank-accounts">
          Business Bank Accounts
        </Link>
        <Link href="/accounting/cash-accounts">
          Cash Accounts
        </Link>
        <Link href="/accounting/investor-bank-scopes">
          Investor Bank Scopes
        </Link>
      </nav>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process the request."}
        </p>
      )}

      <section
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 20,
          marginTop: 24,
        }}
      >
        <h2>Opening Position</h2>

        <p>
          Status: <strong>
            {batch?.status ?? "NOT CREATED"}
          </strong>
        </p>

        {batch && (
          <p>
            FY: {batch.fiscal_year}
            {" | "}
            Period: {batch.period_name}
          </p>
        )}

        <div style={{
          display: "flex",
          gap: 30,
          flexWrap: "wrap",
          marginBottom: 20,
        }}>
          <div>
            <strong>Debits</strong>
            <p>₹{formatPaise(debitTotal)}</p>
          </div>
          <div>
            <strong>Credits</strong>
            <p>₹{formatPaise(creditTotal)}</p>
          </div>
          <div>
            <strong>Difference</strong>
            <p>₹{formatPaise(difference)}</p>
          </div>
        </div>

        {difference !== 0n && (
          <p role="status">
            The draft is not yet balanced.
            Posting will require a zero difference.
          </p>
        )}

        {tooManyAccounts && (
          <p role="alert">
            The worksheet has more accounts than the
            current {OPENING_ROW_COUNT}-row capacity.
            Do not save until the row capacity is increased.
          </p>
        )}

        {canEdit ? (
          <form
            action={saveOpeningBalancesAction}
            style={{ display: "grid", gap: 22 }}
          >
            <div style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 16,
            }}>
              <label>
                Opening Date
                <input
                  type="date"
                  name="opening_date"
                  defaultValue={
                    batch?.opening_date ?? ""
                  }
                  required
                  style={inputStyle}
                />
              </label>

              <label>
                Description
                <input
                  name="description"
                  defaultValue={
                    batch?.description ??
                    "Initial business opening balances"
                  }
                  minLength={10}
                  maxLength={500}
                  required
                  style={inputStyle}
                />
              </label>
            </div>

            <section>
              <h3>A. Registered Business Bank Accounts</h3>

              <p>
                Positive bank balances are normally
                entered as Debit. Enter only balances
                belonging to Abhiram Group.
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}>
                  <thead>
                    <tr>
                      {[
                        "Bank Account",
                        "Scope",
                        "Debit ₹",
                        "Credit ₹",
                        "Notes",
                      ].map((h) => (
                        <th key={h} style={cellStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((bank, index) =>
                      fixedLine(
                        index,
                        `${bank.bank_name} — ${bank.account_label} (••••${bank.account_number_last4})`,
                        Number(bank.gl_account_id),
                        null,
                        null,
                        byAccount.get(Number(bank.gl_account_id))
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {banks.length === 0 && (
                <p>
                  No verified business bank accounts
                  with GL mappings were found.
                </p>
              )}
            </section>

            <section>
              <h3>B. Physical Cash Accounts</h3>

              <p>
                Cash locations are automatically assigned
                to their registered Division and Branch.
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}>
                  <thead>
                    <tr>
                      {[
                        "Cash Account",
                        "Scope",
                        "Debit ₹",
                        "Credit ₹",
                        "Notes",
                      ].map((h) => (
                        <th key={h} style={cellStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cashAccounts.map((cash, index) => {
                      const division = divisions.find(
                        (d) =>
                          Number(d.id) ===
                          Number(cash.division_id)
                      );

                      const branch = branches.find(
                        (b) =>
                          Number(b.id) ===
                          Number(cash.branch_id)
                      );

                      const label =
                        `${cash.cash_name} — ` +
                        (division?.name ?? "Group") +
                        (branch ? ` / ${branch.branch_name}` : "");

                      return fixedLine(
                        banks.length + index,
                        label,
                        Number(cash.gl_account_id),
                        cash.division_id === null
                          ? null : Number(cash.division_id),
                        cash.branch_id === null
                          ? null : Number(cash.branch_id),
                        byAccount.get(Number(cash.gl_account_id))
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3>Investor Bank Activity Opening Positions</h3>
              <p>
                Enter the amount related to Group business activity
                in each investor bank account as of the opening date.
                This is not the investor’s personal account balance.
                Enter 0.00 when there was no Group-related opening
                activity.
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}>
                  <thead>
                    <tr>
                      <th style={cellStyle}>Investor Bank Account</th>
                      <th style={cellStyle}>Opening Activity Balance ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investorBanks.map((bank) => (
                      <tr key={bank.id}>
                        <td style={cellStyle}>
                          {bank.bank_name} — {bank.account_label}
                          {" ••••"}{bank.account_number_last4}
                        </td>
                        <td style={cellStyle}>
                          <input
                            name={`investor_bank_${bank.id}`}
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00 or -0.00"
                            defaultValue={
                              investorOpeningByAccount.get(Number(bank.id)) ?? ""
                            }
                            required
                            style={{ ...inputStyle, minWidth: 150 }}
                          />
                        </td>
                      </tr>
                    ))}
                    {investorBanks.length === 0 && (
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

            <section>
              <h3>
                D. Investor Funding and Other Opening Balances
              </h3>

              <p>
                For investor funding, select the relevant
                liability or equity ledger, the investor,
                funding reference, classification and scope.
                For ordinary stock, supplier, receivable
                and capital balances, leave the investor
                fields empty.
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}>
                  <thead>
                    <tr>
                      {[
                        "GL Account",
                        "Division / Branch",
                        "Debit ₹",
                        "Credit ₹",
                        "Investor / Reference / Notes",
                      ].map((h) => (
                        <th key={h} style={cellStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      { length: availableGeneralRows },
                      (_, index) =>
                        generalLine(
                          fixedCount + index,
                          otherAccounts,
                          divisions,
                          branches,
                          investors,
                          fundingAgreements,
                          generalSaved[index]
                        )
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <button
              type="submit"
              disabled={tooManyAccounts}
              style={{
                padding: "12px 20px",
                justifySelf: "start",
              }}
            >
              Save Opening Balance Draft
            </button>
          </form>
        ) : (
          <p>
            These opening balances have been posted
            and are no longer editable.
          </p>
        )}
      </section>
    </main>
  );
}

export default function OpeningBalancesPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Opening Balances</h1>
          <p>Loading opening balances…</p>
        </main>
      }
    >
      <OpeningBalancesContent {...props} />
    </Suspense>
  );
}
