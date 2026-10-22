
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import {
  recordExpensePaymentAction,
} from "@/lib/expense-payment-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
};

function money(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("expenses");
  const { id } = await params;
  const { result } = await searchParams;
  const expenseId = Number(id);

  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) {
    notFound();
  }

  const businessId = user.legal_business_id;

  const [expenses] = await db.execute<RowDataPacket[]>(
    `SELECT
       e.*,
       DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS date_text,
       b.branch_name
     FROM acct_expenses e
     LEFT JOIN acct_branches b
       ON b.legal_business_id = e.legal_business_id
      AND b.division_id = e.division_id
      AND b.id = e.branch_id
     WHERE e.legal_business_id = ? AND e.id = ?`,
    [businessId, expenseId]
  );

  if (expenses.length !== 1) notFound();
  const e = expenses[0];

  const [payments] = await db.execute<RowDataPacket[]>(
    `SELECT
       ep.id,
       DATE_FORMAT(ep.payment_date, '%Y-%m-%d') AS date_text,
       ep.payment_method,
       ep.payment_source,
       ep.amount,
       ep.status,
       ep.payment_reference,
       CASE
         WHEN ep.bank_account_id IS NOT NULL
           THEN CONCAT(b.bank_name, ' ••••',
                       b.account_number_last4)
         WHEN ep.cash_account_id IS NOT NULL
           THEN c.cash_name
         WHEN ep.payment_source = 'INVESTOR_CASH'
           THEN f.full_name
         ELSE 'Proprietor Personal'
       END AS account_name
     FROM acct_expense_payments ep
     LEFT JOIN acct_bank_accounts b
       ON b.legal_business_id = ep.legal_business_id
      AND b.id = ep.bank_account_id
     LEFT JOIN acct_cash_accounts c
       ON c.legal_business_id = ep.legal_business_id
      AND c.id = ep.cash_account_id
     LEFT JOIN acct_funding_parties f
       ON f.legal_business_id = ep.legal_business_id
      AND f.id = ep.funding_party_id
     WHERE ep.legal_business_id = ?
       AND ep.expense_id = ?
     ORDER BY ep.id`,
    [businessId, expenseId]
  );

  const [banks] = await db.execute<RowDataPacket[]>(
    `SELECT id, bank_name, account_label,
            account_number_last4, ownership_type
     FROM acct_bank_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
       AND verification_status = 'VERIFIED'
       AND can_send = 1
     ORDER BY ownership_type, bank_name`,
    [businessId]
  );

  const [cash] = await db.execute<RowDataPacket[]>(
    `SELECT id, cash_name
     FROM acct_cash_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
       AND (
         division_id IS NULL OR division_id = ?
       )
       AND (
         branch_id IS NULL OR branch_id = ?
       )`,
    [businessId, e.division_id, e.branch_id]
  );

  const [parties] = await db.execute<RowDataPacket[]>(
    `SELECT id, full_name FROM acct_funding_parties
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'`,
    [businessId]
  );

  const paid = payments
    .filter(p => p.status === "RECORDED")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const remaining = Math.max(0, Number(e.amount) - paid);

  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <main style={{ maxWidth: 1000, padding: 24, margin: "auto" }}>
      <Link href="/accounting/expenses">← Expenses</Link>
      <h1>{e.expense_no}</h1>

      <p>
        {e.allocation_level} · {e.branch_name || "No branch"}
        {" · "}{e.category} · {e.date_text}
      </p>
      <p>{e.description}</p>
      <p>Record status: <strong>{e.status}</strong></p>

      <h2>
        Expense ₹{money(e.amount)} · Paid ₹{money(paid)}
        {" · "} Pending ₹{money(remaining)}
      </h2>

      {result && (
        <p role="status">
          {result === "recorded"
            ? "Payment recorded successfully."
            : `Payment not saved: ${result}`}
        </p>
      )}

      {e.status === "CONFIRMED" && remaining > 0 && (
        <form
          action={recordExpensePaymentAction}
          style={{
            padding: 20,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            display: "grid",
            gap: 12,
          }}
        >
          <h2>Add Payment</h2>
          <input
            type="hidden"
            name="expense_id"
            value={expenseId}
          />

          <label>
            Payment Date
            <input
              type="date"
              name="payment_date"
              defaultValue={today}
              required
            />
          </label>

          <label>
            Payment Source
            <select name="payment_source" required defaultValue="">
              <option value="">Select source</option>
              <option value="BUSINESS_BANK">Group Bank</option>
              <option value="BUSINESS_CASH">Group / Shop Cash</option>
              <option value="INVESTOR_BANK">Investor Bank</option>
              <option value="INVESTOR_CASH">Investor Cash</option>
              <option value="OWNER_PERSONAL">Owner Personal</option>
            </select>
          </label>

          <label>
            Payment Method
            <select name="payment_method" defaultValue="CASH">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label>
            Paying Bank or Cash Account
            <select name="account_id" defaultValue="">
              <option value="">
                No bank/cash account — Investor Cash or Owner Personal only
              </option>
              {banks.map(b => (
                <option key={`bank-${b.id}`} value={`BANK:${b.id}`}>
                  {b.ownership_type} BANK — {b.bank_name}
                  {" "}••••{b.account_number_last4}
                </option>
              ))}
              {cash.map(c => (
                <option key={`cash-${c.id}`} value={`CASH:${c.id}`}>
                  CASH — {c.cash_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Investor (only for Investor Cash)
            <select name="funding_party_id" defaultValue="">
              <option value="">Not applicable</option>
              {parties.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Amount ₹
            <input
              type="number"
              name="amount"
              min="0.01"
              max={Number(remaining).toFixed(2)}
              step="0.01"
              required
            />
          </label>

          <label>
            Payment Reference (optional)
            <input name="payment_reference" maxLength={150} />
          </label>

          <button type="submit">Record Expense Payment</button>
        </form>
      )}

      <h2 style={{ marginTop: 28 }}>Payment History</h2>
      <div style={{ overflowX: "auto" }}>
        <table cellPadding={10}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Method</th>
              <th>Source</th>
              <th>Account</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id}>
                <td>{p.date_text}</td>
                <td>{p.payment_method}</td>
                <td>{p.payment_source}</td>
                <td>{p.account_name}</td>
                <td>₹{money(p.amount)}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

export default function ExpenseDetailPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading expense…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
