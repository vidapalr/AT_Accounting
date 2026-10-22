
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

type Props = {
  params: Promise<{ id: string }>;
};

const money = (value: string | number) =>
  Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
};

async function InvoiceDetails({ params }: Props) {
  const user = await requireAccess("sales");
  const { id } = await params;
  const saleId = Number(id);

  if (!Number.isSafeInteger(saleId) || saleId <= 0) {
    notFound();
  }

  const businessId = user.legal_business_id;

  const [headers] = await db.execute<RowDataPacket[]>(
    `SELECT
       s.id,
       s.invoice_no,
       DATE_FORMAT(s.invoice_date, '%Y-%m-%d')
         AS invoice_date,
       s.status,
       s.customer_name,
       s.customer_phone,
       s.subtotal,
       s.discount_amount,
       s.grand_total,
       s.remarks,
       b.branch_name
     FROM acct_sales_headers s
     JOIN acct_branches b
       ON b.legal_business_id = s.legal_business_id
      AND b.division_id = s.division_id
      AND b.id = s.branch_id
     WHERE s.legal_business_id = ?
       AND s.division_id = 1
       AND s.id = ?`,
    [businessId, saleId]
  );

  if (headers.length !== 1) notFound();

  const invoice = headers[0];

  const [items] = await db.execute<RowDataPacket[]>(
    `SELECT
       sl.id,
       p.product_name,
       v.sku,
       v.size_label,
       v.color_name,
       v.unit_of_measure,
       sl.quantity,
       sl.unit_price,
       sl.discount_amount,
       sl.line_total,
       sl.minimum_selling_price,
       sl.price_override_reason
     FROM acct_sales_lines sl
     JOIN acct_product_variants v
       ON v.legal_business_id = sl.legal_business_id
      AND v.division_id = sl.division_id
      AND v.id = sl.variant_id
     JOIN acct_products p
       ON p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
      AND p.id = v.product_id
     WHERE sl.legal_business_id = ?
       AND sl.division_id = 1
       AND sl.sale_id = ?
     ORDER BY sl.id`,
    [businessId, saleId]
  );

  const [payments] = await db.execute<RowDataPacket[]>(
    `SELECT
       pay.id,
       DATE_FORMAT(pay.payment_date, '%Y-%m-%d')
         AS payment_date,
       pay.payment_method,
       pay.payment_account_type,
       pay.payment_account,
       pay.amount,
       pay.payment_reference,
       pay.status,
       pay.bank_account_id,
       pay.cash_account_id,
       CASE
         WHEN pay.bank_account_id IS NOT NULL
           THEN CONCAT(
             bank.bank_name,
             ' ••••',
             bank.account_number_last4
           )
         WHEN pay.cash_account_id IS NOT NULL
           THEN cash.cash_name
         ELSE NULL
       END AS account_name,
       bank.ownership_type AS bank_ownership
     FROM acct_sales_payments pay
     LEFT JOIN acct_bank_accounts bank
       ON bank.legal_business_id = pay.legal_business_id
      AND bank.id = pay.bank_account_id
     LEFT JOIN acct_cash_accounts cash
       ON cash.legal_business_id = pay.legal_business_id
      AND cash.id = pay.cash_account_id
     WHERE pay.legal_business_id = ?
       AND pay.division_id = 1
       AND pay.sale_id = ?
     ORDER BY pay.id`,
    [businessId, saleId]
  );

  const collected = payments
    .filter(p => p.status === "RECORDED")
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const total = Number(invoice.grand_total);
  const outstanding =
    invoice.status === "POSTED"
      ? Math.max(0, total - collected)
      : 0;

  const paymentStatus =
    invoice.status !== "POSTED"
      ? invoice.status
      : collected <= 0
        ? "UNPAID"
        : outstanding === 0
          ? "PAID"
          : "PARTIAL";

  return (
    <main style={{
      padding: 24,
      margin: "0 auto",
      maxWidth: 1100,
    }}>
      <nav style={{ marginBottom: 20 }}>
        <Link href="/accounting/invoices">
          ← All Invoices
        </Link>
      </nav>

      <h1>Invoice: {invoice.invoice_no}</h1>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 12,
        marginBottom: 28,
      }}>
        <div>
          <strong>Invoice Date</strong>
          <p>{invoice.invoice_date}</p>
        </div>
        <div>
          <strong>Branch</strong>
          <p>{invoice.branch_name}</p>
        </div>
        <div>
          <strong>Customer</strong>
          <p>{invoice.customer_name || "Walk-in"}</p>
          <p>{invoice.customer_phone || "No mobile"}</p>
        </div>
        <div>
          <strong>Status</strong>
          <p>{invoice.status} / {paymentStatus}</p>
        </div>
      </div>

      <h2>Invoice Items</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              {[
                "Product",
                "SKU",
                "Size / Colour",
                "Quantity",
                "Rate",
                "Discount",
                "Total",
              ].map(x => <th key={x} style={cell}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td style={cell}>{item.product_name}</td>
                <td style={cell}>{item.sku}</td>
                <td style={cell}>
                  {item.size_label || "—"}
                  {" / "}
                  {item.color_name || "—"}
                </td>
                <td style={cell}>
                  {Number(item.quantity)}{" "}
                  {item.unit_of_measure}
                </td>
                <td style={cell}>₹{money(item.unit_price)}</td>
                <td style={cell}>
                  ₹{money(item.discount_amount)}
                </td>
                <td style={cell}>₹{money(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={{
        marginTop: 24,
        maxWidth: 450,
        marginLeft: "auto",
      }}>
        <p>Subtotal: ₹{money(invoice.subtotal)}</p>
        <p>Discount: ₹{money(invoice.discount_amount)}</p>
        <h2>Invoice Total: ₹{money(total)}</h2>
      </section>

      <h2>Payment Details</h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr>
              {[
                "Date",
                "Method",
                "Receiving Account",
                "Amount",
                "Reference",
                "Status",
              ].map(x => <th key={x} style={cell}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {payments.map(payment => (
              <tr key={payment.id}>
                <td style={cell}>{payment.payment_date}</td>
                <td style={cell}>{payment.payment_method}</td>
                <td style={cell}>
                  {payment.account_name || "Not allocated"}
                  {payment.bank_ownership === "INVESTOR" &&
                    " (Investor account)"}
                </td>
                <td style={cell}>₹{money(payment.amount)}</td>
                <td style={cell}>
                  {payment.payment_reference || "—"}
                </td>
                <td style={cell}>{payment.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        marginTop: 24,
      }}>
        <div>
          <strong>Invoice Total</strong>
          <p>₹{money(total)}</p>
        </div>
        <div>
          <strong>Collected</strong>
          <p>₹{money(collected)}</p>
        </div>
        <div>
          <strong>Outstanding</strong>
          <p>₹{money(outstanding)}</p>
        </div>
      </div>

      {invoice.remarks && (
        <p>Remarks: {invoice.remarks}</p>
      )}

      <p style={{ marginTop: 24 }}>
        Refund, Return, Exchange and follow-up
        collection will be enabled through controlled
        transaction workflows.
      </p>
    </main>
  );
}

export default function InvoiceDetailsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading invoice…</p>}>
      <InvoiceDetails {...props} />
    </Suspense>
  );
}
