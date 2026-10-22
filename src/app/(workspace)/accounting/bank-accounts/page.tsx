
import { Suspense } from "react";
import { requireGroupOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { createBankAccountAction } from
  "@/lib/bank-account-actions";
import type { RowDataPacket } from "mysql2";
import accountingStyles from "../accounting.module.css";
import BankAccountSections from "./BankAccountSections";

type Props = {
  searchParams: Promise<{ result?: string ; mapping?: string ; evidence?: string ; verification?: string }>;
};

interface BankRow extends RowDataPacket {
  id: number;
  ownership_type: string;
  account_label: string;
  account_holder_name: string;
  bank_name: string;
  branch_name: string | null;
  ifsc_code: string;
  account_number_last4: string;
  account_type: string;
  party_name: string | null;
  can_receive: number;
  can_send: number;
  verification_status: string;
  status: string;
}

interface PartyRow extends RowDataPacket {
  id: number;
  full_name: string;
}

export default function BankAccountsPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 24 }}>
          Loading bank accounts...
        </div>
      }
    >
      <BankAccountsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BankAccountsContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;

  const [bankResult, partyResult] =
    await Promise.all([
      db.execute<BankRow[]>(
        `SELECT
           b.id,
           b.ownership_type,
           b.account_label,
           b.account_holder_name,
           b.bank_name,
           b.branch_name,
           b.ifsc_code,
           b.account_number_last4,
           b.account_type,
           p.full_name AS party_name,
           b.can_receive,
           b.can_send,
           b.verification_status,
           b.status
         FROM acct_bank_accounts b
         LEFT JOIN acct_funding_parties p
           ON p.id = b.funding_party_id
          AND p.legal_business_id =
              b.legal_business_id
         WHERE b.legal_business_id = ?
         ORDER BY
           b.ownership_type,
           b.bank_name,
           b.id DESC`,
        [user.legal_business_id]
      ),
      db.execute<PartyRow[]>(
        `SELECT id, full_name
         FROM acct_funding_parties
         WHERE legal_business_id = ?
         ORDER BY full_name`,
        [user.legal_business_id]
      ),
    ]);

  const banks = bankResult[0];
  const parties = partyResult[0];

  const messages: Record<string, string> = {
    created: "Bank account registered successfully.",
    duplicate: "This account is already registered.",
    invalid: "Please check the account details.",
    "invalid-number": "Invalid bank account number.",
    "invalid-party": "Select a valid funding party.",
    failed: "Could not register the bank account.",
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 6,
  };

  return (
    <main className={accountingStyles.page}>
      <h1>Bank Account Management</h1>

      <p>
        Manage Abhiram-controlled bank accounts
        and investor funding/payment accounts.
      </p>

      {query.result && (
        <p role="status">
          {messages[query.result] ??
            "Unable to process request."}
        </p>
      )}

      <section style={{
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        marginBottom: 24,
      }}>
        <h2>Add Bank Account</h2>

        <p>
          Investor accounts are external counterparties.
          They do not contribute to the Group&apos;s
          available bank balance.
        </p>

        <form
          action={createBankAccountAction}
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 16,
          }}
        >
          <label style={labelStyle}>
            Ownership
            <select
              name="ownership_type"
              defaultValue="BUSINESS"
              required
              style={inputStyle}
            >
              <option value="BUSINESS">
                Abhiram Group / Business Controlled
              </option>
              <option value="INVESTOR">
                Investor Owned
              </option>
            </select>
          </label>

          <label style={labelStyle}>
            Investor (required for investor account)
            <select
              name="funding_party_id"
              defaultValue=""
              style={inputStyle}
            >
              <option value="">
                Not applicable
              </option>
              {parties.map((party) => (
                <option
                  key={party.id}
                  value={party.id}
                >
                  {party.full_name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Account Label
            <input
              name="account_label"
              placeholder="SBI Main / Investor Primary"
              required
              maxLength={120}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Account Holder Name
            <input
              name="account_holder_name"
              required
              maxLength={160}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Bank Name
            <input
              name="bank_name"
              placeholder="State Bank of India"
              required
              maxLength={160}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Bank Branch
            <input
              name="branch_name"
              maxLength={160}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            IFSC
            <input
              name="ifsc_code"
              required
              maxLength={11}
              placeholder="SBIN0001234"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Account Type
            <select
              name="account_type"
              style={inputStyle}
              defaultValue="SAVINGS"
            >
              <option value="SAVINGS">Savings</option>
              <option value="CURRENT">Current</option>
              <option value="OD_CC">OD / CC</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label style={labelStyle}>
            Account Number
            <input
              name="account_number"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              required
              style={inputStyle}
              placeholder="Enter complete account number"
            />
          </label>

          <fieldset style={{
            border: "1px solid #cbd5e1",
            borderRadius: 6,
          }}>
            <legend>Usage</legend>

            <label style={{ marginRight: 16 }}>
              <input
                type="checkbox"
                name="can_receive"
                value="yes"
                defaultChecked
              />
              {" "}Can receive money
            </label>

            <label>
              <input
                type="checkbox"
                name="can_send"
                value="yes"
                defaultChecked
              />
              {" "}Can send money
            </label>
          </fieldset>

          <label style={labelStyle}>
            Notes
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              style={inputStyle}
            />
          </label>

          <div style={{
            gridColumn: "1 / -1",
          }}>
            <button
              type="submit"
              style={{
                padding: "12px 20px",
                cursor: "pointer",
              }}
            >
              Save Bank Account
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2>Registered Accounts</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                <th>Ownership</th>
                <th>Label</th>
                <th>Bank</th>
                <th>Account Holder</th>
                <th>Account</th>
                <th>IFSC</th>
                <th>Usage</th>
                <th>Verification</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {banks.map((bank) => (
                <tr key={bank.id}>
                  <td>
                    {bank.ownership_type}
                    {bank.party_name &&
                      <small>
                        {" — "}{bank.party_name}
                      </small>}
                  </td>

                  <td>{bank.account_label}</td>
                  <td>{bank.bank_name}</td>
                  <td>{bank.account_holder_name}</td>
                  <td>
                    ••••{bank.account_number_last4}
                  </td>
                  <td>{bank.ifsc_code}</td>
                  <td>
                    {Number(bank.can_receive) === 1
                      ? "Receive "
                      : ""}
                    {Number(bank.can_send) === 1
                      ? "Send"
                      : ""}
                  </td>
                  <td>
                    {bank.verification_status}
                  </td>
                  <td>{bank.status}</td>
                </tr>
              ))}

              {banks.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    No bank accounts registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <BankAccountSections
        businessId={user.legal_business_id}
        returnTo="/accounting/bank-accounts"
        mapping={query.mapping}
        evidence={query.evidence}
        verification={query.verification}
      />
    </main>
  );
}
