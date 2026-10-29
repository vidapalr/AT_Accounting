
import { Suspense } from "react";
import PrintHeader from "@/components/PrintHeader";
import BillWatermark from "@/components/BillWatermark";
import { TAGLINE } from "@/lib/brand";
import PrintButton from "@/components/PrintButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { receiveSalePaymentAction, giveBillDiscountAction } from "@/lib/sale-payment-actions";
import { canGiveBillDiscount } from "@/lib/access";
import ConfirmButton from "@/components/ConfirmButton";
import { setInvoiceMobileAction } from "@/lib/customer-merge-actions";
import { sendBillOnWhatsAppAction } from "@/lib/bill-share-actions";
import { normalizePhone } from "@/lib/whatsapp/core";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ pay?: string; mobile?: string; share?: string }>;
};

const PAY_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Payment saved." },
  invalid: { ok: false, text: "Check the amount, method and account." },
  "invalid-account": { ok: false, text: "That receiving account cannot be used." },
  "invalid-date": { ok: false, text: "The payment date cannot be before the invoice date." },
  "too-much": { ok: false, text: "That is more than the amount still due." },
  "not-posted": { ok: false, text: "Confirm the sale before taking payment." },
  "discount-ok": { ok: true, text: "Discount given. It counts as paid on this bill." },
  "discount-denied": { ok: false, text: "Only the owner or accountant can give a discount." },
  "discount-reason": { ok: false, text: "Write a short reason for the discount." },
  failed: { ok: false, text: "Could not save the payment. Please try again." },
};

const MOBILE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  saved: { ok: true, text: "Mobile number saved on this bill." },
  invalid: { ok: false, text: "Enter a 10 digit mobile number." },
  "not-allowed": { ok: false, text: "This bill can no longer be changed." },
  failed: { ok: false, text: "Could not save the number. Please try again." },
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

async function InvoiceDetails({ params, searchParams }: Props) {
  const user = await requireAccess("sales");
  const { id } = await params;
  const saleId = Number(id);

  if (!Number.isSafeInteger(saleId) || saleId <= 0) {
    notFound();
  }

  const businessId = user.legal_business_id;
  const query = await searchParams;
  const payResult = query?.pay;
  const mobileResult = query?.mobile;
  const shareResult = query?.share;

  const [headers] = await db.execute<RowDataPacket[]>(
    `SELECT
       s.id,
       s.invoice_no,
       DATE_FORMAT(s.invoice_date, '%Y-%m-%d')
         AS invoice_date,
       s.status,
       s.customer_name,
       s.customer_phone,
       s.customer_id,
       s.subtotal,
       s.discount_amount,
       s.grand_total,
       s.shipping_charge,
       s.remarks,
       b.branch_name
     FROM acct_sales_headers s
     JOIN acct_branches b
       ON b.legal_business_id = s.legal_business_id
      AND b.division_id = s.division_id
      AND b.id = s.branch_id
     WHERE s.legal_business_id = ?
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

  const [bankRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, bank_name, account_number_last4
       FROM acct_bank_accounts
      WHERE legal_business_id = ? AND status = 'ACTIVE'
        AND verification_status = 'VERIFIED' AND can_receive = 1
      ORDER BY bank_name, id`,
    [businessId]
  );
  const [cashRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, cash_name FROM acct_cash_accounts
      WHERE legal_business_id = ? AND status = 'ACTIVE'
      ORDER BY cash_name, id`,
    [businessId]
  );
  const today = new Date().toISOString().slice(0, 10);

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
      <BillWatermark />
      <PrintHeader title={`Invoice ${invoice.invoice_no}`} tagline={TAGLINE} />
      <nav className="no-print" style={{ marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
        <Link href="/accounting/invoices">
          ← All Invoices
        </Link>
        <PrintButton label="Print invoice" />
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
          <p>
            {invoice.customer_id ? (
              <Link href={`/accounting/customers/${invoice.customer_id}`}>
                {invoice.customer_name || "Customer"}
              </Link>
            ) : (
              invoice.customer_name || "Walk-in"
            )}
          </p>
          <p>{invoice.customer_phone || "No mobile"}</p>
          {["DRAFT", "POSTED"].includes(String(invoice.status)) && (
            <form action={setInvoiceMobileAction} className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input type="hidden" name="sale_id" value={invoice.id} />
              <input
                name="phone"
                inputMode="numeric"
                maxLength={20}
                placeholder="10 digit mobile"
                defaultValue={invoice.customer_phone ?? ""}
                aria-label="Mobile number"
                style={{ padding: "8px 10px", fontSize: 16, width: 170 }}
              />
              <button type="submit" className="btn-link btn-link-small" style={{ cursor: "pointer" }}>
                {invoice.customer_phone ? "Change mobile" : "Add mobile"}
              </button>
            </form>
          )}
          {invoice.status === "POSTED" && (
            <form action={sendBillOnWhatsAppAction} className="no-print" style={{ marginTop: 8 }}>
              <input type="hidden" name="sale_id" value={invoice.id} />
              <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "10px 18px" }}
                disabled={!normalizePhone(String(invoice.customer_phone ?? ""))}>
                Send bill on WhatsApp
              </button>
              {!normalizePhone(String(invoice.customer_phone ?? "")) && <span style={{ color: "#64748b" }}> Add a mobile number first.</span>}
            </form>
          )}
          {shareResult && <p role="status" className="no-print" style={{ color: "#b91c1c" }}>{shareResult.slice(0, 200)}</p>}
          {mobileResult && MOBILE_MESSAGES[mobileResult] && (
            <p role="status" className="no-print" style={{ color: MOBILE_MESSAGES[mobileResult].ok ? "#166534" : "#b91c1c" }}>
              {MOBILE_MESSAGES[mobileResult].text}
            </p>
          )}
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
        {Number(invoice.shipping_charge) > 0 && <p>Delivery: ₹{money(invoice.shipping_charge)}</p>}
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
                <td style={cell}>{payment.payment_method === "DISCOUNT" ? "Discount given" : payment.payment_method === "SET_OFF" ? "Set off (they sell to us too)" : payment.payment_method === "EXCHANGE" ? "Exchange credit (returned items)" : payment.payment_method}</td>
                <td style={cell}>
                  {payment.payment_method === "DISCOUNT" || payment.payment_method === "SET_OFF" || payment.payment_method === "EXCHANGE" ? "—" : (payment.account_name || "Not allocated")}
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

      {payResult && PAY_MESSAGES[payResult] && (
        <p
          role="status"
          className="no-print"
          style={{ color: PAY_MESSAGES[payResult].ok ? "#166534" : "#b91c1c", marginTop: 16 }}
        >
          {PAY_MESSAGES[payResult].text}
        </p>
      )}

      {invoice.status === "DRAFT" && (
        <p className="no-print" style={{ background: "#fff7ed", padding: 12, borderRadius: 8 }}>
          This bill is only a draft: stock has not moved and no payment can be taken yet.{" "}
          <a href={`/accounting/sales?edit=${invoice.id}`} className="btn-link btn-link-primary">
            Confirm sale
          </a>
        </p>
      )}

      {outstanding > 0 && (
        <p className="no-print" style={{ margin: "16px 0" }}>
          <a href="#take-payment" className="btn-link btn-link-primary">
            ₹{money(outstanding)} is still due. Take payment
          </a>
        </p>
      )}

      {outstanding > 0 && (
        <section
          id="take-payment"
          className="no-print"
          style={{
            marginTop: 24,
            padding: 18,
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Take payment (₹{money(outstanding)} still due)</h2>
          {cashRows.length + bankRows.length === 0 && (
            <p role="alert" style={{ color: "#b91c1c" }}>
              No cash or bank account is set up to receive money. Add one first (Setup, then Cash accounts or Bank accounts), then come back here.
            </p>
          )}
          <form
            action={receiveSalePaymentAction}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 14,
              alignItems: "end",
            }}
          >
            <input type="hidden" name="sale_id" value={invoice.id} />
            <label>
              Amount received (₹)
              <input
                name="amount"
                inputMode="decimal"
                defaultValue={outstanding.toFixed(2)}
                required
                style={{ width: "100%" }}
              />
            </label>
            <label>
              How did they pay?
              <select name="method" defaultValue="CASH" style={{ width: "100%" }}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
              </select>
            </label>
            <label>
              Money went into
              <select name="account" required style={{ width: "100%" }}>
                {cashRows.map(c => (
                  <option key={`c${c.id}`} value={`CASH:${c.id}`}>
                    Cash: {c.cash_name}
                  </option>
                ))}
                {bankRows.map(b => (
                  <option key={`b${b.id}`} value={`BANK:${b.id}`}>
                    Bank: {b.bank_name} ••••{b.account_number_last4}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                name="payment_date"
                defaultValue={today}
                min={invoice.invoice_date}
                required
                style={{ width: "100%" }}
              />
            </label>
            <label>
              Reference (optional)
              <input name="reference" maxLength={150} placeholder="UPI ref, cheque no." style={{ width: "100%" }} />
            </label>
            <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", justifyContent: "center" }}>
              Save payment
            </button>
          </form>
          <p style={{ color: "#64748b", marginBottom: 0 }}>
            Cash goes into a cash account, UPI, card and bank transfer into a bank account.
          </p>
          {canGiveBillDiscount(user.role) && (
            <form
              action={giveBillDiscountAction}
              style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, alignItems: "end" }}
            >
              <input type="hidden" name="sale_id" value={invoice.id} />
              <strong style={{ gridColumn: "1 / -1" }}>Customer is a little short? Give a discount to close this bill</strong>
              <label>
                Discount (₹)
                <input name="amount" inputMode="decimal" required placeholder="50" style={{ width: "100%" }} />
              </label>
              <label>
                Reason
                <input name="reason" required minLength={3} maxLength={250} placeholder="Customer short by 50" style={{ width: "100%" }} />
              </label>
              <ConfirmButton
                label="Give discount"
                question="Give this discount? It counts as paid on the bill and is shown as a discount in your reports."
                className="btn-link btn-link-primary"
              />
            </form>
          )}
        </section>
      )}

      <nav className="no-print" style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/accounting/returns">Return or refund</Link>
        <Link href="/accounting/sales">New sale</Link>
      </nav>
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
