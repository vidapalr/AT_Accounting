
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { createExpenseAction } from "@/lib/expense-actions";
import ExpenseAllocationFields
  from "@/components/accounting/ExpenseAllocationFields";

import ExpenseInitialPaymentFields from
  "@/components/accounting/ExpenseInitialPaymentFields";

type Props = {
  searchParams: Promise<{
    result?: string;
    id?: string;
  }>;
};

const categories = [
  ["RENT", "Rent"],
  ["ELECTRICITY", "Electricity"],
  ["TRANSPORT", "Transport"],
  ["PACKING", "Packing"],
  ["SALARY", "Salary"],
  ["MAINTENANCE", "Maintenance"],
  ["MARKETING", "Marketing"],
  ["INTERNET_PHONE", "Internet / Phone"],
  ["OFFICE_SUPPLIES", "Office Supplies"],
  ["BANK_CHARGES", "Bank Charges"],
  ["MISCELLANEOUS", "Miscellaneous"],
];

const messages: Record<string, string> = {
  created: "Expense saved successfully.",
  invalid: "Please check the expense details.",
  "invalid-amount": "Enter a valid amount greater than zero.",
  "invalid-payment": "Check the payment details and source account.",
  "payment-exceeds-expense":
    "Payment cannot exceed the expense amount.",
  "invalid-division": "The selected division is unavailable.",
  "invalid-branch": "The selected branch is unavailable.",
  failed: "Unable to save the expense. Check server logs.",
};

function inr(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  whiteSpace: "nowrap",
};

async function ExpensesContent({ searchParams }: Props) {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const { result, id } = await searchParams;

  const [banks] = await db.execute<RowDataPacket[]>(
    `SELECT
        id, bank_name, account_label,
        account_number_last4, ownership_type
    FROM acct_bank_accounts
    WHERE legal_business_id = ?
        AND status = 'ACTIVE'
        AND verification_status = 'VERIFIED'
        AND can_send = 1
    ORDER BY ownership_type, bank_name`,
    [businessId]
    );

    const [cashAccounts] = await db.execute<RowDataPacket[]>(
    `SELECT id, cash_name, division_id, branch_id
    FROM acct_cash_accounts
    WHERE legal_business_id = ?
        AND status = 'ACTIVE'
    ORDER BY cash_name`,
    [businessId]
    );

    const [investors] = await db.execute<RowDataPacket[]>(
    `SELECT id, full_name
    FROM acct_funding_parties
    WHERE legal_business_id = ?
        AND status = 'ACTIVE'
    ORDER BY full_name`,
    [businessId]
    );

  const [branches] = await db.execute<RowDataPacket[]>(
    `SELECT id, branch_name
     FROM acct_branches
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY branch_name`,
    [businessId]
  );

  const [expenses] = await db.execute<RowDataPacket[]>(
    `SELECT
       e.id,
       e.expense_no,
       e.allocation_level,
       DATE_FORMAT(e.expense_date, '%Y-%m-%d')
         AS expense_date,
       e.category,
       e.description,
       e.amount,
       e.status,
       b.branch_name,
       COALESCE(p.paid_amount, 0) AS paid_amount
     FROM acct_expenses e
     LEFT JOIN acct_branches b
       ON b.legal_business_id = e.legal_business_id
      AND b.division_id = e.division_id
      AND b.id = e.branch_id
     LEFT JOIN (
       SELECT
         legal_business_id,
         division_id,
         expense_id,
         SUM(amount) AS paid_amount
       FROM acct_expense_payments
       WHERE status = 'RECORDED'
       GROUP BY
         legal_business_id,
         division_id,
         expense_id
     ) p
       ON p.legal_business_id = e.legal_business_id
      AND p.division_id <=> e.division_id
      AND p.expense_id = e.id
     WHERE e.legal_business_id = ?
     ORDER BY e.expense_date DESC, e.id DESC
     LIMIT 100`,
    [businessId]
  );

  const totals = expenses.reduce(
    (acc, e) => {
      if (e.status !== "CONFIRMED") return acc;

      const amount = Number(e.amount);
      const paid = Number(e.paid_amount);

      acc.expenses += amount;
      acc.paid += paid;
      acc.pending += Math.max(0, amount - paid);

      return acc;
    },
    { expenses: 0, paid: 0, pending: 0 }
  );

  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <main style={{
      maxWidth: 1400,
      margin: "0 auto",
      padding: 24,
    }}>
      <h1>Expenses</h1>

      <nav style={{
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        marginBottom: 24,
      }}>
        <Link href="/accounting/account-balances">
          Account Balances
        </Link>
        <Link href="/accounting/invoices">
          Invoices
        </Link>
        <Link href="/accounting/purchase-management">
          Purchases
        </Link>
      </nav>

      {result && (
        <p role="status">
          {messages[result] ?? "Request processed."}
          {result === "created" && id
            ? ` Expense ID: ${id}`
            : ""}
        </p>
      )}

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 14,
        marginBottom: 30,
      }}>
        {[
          ["Confirmed Expenses", totals.expenses],
          ["Amount Paid", totals.paid],
          ["Pending Payment", totals.pending],
        ].map(([label, value]) => (
          <div key={String(label)} style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 18,
          }}>
            <div style={{ color: "#64748b" }}>
              {label}
            </div>
            <strong style={{ fontSize: 23 }}>
              ₹{inr(Number(value))}
            </strong>
          </div>
        ))}
      </section>

      <section style={{
        border: "1px solid #cbd5e1",
        borderRadius: 10,
        padding: 22,
        marginBottom: 32,
      }}>
        <h2>New Expense</h2>

        <form
          action={createExpenseAction}
          style={{ display: "grid", gap: 18 }}
        >
          <ExpenseAllocationFields
            branches={branches.map(branch => ({
              id: Number(branch.id),
              name: String(branch.branch_name),
            }))}
          />

          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}>
            <label>
              Expense Date
              <input
                type="date"
                name="expense_date"
                defaultValue={today}
                required
                style={fieldStyle}
              />
            </label>

            <label>
              Expense Category
              <select
                name="category"
                required
                defaultValue=""
                style={fieldStyle}
              >
                <option value="">Select Category</option>
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Expense Amount ₹
              <input
                type="number"
                name="amount"
                min="0.01"
                step="0.01"
                required
                style={fieldStyle}
              />
            </label>
          </div>

          <label>
            Description
            <input
              name="description"
              required
              maxLength={500}
              placeholder="Example: Monthly Kapra shop rent"
              style={fieldStyle}
            />
          </label>

          <ExpenseInitialPaymentFields
            banks={banks.map(b => ({
              id: Number(b.id),
              label:
                `${b.bank_name} — ${b.account_label} ` +
                `••••${b.account_number_last4}`,
              ownership: b.ownership_type,
            }))}
            cashAccounts={cashAccounts.map(c => ({
              id: Number(c.id),
              label: String(c.cash_name),
            }))}
            investors={investors.map(p => ({
              id: Number(p.id),
              name: String(p.full_name),
            }))}
            today={today}
          />

          <label>
            Remarks (Optional)
            <textarea
              name="remarks"
              rows={2}
              maxLength={500}
              style={fieldStyle}
            />
          </label>

          <div style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <button
              type="submit"
              name="mode"
              value="DRAFT"
              style={{ padding: "12px 20px" }}
            >
              Save Draft
            </button>

            <button
              type="submit"
              name="mode"
              value="CONFIRMED"
              style={{ padding: "12px 20px" }}
            >
              Confirm Expense
            </button>
          </div>
        </form>
      </section>

      <h2>Expense Register</h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
          <thead>
            <tr>
              {[
                "Expense No",
                "Date",
                "Allocation Level",
                "Branch",
                "Category",
                "Description",
                "Amount",
                "Paid",
                "Pending",
                "Payment Status",
                "Record Status",
                "Action",
              ].map(h => (
                <th key={h} style={cell}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {expenses.map(e => {
              const total = Number(e.amount);
              const paid = Number(e.paid_amount);
              const pending = Math.max(0, total - paid);

              const paymentStatus =
                e.status === "DRAFT" ? "DRAFT"
                : e.status === "VOID" ? "VOID"
                : paid <= 0 ? "UNPAID"
                : paid >= total ? "PAID"
                : "PARTIAL";

              return (
                <tr key={e.id}>
                  <td style={cell}>
                    <strong>{e.expense_no}</strong>
                  </td>
                  <td style={cell}>{e.expense_date}</td>
                  <td style={cell}>
                    {String(e.allocation_level)}
                  </td>
                  <td style={cell}>
                    {e.branch_name ??
                      (e.allocation_level === "GROUP"
                        ? "Group Level"
                        : "Division Level")}
                  </td>
                  <td style={cell}>
                    {String(e.category).replaceAll("_", " ")}
                  </td>
                  <td style={cell}>{e.description}</td>
                  <td style={cell}>₹{inr(total)}</td>
                  <td style={cell}>₹{inr(paid)}</td>
                  <td style={cell}>
                    ₹{inr(e.status === "CONFIRMED"
                      ? pending : 0)}
                  </td>
                  <td style={cell}>{paymentStatus}</td>
                  <td style={cell}>{e.status}</td>
                  <td style={cell}>
                    <Link href={`/accounting/expenses/${e.id}`}>
                      View / Add Payment
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expenses.length === 0 && (
        <p>No expenses have been recorded yet.</p>
      )}

      <p style={{
        color: "#64748b",
        fontSize: 12,
        marginTop: 20,
      }}>
        The summary covers the 100 most recent expense
        records.         Draft expenses do not affect confirmed totals.
        Initial payments are recorded with the expense;
        additional payments can be added from the register.
      </p>
    </main>
  );
}

export default function ExpensesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading expenses…</p>}>
      <ExpensesContent {...props} />
    </Suspense>
  );
}
