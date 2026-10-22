
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../accounting.module.css";
import {
  createCashAccountAction,
} from "@/lib/cash-account-actions";

type Props = {
  searchParams: Promise<{
    result?: string;
  }>;
};

interface CashAccount extends RowDataPacket {
  id: number;
  cash_code: string;
  cash_name: string;
  cash_type: string;
  custodian_name: string;
  division_name: string | null;
  branch_name: string | null;
  account_code: string;
  account_name: string;
  status: string;
}

interface Division extends RowDataPacket {
  id: number;
  name: string;
  code: string;
}

interface Branch extends RowDataPacket {
  id: number;
  division_id: number;
  branch_code: string;
  branch_name: string;
}

const messages: Record<string, string> = {
  created: "Cash account and ledger created.",
  duplicate: "Cash code or GL code already exists.",
  invalid: "Review the cash-account details.",
  "invalid-dimension":
    "The selected Division or Branch is invalid.",
  "not-found": "Legal business was not found.",
  failed: "Cash account creation failed.",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

async function CashAccountsContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [
    [cashAccounts],
    [divisions],
    [branches],
  ] = await Promise.all([
    db.execute<CashAccount[]>(
      `SELECT
         c.id,
         c.cash_code,
         c.cash_name,
         c.cash_type,
         c.custodian_name,
         d.name AS division_name,
         b.branch_name,
         gl.account_code,
         gl.account_name,
         c.status
       FROM acct_cash_accounts c
       JOIN acct_chart_of_accounts gl
         ON gl.id = c.gl_account_id
        AND gl.legal_business_id =
            c.legal_business_id
       LEFT JOIN acct_divisions d
         ON d.id = c.division_id
        AND d.legal_business_id =
            c.legal_business_id
       LEFT JOIN acct_branches b
         ON b.id = c.branch_id
        AND b.division_id = c.division_id
        AND b.legal_business_id =
            c.legal_business_id
       WHERE c.legal_business_id = ?
       ORDER BY c.cash_code`,
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
      `SELECT id, division_id, branch_code, branch_name
       FROM acct_branches
       WHERE legal_business_id = ?
         AND status = 'ACTIVE'
       ORDER BY division_id, branch_name`,
      [businessId]
    ),
  ]);

  return (
    <main className={accountingStyles.page}>
      <h1>Cash Account Management</h1>

      <p>
        Register physical cash locations and their
        custodians for Abhiram Group.
      </p>

      <Link href="/accounting/chart-of-accounts">
        View Chart of Accounts
      </Link>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process the request."}
        </p>
      )}

      <section
        style={{
          border: "1px solid #cbd5e1",
          padding: 20,
          borderRadius: 10,
          marginTop: 22,
        }}
      >
        <h2>Create Cash Account</h2>

        <p>
          A dedicated cash ledger will be created
          automatically. No opening balance will
          be entered at this stage.
        </p>

        <form
          action={createCashAccountAction}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 16,
          }}
        >
          <label style={fieldStyle}>
            Cash Code
            <input
              name="cash_code"
              placeholder="ATX-KAP-CASH"
              maxLength={32}
              required
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Cash Account Name
            <input
              name="cash_name"
              placeholder="Kapra Shop Cash"
              maxLength={150}
              required
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            GL Account Code
            <input
              name="gl_account_code"
              placeholder="1001"
              maxLength={6}
              required
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Cash Type
            <select
              name="cash_type"
              defaultValue="SHOP_CASH"
              style={inputStyle}
              required
            >
              <option value="SHOP_CASH">
                Shop Cash
              </option>
              <option value="PETTY_CASH">
                Petty Cash
              </option>
              <option value="OWNER_HELD">
                Owner-held Business Cash
              </option>
              <option value="OTHER">
                Other Business Cash
              </option>
            </select>
          </label>

          <label style={fieldStyle}>
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

          <label style={fieldStyle}>
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

          <label style={fieldStyle}>
            Cash Custodian
            <input
              name="custodian_name"
              maxLength={150}
              required
              placeholder="Person responsible for the cash"
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Notes
            <textarea
              name="notes"
              maxLength={1000}
              rows={2}
              style={inputStyle}
            />
          </label>

          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="submit"
              style={{ padding: "12px 20px" }}
            >
              Save Cash Account
            </button>
          </div>
        </form>

        <p>
          For Shop Cash and Petty Cash, select
          both the Division and Branch. For
          Owner-held Business Cash, leave both
          fields at Group level.
        </p>
      </section>

      <section
        style={{
          border: "1px solid #cbd5e1",
          padding: 20,
          borderRadius: 10,
          marginTop: 24,
        }}
      >
        <h2>Cash Account Register</h2>

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
                  "Code",
                  "Cash Account",
                  "Type",
                  "Division",
                  "Branch",
                  "Custodian",
                  "GL Account",
                  "Status",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom:
                        "1px solid #cbd5e1",
                    }}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {cashAccounts.map((cash) => (
                <tr key={cash.id}>
                  <td>{cash.cash_code}</td>
                  <td>{cash.cash_name}</td>
                  <td>{cash.cash_type}</td>
                  <td>
                    {cash.division_name ?? "Group"}
                  </td>
                  <td>
                    {cash.branch_name ?? "—"}
                  </td>
                  <td>{cash.custodian_name}</td>
                  <td>
                    {cash.account_code}
                    {" — "}
                    {cash.account_name}
                  </td>
                  <td>{cash.status}</td>
                </tr>
              ))}

              {cashAccounts.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    No cash accounts registered.
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

export default function CashAccountsPage(
  props: Props
) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          <h1>Cash Account Management</h1>
          <p>Loading cash accounts…</p>
        </main>
      }
    >
      <CashAccountsContent {...props} />
    </Suspense>
  );
}
