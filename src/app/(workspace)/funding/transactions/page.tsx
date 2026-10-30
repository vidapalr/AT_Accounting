
import Link from "next/link";
import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

import {
  getFundingReceipts,
  getReceiptAgreements,
} from "@/lib/funding-transactions";

import { createInvestorPaymentAction } from "@/lib/investor-payment-actions";

import {
  createFundingReceiptAction,
  confirmFundingReceiptAction,
  cancelFundingReceiptAction,
} from "@/lib/funding-receipt-actions";

import SubmitButton from "@/components/SubmitButton";
import styles from "../funding.module.css";

type Props = {
  searchParams: Promise<{
    result?: string;
  }>;
};

const messages: Record<string, string> = {
  created: "Draft funding receipt saved successfully.",
  "pay-created": "Payment saved as a draft. Confirm it below once it has left the bank.",
  "pay-invalid": "Please check the payment details (agreement, type, amount, date, account).",
  "pay-account": "Choose an active bank or cash account of the group.",
  "pay-too-much": "That is more than the principal still owed to this investor.",
  "pay-failed": "Unable to save the payment.",
  confirmed: "Receipt confirmed. It now counts for the investor and reaches the books by itself.",
  cancelled: "Draft receipt cancelled.",
  invalid: "Please check the receipt details.",
  "not-active":
    "The selected agreement is not active.",
  "inactive-scope":
    "The investor, division or branch is inactive.",
  "policy-not-ready":
    "Agreement approval or funding policy is incomplete.",
  "additional-not-allowed":
    "This agreement does not permit another funding receipt.",
  "limit-exceeded":
    "This receipt exceeds the permitted funding limit.",
  duplicate:
    "This transaction number already exists.",
  "invalid-account":
    "Select an active Group bank or cash account that can receive funds.",
  failed:
    "Unable to save the funding receipt.",
};

function formatMoney(value: string | number) {
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function FundingTransactionsPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>Loading funding transactions...</div>
      }
    >
      <FundingTransactionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FundingTransactionsContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();

  const [agreements, transactions] =
    await Promise.all([
      getReceiptAgreements(user.legal_business_id),
      getFundingReceipts(user.legal_business_id),
    ]);

  const [banks] = await db.execute<RowDataPacket[]>(
    `SELECT
       id,
       bank_name,
       account_label,
       account_number_last4
     FROM acct_bank_accounts
     WHERE legal_business_id = ?
       AND ownership_type = 'BUSINESS'
       AND status = 'ACTIVE'
       AND verification_status = 'VERIFIED'
       AND can_receive = 1
     ORDER BY bank_name, account_label, id`,
    [user.legal_business_id]
  );
  const [cashAccounts] = await db.execute<RowDataPacket[]>(
    `SELECT id, cash_name, cash_code
     FROM acct_cash_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY cash_name, id`,
    [user.legal_business_id]
  );

  const query = await searchParams;

  const message = query.result
    ? messages[query.result]
    : undefined;

  const draftReceipts = transactions.filter(
    (transaction) =>
      transaction.status === "DRAFT" &&
      transaction.transaction_type === "FUNDING_RECEIVED"
  );

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>Funding Transactions</h1>
        <p>
          Record investor and lender funding received
          for Abhiram Group divisions and branches.
        </p>
      </header>

      <div className={styles.linkRow}>
        <Link
          href="/funding/agreements"
          className={styles.primaryLink}
        >
          View Funding Agreements
        </Link>
      </div>

      {message && (
        <div
          role="status"
          className={
            query.result === "created"
              ? styles.success
              : styles.error
          }
        >
          {message}
        </div>
      )}

      <section className={styles.metrics}>
        <Metric
          label="Eligible Agreements"
          value={agreements.length}
        />

        <Metric
          label="Draft Receipts (Latest 200)"
          value={draftReceipts.length}
        />

        <Metric
          label="Transactions Listed"
          value={transactions.length}
        />
      </section>

      <section className={styles.card}>
        <h2>Record Funding Received</h2>

        {agreements.length === 0 ? (
          <p className={styles.note}>
            No eligible agreements are available.
            The agreement must be Active, with an
            approved Version 1 and a confirmed
            Version 1 funding policy.
          </p>
        ) : banks.length === 0 && cashAccounts.length === 0 ? (
          <p className={styles.note}>
            Add an active Group bank account that can receive funds or
            an active cash account before recording receipts.
          </p>
        ) : (
          <form
            action={createFundingReceiptAction}
            className={styles.formGrid}
          >
            <Field label="Funding Agreement">
              <select
                name="agreement_id"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select funding agreement
                </option>

                {agreements.map((agreement) => (
                  <option
                    key={agreement.id}
                    value={agreement.id}
                  >
                    {agreement.agreement_no}
                    {" — "}
                    {agreement.party_name}
                    {" — "}
                    {agreement.branch_name ??
                      agreement.division_name ??
                      "Abhiram Group"}
                  </option>
                ))}
              </select>
            </Field>


            <Field label="Transaction Date">
              <input
                type="date"
                name="transaction_date"
                required
              />
            </Field>

            <Field label="Amount Received (₹)">
              <input
                name="amount"
                inputMode="decimal"
                placeholder="50000.00"
                required
              />
            </Field>

            <Field label="Payment Method">
              <select
                name="payment_method"
                defaultValue="BANK_TRANSFER"
                required
              >
                <option value="BANK_TRANSFER">
                  Bank Transfer
                </option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>

            <Field label="Deposit Account">
              <select name="account" defaultValue="" required>
                <option value="" disabled>
                  Select receiving account
                </option>
                <optgroup label="Group bank accounts">
                  {banks.map((bank) => (
                    <option key={`BANK:${bank.id}`} value={`BANK:${bank.id}`}>
                      {bank.bank_name} — {bank.account_label}
                      {" ••••"}{bank.account_number_last4}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Group cash accounts">
                  {cashAccounts.map((cash) => (
                    <option key={`CASH:${cash.id}`} value={`CASH:${cash.id}`}>
                      {cash.cash_name} ({cash.cash_code})
                    </option>
                  ))}
                </optgroup>
              </select>
            </Field>

            <Field label="Payment Reference">
              <input
                name="payment_reference"
                maxLength={120}
                placeholder="UTR / UPI transaction reference"
              />
            </Field>

            <Field label="Purpose / Remarks">
              <textarea
                name="remarks"
                rows={3}
                maxLength={500}
                placeholder="Stock purchase funding — Cotton Sarees"
              />
            </Field>

            <div className={styles.formActions}>
              <button
                className={styles.primary}
                type="submit"
              >
                Save Draft Receipt
              </button>
            </div>
          </form>
        )}

        <p className={styles.note}>
          Select the Group account that received the funds.
          The receipt remains Draft until verified against
          actual payment evidence.
        </p>
      </section>

      <section className={styles.card}>
        <h2>Pay an investor</h2>
        <p className={styles.note}>
          Give back an investor&apos;s own money, or pay a return on it. For a return, choose how it is treated in the books.
          Your accountant can decide: <strong>Share of profit</strong> is shared out and does not reduce profit; <strong>Cost</strong> counts as an expense and reduces profit.
        </p>
        {agreements.length === 0 || (banks.length === 0 && cashAccounts.length === 0) ? (
          <p className={styles.note}>An active agreement and a bank or cash account are needed first.</p>
        ) : (
          <form action={createInvestorPaymentAction} className={styles.formGrid}>
            <Field label="Funding Agreement">
              <select name="agreement_id" defaultValue="" required>
                <option value="" disabled>Select funding agreement</option>
                {agreements.map((agreement) => (
                  <option key={agreement.id} value={agreement.id}>
                    {agreement.agreement_no} — {agreement.party_name} — {agreement.branch_name ?? agreement.division_name ?? "Abhiram Group"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="What is being paid">
              <select name="kind" defaultValue="RETURN_PAID" required>
                <option value="RETURN_PAID">A return on their money</option>
                <option value="PRINCIPAL_REPAID">Their money given back (principal)</option>
              </select>
            </Field>
            <Field label="Treat a return as (only for a return)">
              <select name="treatment" defaultValue="PROFIT_SHARE">
                <option value="PROFIT_SHARE">Share of profit (not a cost)</option>
                <option value="COST">Cost (reduces profit)</option>
              </select>
            </Field>
            <Field label="Payment Date"><input type="date" name="transaction_date" required /></Field>
            <Field label="Amount Paid (₹)"><input name="amount" inputMode="decimal" placeholder="25000.00" required /></Field>
            <Field label="Payment Method">
              <select name="payment_method" defaultValue="BANK_TRANSFER" required>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Paid from">
              <select name="account" defaultValue="" required>
                <option value="" disabled>Select account</option>
                <optgroup label="Group bank accounts">
                  {banks.map((bank) => (
                    <option key={`PB:${bank.id}`} value={`BANK:${bank.id}`}>{bank.bank_name} — {bank.account_label} {"••••"}{bank.account_number_last4}</option>
                  ))}
                </optgroup>
                <optgroup label="Group cash accounts">
                  {cashAccounts.map((cash) => (
                    <option key={`PC:${cash.id}`} value={`CASH:${cash.id}`}>{cash.cash_name} ({cash.cash_code})</option>
                  ))}
                </optgroup>
              </select>
            </Field>
            <Field label="Payment Reference"><input name="payment_reference" maxLength={120} placeholder="UTR / UPI reference" /></Field>
            <Field label="Note"><textarea name="remarks" rows={2} maxLength={500} /></Field>
            <div className={styles.formActions}>
              <button className={styles.primary} type="submit">Save payment as draft</button>
            </div>
          </form>
        )}
      </section>

      <section className={styles.card}>
        <h2>Eligible Agreement Balances</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Investor / Lender</th>
                <th>Funding Model</th>
                <th>Verified Outstanding</th>
                <th>Pending Receipts</th>
                <th>Maximum</th>
              </tr>
            </thead>
            <tbody>
              {agreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td>{agreement.agreement_no}</td>
                  <td>{agreement.party_name}</td>
                  <td>
                    {agreement.funding_model.replaceAll("_", " ")}
                  </td>
                  <td>
                    {formatMoney(
                      agreement.verified_outstanding
                    )}
                  </td>
                  <td>
                    {formatMoney(
                      agreement.pending_receipts
                    )}
                  </td>
                  <td>
                    {agreement.maximum_outstanding
                      ? formatMoney(
                          agreement.maximum_outstanding
                        )
                      : agreement.funding_model === "FIXED"
                        ? formatMoney(
                            agreement.committed_amount
                          )
                        : "Not configured"}
                  </td>
                </tr>
              ))}

              {agreements.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    No eligible funding agreements.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Funding Transaction Register</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Date</th>
                <th>Agreement</th>
                <th>Investor / Lender</th>
                <th>Amount</th>
                <th>Payment Mode</th>
                <th>Deposit Account</th>
                <th>Status</th>
                <th>Next step</th>
              </tr>
            </thead>

            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>
                    <strong>
                      {transaction.transaction_no}
                    </strong>
                    <small>
                      {transaction.transaction_type.replaceAll(
                        "_",
                        " "
                      )}
                      {transaction.return_treatment ? (transaction.return_treatment === "COST" ? " (cost)" : " (share of profit)") : ""}
                    </small>
                  </td>

                  <td>{transaction.transaction_date}</td>
                  <td>{transaction.agreement_no}</td>
                  <td>{transaction.party_name}</td>
                  <td>{formatMoney(transaction.amount)}</td>
                  <td>
                    {transaction.payment_method.replaceAll(
                      "_",
                      " "
                    )}
                    <small>
                      {transaction.payment_reference ?? "—"}
                    </small>
                  </td>
                  <td>{transaction.deposit_account}</td>
                  <td>
                    <span
                      className={
                        transaction.status === "VERIFIED"
                          ? styles.active
                          : styles.inactive
                      }
                    >
                      {transaction.status}
                    </span>
                  </td>
                  <td>
                    {transaction.status === "DRAFT" ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <form action={confirmFundingReceiptAction}>
                          <input type="hidden" name="transaction_id" value={transaction.id} />
                          {transaction.transaction_type === "FUNDING_RECEIVED"
                            ? <SubmitButton label="Confirm: it is in the bank" question="Confirm that this money is in the bank statement? It will count for the investor and go into the books." />
                            : <SubmitButton label="Confirm: it has left the bank" question="Confirm that this payment has left the bank (check the statement)? It will go into the books." />}
                        </form>
                        <form action={cancelFundingReceiptAction}>
                          <input type="hidden" name="transaction_id" value={transaction.id} />
                          <SubmitButton label="Cancel" className="btn-link" question="Cancel this draft receipt?" />
                        </form>
                      </div>
                    ) : transaction.status === "VERIFIED" ? "In the books" : "—"}
                  </td>
                </tr>
              ))}

              {transactions.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    No funding transactions recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
