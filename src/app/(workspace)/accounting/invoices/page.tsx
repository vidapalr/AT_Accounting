
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

type InvoiceRow = RowDataPacket & {
  id: number;
  invoice_no: string;
  invoice_date: string;
  customer_name: string | null;
  customer_phone: string | null;
  branch_name: string;
  status: "DRAFT" | "POSTED" | "VOID";
  grand_total: string;
  paid_amount: string;
  payment_types: string | null;
  payment_accounts: string | null;
};

type TotalsRow = RowDataPacket & {
  total_sales: string;
  total_paid: string;
  total_pending: string;
};

function inr(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function paidStatus(
  status: string,
  total: number,
  paid: number
): string {
  if (status === "DRAFT") return "DRAFT";
  if (status === "VOID") return "VOID";
  if (paid <= 0) return "UNPAID";
  if (paid >= total) return "PAID";
  return "PARTIAL";
}

const cell: React.CSSProperties = {
  padding: "11px 10px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  whiteSpace: "nowrap",
};

async function InvoiceList() {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;

  const [invoices] = await db.execute<InvoiceRow[]>(
    `SELECT
       s.id,
       s.invoice_no,
       DATE_FORMAT(
         s.invoice_date, '%Y-%m-%d'
       ) AS invoice_date,
       s.customer_name,
       s.customer_phone,
       b.branch_name,
       s.status,
       s.grand_total,
       COALESCE(pay.paid_amount, 0)
         AS paid_amount,
       pay.payment_types,
       pay.payment_accounts

     FROM acct_sales_headers s

     JOIN acct_branches b
       ON b.legal_business_id = s.legal_business_id
      AND b.division_id = s.division_id
      AND b.id = s.branch_id

     LEFT JOIN (
       SELECT
         pay.legal_business_id,
         pay.division_id,
         pay.sale_id,
         SUM(pay.amount) AS paid_amount,
         GROUP_CONCAT(
           DISTINCT pay.payment_method
           ORDER BY pay.payment_method
           SEPARATOR ', '
         ) AS payment_types,
         GROUP_CONCAT(
           DISTINCT
           CASE
             WHEN pay.bank_account_id IS NOT NULL
               THEN CONCAT(
                 bank.bank_name,
                 ' ••••',
                 bank.account_number_last4
               )
             WHEN pay.cash_account_id IS NOT NULL
               THEN cash.cash_name
             ELSE 'Not allocated'
           END
           SEPARATOR ', '
         ) AS payment_accounts
       FROM acct_sales_payments pay
       LEFT JOIN acct_bank_accounts bank
         ON bank.legal_business_id = pay.legal_business_id
        AND bank.id = pay.bank_account_id
       LEFT JOIN acct_cash_accounts cash
         ON cash.legal_business_id = pay.legal_business_id
        AND cash.id = pay.cash_account_id
       WHERE pay.status = 'RECORDED'
       GROUP BY
         pay.legal_business_id,
         pay.division_id,
         pay.sale_id
     ) pay
       ON pay.legal_business_id = s.legal_business_id
      AND pay.division_id = s.division_id
      AND pay.sale_id = s.id

     WHERE s.legal_business_id = ?

     ORDER BY s.invoice_date DESC, s.id DESC
     LIMIT 500`,
    [businessId]
  );

  const totals = invoices.reduce(
    (acc, invoice) => {
      if (invoice.status !== "POSTED") return acc;

      const total = Number(invoice.grand_total);
      const paid = Number(invoice.paid_amount);

      acc.total += total;
      acc.paid += paid;
      acc.pending += Math.max(0, total - paid);

      return acc;
    },
    { total: 0, paid: 0, pending: 0 }
  );

  return (
    <main style={{
      padding: 24,
      maxWidth: 1500,
      margin: "0 auto",
    }}>
      <h1>Invoices & Payments</h1>

      <p>
        View customer invoices, collected payments,
        outstanding amounts and payment methods.
      </p>

      <nav style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 18,
        marginBottom: 24,
      }}>
        <Link href="/accounting/sales">
          + New Invoice
        </Link>

        <Link href="/accounting/returns">
          Customer returns
        </Link>
      </nav>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 14,
        marginBottom: 28,
      }}>
        {[
          ["Total Sales", totals.total],
          ["Paid Amount", totals.paid],
          ["Pending Amount", totals.pending],
        ].map(([label, amount]) => (
          <div key={String(label)} style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 18,
          }}>
            <div>{label}</div>
            <strong style={{ fontSize: 24 }}>
              ₹{inr(Number(amount))}
            </strong>
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}>
          <thead>
            <tr>
              {[
                "Inv No",
                "Inv Name",
                "Date",
                "Branch",
                "Inv Total",
                "Inv Paid Amount",
                "Inv Pending Amount",
                "Inv Paid Status",
                "Payment Types",
                "Payment Account",
                "Action",
              ].map(title => (
                <th key={title} style={cell}>
                  {title}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {invoices.map(invoice => {
              const total = Number(invoice.grand_total);
              const paid = Number(invoice.paid_amount);
              const pending = Math.max(0, total - paid);

              return (
                <tr key={invoice.id}>
                  <td style={cell}>
                    <strong>{invoice.invoice_no}</strong>
                  </td>

                  <td style={cell}>
                    {invoice.customer_name || "Walk-in"}
                  </td>

                  <td style={cell}>{invoice.invoice_date}</td>

                  <td style={cell}>{invoice.branch_name}</td>

                  <td style={cell}>₹{inr(total)}</td>

                  <td style={cell}>₹{inr(paid)}</td>

                  <td style={cell}>
                    ₹{inr(invoice.status === "POSTED"
                      ? pending
                      : 0)}
                  </td>

                  <td style={cell}>
                    {paidStatus(invoice.status, total, paid)}
                  </td>

                  <td style={cell}>
                    {invoice.payment_types ?? "—"}
                  </td>

                  <td style={cell}>
                    {invoice.payment_accounts ?? "—"}
                  </td>

                  <td style={cell}>
                    <Link
                      className="btn-link btn-link-small"
                      href={`/accounting/sales/${invoice.id}`}
                    >
                      View
                    </Link>
                    {" "}
                    <span title="Refund workflow pending">
                      Refund
                    </span>
                    {" · "}
                    <span title="Return workflow pending">
                      Return
                    </span>
                    {" · "}
                    <span title="Exchange workflow pending">
                      Exchange
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {invoices.length === 0 && (
        <p>No sales invoices have been recorded.</p>
      )}

      <p style={{
        color: "#64748b",
        fontSize: 12,
        marginTop: 20,
      }}>
        Showing up to 500 latest invoices.
        Summary totals cover displayed posted invoices only.
        Receiving bank/cash allocation and refund,
        return and exchange actions will be enabled
        after their respective workflows are implemented.
      </p>
    </main>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<p>Loading invoices...</p>}>
      <InvoiceList />
    </Suspense>
  );
}
