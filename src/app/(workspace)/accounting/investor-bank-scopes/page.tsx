
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../accounting.module.css";
import {
  createInvestorBankScopeAction,
} from "@/lib/investor-bank-scope-actions";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

interface Investor extends RowDataPacket {
  id: number;
  full_name: string;
}

interface InvestorBank extends RowDataPacket {
  id: number;
  funding_party_id: number;
  account_label: string;
  bank_name: string;
  account_number_last4: string | null;
  verification_status: string;
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

interface ScopeMapping extends RowDataPacket {
  id: number;
  full_name: string;
  account_label: string;
  bank_name: string;
  account_number_last4: string | null;
  division_name: string | null;
  branch_name: string | null;
  purpose: string;
  status: string;
}

const messages: Record<string, string> = {
  created: "Investor bank scope mapping created.",
  invalid: "Review the submitted values.",
  "business-not-found": "Legal business not found.",
  "invalid-investor": "Selected investor is invalid.",
  "invalid-bank":
    "Selected bank does not belong to that investor.",
  "invalid-dimension":
    "Selected Division or Branch is invalid.",
  duplicate:
    "This bank is already mapped to the selected scope.",
  failed: "Unable to save the mapping.",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const cellStyle: React.CSSProperties = {
  padding: 12,
  textAlign: "left",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
};

function purposeLabel(value: string): string {
  const labels: Record<string, string> = {
    FUNDING_RECEIPT: "Funding Receipt",
    REPAYMENT: "Repayment",
    PROFIT_PAYOUT: "Profit Payout",
    ALL: "All Transactions",
  };

  return labels[value] ?? value;
}

function scopeLabel(
  division: string | null,
  branch: string | null
): string {
  if (!division) return "Group";
  if (!branch) return `${division} — Division`;
  return `${division} / ${branch}`;
}

async function InvestorBankScopesContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [
    [investors],
    [banks],
    [divisions],
    [branches],
    [mappings],
  ] = await Promise.all([
    db.execute<Investor[]>(
      `SELECT
         id,
         full_name
       FROM acct_funding_parties
       WHERE legal_business_id = ?
       ORDER BY full_name`,
      [businessId]
    ),

    db.execute<InvestorBank[]>(
      `SELECT
         id,
         funding_party_id,
         account_label,
         bank_name,
         account_number_last4,
         verification_status
       FROM acct_bank_accounts
       WHERE legal_business_id = ?
         AND ownership_type = 'INVESTOR'
         AND status = 'ACTIVE'
       ORDER BY bank_name, account_label`,
      [businessId]
    ),

    db.execute<Division[]>(
      `SELECT
         id,
         code,
         name
       FROM acct_divisions
       WHERE legal_business_id = ?
       ORDER BY name`,
      [businessId]
    ),

    db.execute<Branch[]>(
      `SELECT
         id,
         division_id,
         branch_code,
         branch_name
       FROM acct_branches
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
       ORDER BY division_id, branch_name`,
      [businessId]
    ),

    db.execute<ScopeMapping[]>(
      `SELECT
         s.id,
         p.full_name,
         b.account_label,
         b.bank_name,
         b.account_number_last4,
         d.name AS division_name,
         br.branch_name,
         s.purpose,
         s.status
       FROM acct_investor_bank_scopes s
       JOIN acct_funding_parties p
         ON p.id = s.funding_party_id
        AND p.legal_business_id = s.legal_business_id
       JOIN acct_bank_accounts b
         ON b.id = s.bank_account_id
        AND b.legal_business_id = s.legal_business_id
        AND b.funding_party_id = s.funding_party_id
        AND b.ownership_type = 'INVESTOR'
       LEFT JOIN acct_divisions d
         ON d.id = s.division_id
        AND d.legal_business_id = s.legal_business_id
       LEFT JOIN acct_branches br
         ON br.id = s.branch_id
        AND br.division_id = s.division_id
        AND br.legal_business_id = s.legal_business_id
       WHERE s.legal_business_id = ?
       ORDER BY p.full_name, b.bank_name, s.id`,
      [businessId]
    ),
  ]);

  return (
    <main className={accountingStyles.page}>
      <h1>Investor Bank Scope Mapping</h1>

      <p>
        Link investor-owned bank accounts with the
        appropriate Group, Division or Branch.
        Investor personal balances are not included
        in the business General Ledger.
      </p>

      <Link className="btn-link" href="/accounting/bank-accounts">
        ← Bank Account Management
      </Link>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process the request."}
        </p>
      )}

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
        }}
      >
        <h2>Create Investor Bank Mapping</h2>

        <p>
          Register investor bank accounts in Bank
          Account Management before creating a mapping.
        </p>

        <form
          action={createInvestorBankScopeAction}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 16,
          }}
        >
          <label style={labelStyle}>
            Investor
            <select
              name="funding_party_id"
              required
              defaultValue=""
              style={inputStyle}
            >
              <option value="" disabled>
                Select Investor
              </option>

              {investors.map((investor) => (
                <option
                  key={investor.id}
                  value={investor.id}
                >
                  {investor.full_name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Investor Bank Account
            <select
              name="bank_account_id"
              required
              defaultValue=""
              style={inputStyle}
            >
              <option value="" disabled>
                Select Registered Bank
              </option>

              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.bank_name}
                  {" — "}
                  {bank.account_label}
                  {" (••••"}
                  {bank.account_number_last4 ?? "—"}
                  {")"}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Division
            <select
              name="division_id"
              defaultValue=""
              style={inputStyle}
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
          </label>

          <label style={labelStyle}>
            Branch
            <select
              name="branch_id"
              defaultValue=""
              style={inputStyle}
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
          </label>

          <label style={labelStyle}>
            Transaction Purpose
            <select
              name="purpose"
              defaultValue="ALL"
              required
              style={inputStyle}
            >
              <option value="ALL">
                All Transactions
              </option>
              <option value="FUNDING_RECEIPT">
                Funding Receipt
              </option>
              <option value="REPAYMENT">
                Repayment
              </option>
              <option value="PROFIT_PAYOUT">
                Profit Payout
              </option>
            </select>
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "end",
            }}
          >
            <button
              type="submit"
              style={{ padding: "12px 20px" }}
            >
              Save Mapping
            </button>
          </div>
        </form>

        <p style={{ marginTop: 16 }}>
          For Group scope, leave Division and Branch
          blank. For Division scope, choose Division
          only. For Branch scope, choose both.
        </p>
      </section>

      <section
        style={{
          marginTop: 24,
          padding: 20,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
        }}
      >
        <h2>Investor Bank Mappings</h2>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                {[
                  "Investor",
                  "Bank Account",
                  "Scope",
                  "Purpose",
                  "Status",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td style={cellStyle}>
                    {mapping.full_name}
                  </td>

                  <td style={cellStyle}>
                    {mapping.bank_name}
                    {" — "}
                    {mapping.account_label}
                    {" (••••"}
                    {mapping.account_number_last4 ?? "—"}
                    {")"}
                  </td>

                  <td style={cellStyle}>
                    {scopeLabel(
                      mapping.division_name,
                      mapping.branch_name
                    )}
                  </td>

                  <td style={cellStyle}>
                    {purposeLabel(mapping.purpose)}
                  </td>

                  <td style={cellStyle}>
                    {mapping.status}
                  </td>
                </tr>
              ))}

              {mappings.length === 0 && (
                <tr>
                  <td colSpan={5} style={cellStyle}>
                    No investor bank mappings created.
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

export default function InvestorBankScopesPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Investor Bank Scope Mapping</h1>
          <p>Loading investor bank mappings…</p>
        </main>
      }
    >
      <InvestorBankScopesContent {...props} />
    </Suspense>
  );
}
