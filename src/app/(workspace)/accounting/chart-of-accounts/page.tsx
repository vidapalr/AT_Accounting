
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import accountingStyles from "../accounting.module.css";
import {
  createLedgerAccountAction,
  updateLedgerAccountAction,
  changeLedgerAccountStatusAction,
} from "@/lib/chart-of-accounts-actions";

type Search = {
  q?: string;
  type?: string;
  status?: string;
  result?: string;
  edit?: string;
};

type Props = {
  searchParams: Promise<Search>;
};

interface Account extends RowDataPacket {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  account_subtype: string;
  normal_balance: string;
  is_posting_account: number;
  is_system_account: number;
  requires_division: number;
  requires_branch: number;
  status: string;
  description: string | null;
  linked_bank_count: number;
}

const accountTypes = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
];

const messages: Record<string, string> = {
  created: "Ledger account created.",
  updated: "Ledger account updated.",
  "status-changed": "Account status updated.",
  duplicate: "This account code already exists.",
  invalid: "Check the submitted account details.",
  "restricted-subtype":
    "This subtype requires controlled setup.",
  protected:
    "This account is protected from ordinary editing.",
  "bank-in-use":
    "This account is linked to a bank and cannot be deactivated.",
  "no-change": "No change was required.",
  "not-found": "Account was not found.",
  failed: "Operation failed. Check the server logs.",
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

const cardStyle: React.CSSProperties = {
  padding: 20,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  marginTop: 20,
};

const cellStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

export default function ChartOfAccountsPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading chart of accounts...
        </main>
      }
    >
      <ChartOfAccountsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ChartOfAccountsContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;

  const search = (query.q ?? "").trim().slice(0, 100);

  const type = accountTypes.includes(query.type ?? "")
    ? query.type!
    : "";

  const status =
    ["ACTIVE", "INACTIVE"].includes(query.status ?? "")
      ? query.status!
      : "";

  const editId =
    /^[1-9]\d*$/.test(query.edit ?? "")
      ? Number(query.edit)
      : null;

  const conditions = ["c.legal_business_id = ?"];
  const params: Array<string | number> = [
    user.legal_business_id,
  ];

  if (search) {
    conditions.push(
      "(c.account_code LIKE ? OR c.account_name LIKE ?)"
    );

    const term = `%${search}%`;
    params.push(term, term);
  }

  if (type) {
    conditions.push("c.account_type = ?");
    params.push(type);
  }

  if (status) {
    conditions.push("c.status = ?");
    params.push(status);
  }

  const [accounts] = await db.query<Account[]>(
    `SELECT
       c.id,
       c.account_code,
       c.account_name,
       c.account_type,
       c.account_subtype,
       c.normal_balance,
       c.is_posting_account,
       c.is_system_account,
       c.requires_division,
       c.requires_branch,
       c.status,
       c.description,
       (
         SELECT COUNT(*)
         FROM acct_bank_accounts b
         WHERE b.legal_business_id = c.legal_business_id
           AND b.gl_account_id = c.id
       ) AS linked_bank_count
     FROM acct_chart_of_accounts c
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.account_code
     LIMIT 500`,
    params
  );

  // Load the selected account independently of filters,
  // but always restrict it to the logged-in business.
  const [editRows] = editId && Number.isSafeInteger(editId)
    ? await db.execute<Account[]>(
        `SELECT
           c.*,
           (
             SELECT COUNT(*)
             FROM acct_bank_accounts b
             WHERE b.legal_business_id = c.legal_business_id
               AND b.gl_account_id = c.id
           ) AS linked_bank_count
         FROM acct_chart_of_accounts c
         WHERE c.id = ?
           AND c.legal_business_id = ?
         LIMIT 1`,
        [editId, user.legal_business_id]
      )
    : [[] as Account[]];

  const editable = editRows[0];

  const editProtected =
    editable &&
    (
      Number(editable.is_system_account) === 1 ||
      Number(editable.linked_bank_count) > 0
    );

  const summary = accounts.reduce(
    (result, account) => {
      result[account.account_type] =
        (result[account.account_type] ?? 0) + 1;
      return result;
    },
    {} as Record<string, number>
  );

  return (
    <main className={accountingStyles.page}>
      <header>
        <h1>Chart of Accounts</h1>

        <p>
          Manage Abhiram Group ledger accounts for
          all divisions and branches.
        </p>

        <Link className="btn-link" href="/accounting/bank-accounts">
          View Bank Accounts
        </Link>
      </header>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process the request."}
        </p>
      )}

      <section style={cardStyle}>
        <h2>Ledger Accounts</h2>

        <form
          method="GET"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={fieldStyle}>
            Search
            <input
              name="q"
              defaultValue={search}
              placeholder="Code or account name"
              maxLength={100}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            Account Type
            <select
              name="type"
              defaultValue={type}
              style={inputStyle}
            >
              <option value="">All types</option>
              {accountTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            Status
            <select
              name="status"
              defaultValue={status}
              style={inputStyle}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </label>

          <button type="submit">Apply Filters</button>

          <Link href="/accounting/chart-of-accounts">
            Clear
          </Link>
        </form>

        <p>
          Showing {accounts.length} accounts
          {accounts.length === 500
            ? " (first 500 matching records)"
            : ""}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 16,
          }}
        >
          {accountTypes.map((item) => (
            <span key={item}>
              <strong>{item}:</strong>{" "}
              {summary[item] ?? 0}
            </span>
          ))}
        </div>

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
                  "Account Name",
                  "Type",
                  "Subtype",
                  "Normal",
                  "Dimensions",
                  "Classification",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th
                    key={heading}
                    style={cellStyle}
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {accounts.map((account) => {
                const protectedAccount =
                  Number(account.is_system_account) === 1 ||
                  Number(account.linked_bank_count) > 0;

                return (
                  <tr key={account.id}>
                    <td style={cellStyle}>
                      <strong>
                        {account.account_code}
                      </strong>
                    </td>

                    <td style={cellStyle}>
                      {account.account_name}
                    </td>

                    <td style={cellStyle}>
                      {account.account_type}
                    </td>

                    <td style={cellStyle}>
                      {account.account_subtype}
                    </td>

                    <td style={cellStyle}>
                      {account.normal_balance}
                    </td>

                    <td style={cellStyle}>
                      {Number(account.requires_division)
                        ? "Division "
                        : "Group "}
                      {Number(account.requires_branch)
                        ? "/ Branch"
                        : ""}
                    </td>

                    <td style={cellStyle}>
                      {protectedAccount
                        ? "Protected"
                        : "Custom"}
                    </td>

                    <td style={cellStyle}>
                      {account.status}
                    </td>

                    <td style={cellStyle}>
                      {protectedAccount ? (
                        <span>Read-only</span>
                      ) : (
                        <Link
                          href={
                            `/accounting/chart-of-accounts?edit=${account.id}`
                          }
                        >
                          Edit
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}

              {accounts.length === 0 && (
                <tr>
                  <td colSpan={9} style={cellStyle}>
                    No accounts match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={cardStyle}>
        <h2>Create Ledger Account</h2>

        <form
          action={createLedgerAccountAction}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 16,
          }}
        >
          <label style={fieldStyle}>
            Account Code
            <input
              name="account_code"
              maxLength={20}
              required
              style={inputStyle}
              placeholder="6095"
            />
          </label>

          <label style={fieldStyle}>
            Account Name
            <input
              name="account_name"
              maxLength={150}
              minLength={3}
              required
              style={inputStyle}
              placeholder="Cleaning Expenses"
            />
          </label>

          <label style={fieldStyle}>
            Account Type
            <select
              name="account_type"
              required
              defaultValue="EXPENSE"
              style={inputStyle}
            >
              {accountTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label style={fieldStyle}>
            Account Subtype
            <input
              name="account_subtype"
              defaultValue="OPERATING"
              maxLength={60}
              required
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span>Division attribution required</span>
            <input
              type="checkbox"
              name="requires_division"
              value="yes"
              defaultChecked
            />
          </label>

          <label style={fieldStyle}>
            <span>Branch attribution required</span>
            <input
              type="checkbox"
              name="requires_branch"
              value="yes"
            />
          </label>

          <label
            style={{
              ...fieldStyle,
              gridColumn: "1 / -1",
            }}
          >
            Description
            <textarea
              name="description"
              maxLength={3000}
              rows={2}
              style={inputStyle}
            />
          </label>

          <div style={{ gridColumn: "1 / -1" }}>
            <button type="submit">
              Create Ledger Account
            </button>
          </div>
        </form>
      </section>

      {editable && (
        <section style={cardStyle}>
          <h2>
            Account Maintenance — {editable.account_code}
          </h2>

          {editProtected ? (
            <p>
              This account is protected because it
              is a system account or is linked to
              a registered bank.
            </p>
          ) : (
            <>
              <form
                action={updateLedgerAccountAction}
                style={{
                  display: "grid",
                  gap: 14,
                  maxWidth: 650,
                }}
              >
                <input
                  type="hidden"
                  name="account_id"
                  value={editable.id}
                />

                <label style={fieldStyle}>
                  Account Name
                  <input
                    name="account_name"
                    defaultValue={editable.account_name}
                    required
                    maxLength={150}
                    style={inputStyle}
                  />
                </label>

                <label style={fieldStyle}>
                  Description
                  <textarea
                    name="description"
                    defaultValue={
                      editable.description ?? ""
                    }
                    maxLength={3000}
                    rows={3}
                    style={inputStyle}
                  />
                </label>

                <label>
                  <input
                    type="checkbox"
                    name="requires_division"
                    value="yes"
                    defaultChecked={
                      Number(editable.requires_division) === 1
                    }
                  />
                  {" "}Require Division
                </label>

                <label>
                  <input
                    type="checkbox"
                    name="requires_branch"
                    value="yes"
                    defaultChecked={
                      Number(editable.requires_branch) === 1
                    }
                  />
                  {" "}Require Branch
                </label>

                <button type="submit">
                  Save Changes
                </button>
              </form>

              <form
                action={changeLedgerAccountStatusAction}
                style={{ marginTop: 20 }}
              >
                <input
                  type="hidden"
                  name="account_id"
                  value={editable.id}
                />

                <input
                  type="hidden"
                  name="target_status"
                  value={
                    editable.status === "ACTIVE"
                      ? "INACTIVE"
                      : "ACTIVE"
                  }
                />

                <button type="submit">
                  {editable.status === "ACTIVE"
                    ? "Deactivate Account"
                    : "Activate Account"}
                </button>
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}
