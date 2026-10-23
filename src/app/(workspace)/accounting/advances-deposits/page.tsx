
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import AdvanceEntryForm from
  "@/components/accounting/AdvanceEntryForm";

type Props = {
  searchParams: Promise<{
    result?: string;
    id?: string;
  }>;
};

function inr(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  whiteSpace: "nowrap",
};

async function Content({ searchParams }: Props) {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const { result, id } = await searchParams;

  const [branches] = await db.execute<RowDataPacket[]>(
    `SELECT id, branch_name
     FROM acct_branches
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY branch_name`,
    [businessId]
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

  const [advances] = await db.execute<RowDataPacket[]>(
    `SELECT
       a.id,
       a.advance_no,
       a.advance_type,
       a.recipient_name,
       a.description,
       a.original_amount,
       a.status,
       DATE_FORMAT(a.advance_date, '%Y-%m-%d')
         AS advance_date,

       COALESCE(SUM(
         CASE
           WHEN t.status = 'CONFIRMED'
            AND t.transaction_type = 'ADVANCE_PAID'
           THEN t.amount ELSE 0
         END
       ), 0) AS paid_amount,

       COALESCE(SUM(
         CASE
           WHEN t.status = 'CONFIRMED'
            AND t.transaction_type IN (
              'REFUND_RECEIVED',
              'EXPENSE_ADJUSTMENT',
              'SUPPLIER_ADJUSTMENT',
              'OTHER_ADJUSTMENT'
            )
           THEN t.amount ELSE 0
         END
       ), 0) AS recovered_amount

     FROM acct_advances a

     LEFT JOIN acct_advance_transactions t
       ON t.legal_business_id = a.legal_business_id
      AND t.advance_id = a.id

     WHERE a.legal_business_id = ?

     GROUP BY
       a.id, a.advance_no, a.advance_type,
       a.recipient_name, a.description,
       a.original_amount, a.status, a.advance_date

     ORDER BY a.id DESC
     LIMIT 200`,
    [businessId]
  );

  const totalPaid = advances.reduce(
    (sum, a) => sum + Number(a.paid_amount), 0
  );

  const totalRecovered = advances.reduce(
    (sum, a) => sum + Number(a.recovered_amount), 0
  );

  const outstanding = totalPaid - totalRecovered;

  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <main style={{
      maxWidth: 1450,
      margin: "0 auto",
      padding: 24,
    }}>
      <h1>Advances & Refundable Deposits</h1>
      <p>
        Track advances, original payments and outstanding
        recoverable amounts separately from expenses.
      </p>

      <nav style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        marginBottom: 24,
      }}>
        <Link href="/accounting/expenses">
          Expenses
        </Link>
        <Link href="/accounting/account-balances">
          Account Balances
        </Link>
      </nav>

      {result && (
        <p role="status">
          {result === "created"
            ? `Advance recorded successfully (ID ${id}).`
            : `Unable to record advance: ${result}`}
        </p>
      )}

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        marginBottom: 28,
      }}>
        {[
          ["Total Advances Paid", totalPaid],
          ["Refunded / Adjusted", totalRecovered],
          ["Outstanding Recoverable", outstanding],
        ].map(([label, value]) => (
          <div key={String(label)} style={{
            padding: 18,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
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

      <AdvanceEntryForm
        branches={branches.map(b => ({
          id: Number(b.id),
          name: String(b.branch_name),
        }))}
        banks={banks.map(b => ({
          id: Number(b.id),
          label:
            `${b.bank_name} — ${b.account_label} ` +
            `••••${b.account_number_last4}`,
          ownership: b.ownership_type,
        }))}
        cash={cash.map(c => ({
          id: Number(c.id),
          label: String(c.cash_name),
        }))}
        investors={investors.map(p => ({
          id: Number(p.id),
          name: String(p.full_name),
        }))}
        today={today}
      />

      <h2 style={{ marginTop: 36 }}>
        Advance & Deposit Register
      </h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
          <thead>
            <tr>
              {[
                "Advance No",
                "Date",
                "Type",
                "Recipient",
                "Original Amount",
                "Paid",
                "Refunded / Adjusted",
                "Outstanding",
                "Status",
              ].map(h => (
                <th key={h} style={cell}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {advances.map(a => {
              const paid = Number(a.paid_amount);
              const recovered = Number(a.recovered_amount);
              const balance = paid - recovered;

              return (
                <tr key={a.id}>
                  <td style={cell}>
                    <strong>{a.advance_no}</strong>
                  </td>
                  <td style={cell}>{a.advance_date}</td>
                  <td style={cell}>
                    {String(a.advance_type).replaceAll("_", " ")}
                  </td>
                  <td style={cell}>{a.recipient_name}</td>
                  <td style={cell}>
                    ₹{inr(a.original_amount)}
                  </td>
                  <td style={cell}>₹{inr(paid)}</td>
                  <td style={cell}>₹{inr(recovered)}</td>
                  <td style={cell}>
                    <strong>₹{inr(balance)}</strong>
                  </td>
                  <td style={cell}>{a.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {advances.length === 0 && (
        <p>No advances or deposits recorded yet.</p>
      )}
    </main>
  );
}

export default function AdvancesDepositsPage(props: Props) {
  return (
    <Suspense fallback={
      <p>Loading advances and deposits…</p>
    }>
      <Content {...props} />
    </Suspense>
  );
}
