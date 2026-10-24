
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { billCreditSql } from "@/lib/supplier-ledger";
import {
  createPurchasePaymentDraftAction,
} from "@/lib/purchase-payment-actions";

import {
  verifyPurchasePaymentAction,
} from "@/lib/purchase-payment-verification-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
};

interface Bank extends RowDataPacket {
  id: number;
  account_label: string;
  bank_name: string;
  ownership_type: string;
  cutover_treatment: string;
  journal_entry_id: number | null;
  evidence_reference: string | null;
  funding_party_id: number | null;
}

interface Cash extends RowDataPacket {
  id: number;
  cash_name: string;
}

interface Party extends RowDataPacket {
  id: number;
  full_name: string;
}

interface Agreement extends RowDataPacket {
  id: number;
  agreement_no: string;
  party_id: number;
}

interface Payment extends RowDataPacket {
  id: number;
  payment_no: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  payment_source: string;
  funding_treatment: string;
  payment_reference: string | null;
  payer_name: string | null;
  cutover_treatment: string | null;
  journal_entry_id: number | null;
  evidence_reference: string | null;
  status: string;
}

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  marginTop: 6,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const card: React.CSSProperties = {
  padding: 20,
  marginTop: 20,
  border: "1px solid #e2e8f0",
  borderRadius: 10,
};

const cell: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
};

function paise(value: unknown): bigint {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

function rupees(n: bigint): string {
  const sign = n < 0n ? "-" : "";
  const x = n < 0n ? -n : n;
  return `${sign}₹${x / 100n}.${String(x % 100n).padStart(2, "0")}`;
}

const messages: Record<string, string> = {
  created: "Purchase payment draft saved.",
  invalid: "Check the payment details and account selection.",
  "purchase-not-found": "Purchase not found.",
  "purchase-not-posted": "Post the goods receipt first.",
  "source-invalid": "Payment source, investor or agreement is not valid.",
  "amount-exceeds-balance": "Payment exceeds the unallocated purchase amount.",
  "duplicate-reference": "A payment with this reference already exists.",
  verified: "Payment verified successfully. No GL journal has been posted.",
  "verification-invalid":
    "Select a valid payment and confirm verification.",
  "business-not-found": "The legal business was not found.",
  "payment-not-found": "The selected payment was not found.",
  "payment-not-draft": "Only draft payments can be verified.",
  "cutover-required":
    "Configure the accounting opening date before verifying payments.",
  "amount-invalid":
    "Payment amount exceeds the allowed purchase balance.",
  "verification-conflict":
    "The payment could not be verified because its status changed.",
  failed: "Payment could not be saved. Check server logs.",
};

async function PaymentContent({ params, searchParams }: Props) {
  const user = await requireAccess("purchases");
  const { id } = await params;
  const query = await searchParams;

  if (!/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id))) notFound();

  const purchaseId = Number(id);
  const businessId = user.legal_business_id;

  const [purchases] = await db.execute<RowDataPacket[]>(
    `SELECT
       h.id, h.purchase_no, h.status,
       s.supplier_name,
       DATE_FORMAT(h.invoice_date, '%Y-%m-%d') AS invoice_date,
       CAST(COALESCE((
         SELECT SUM(l.line_amount)
         FROM acct_purchase_lines l
         WHERE l.legal_business_id = h.legal_business_id
           AND l.division_id = h.division_id
           AND l.purchase_id = h.id
       ), 0) - ${billCreditSql("h")} AS CHAR) AS total_amount,
       CAST(${billCreditSql("h")} AS CHAR) AS returned_credit
     FROM acct_purchase_headers h
     JOIN acct_suppliers s
       ON s.id = h.supplier_id
      AND s.legal_business_id = h.legal_business_id
     WHERE h.id = ?
       AND h.legal_business_id = ?`,
    [purchaseId, businessId]
  );

  const purchase = purchases[0];
  if (!purchase) notFound();

  const [banks] = await db.execute<Bank[]>(
    `SELECT id, account_label, bank_name,
            ownership_type, funding_party_id
     FROM acct_bank_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY ownership_type, account_label`,
    [businessId]
  );

  const [cashAccounts] = await db.execute<Cash[]>(
    `SELECT id, cash_name
     FROM acct_cash_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY cash_name`,
    [businessId]
  );

  const [parties] = await db.execute<Party[]>(
    `SELECT id, full_name
     FROM acct_funding_parties
     WHERE legal_business_id = ?
     ORDER BY full_name`,
    [businessId]
  );

  const [agreements] = await db.execute<Agreement[]>(
    `SELECT id, agreement_no, party_id
     FROM acct_funding_agreements
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
       AND branch_id IS NULL
     ORDER BY agreement_no`,
    [businessId]
  );

  const [payments] = await db.execute<Payment[]>(
    `SELECT
       id,
       payment_no,
       DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date,
       CAST(amount AS CHAR) AS amount,
       payment_method,
       payment_source,
       funding_treatment,
       cutover_treatment,
       journal_entry_id,
       evidence_reference,
       payment_reference,
       payer_name,
       status
     FROM acct_purchase_payments
     WHERE legal_business_id = ?
       AND purchase_id = ?
     ORDER BY id DESC`,
    [businessId, purchaseId]
  );

  const total = paise(purchase.total_amount);

  const verified = payments
    .filter(p => p.status === "VERIFIED")
    .reduce((sum, p) => sum + paise(p.amount), 0n);

  const drafts = payments
    .filter(p => p.status === "DRAFT")
    .reduce((sum, p) => sum + paise(p.amount), 0n);

  const returnedCredit = paise(String(purchase.returned_credit ?? "0"));
  const supplierOwesUs = verified > total ? verified - total : 0n;
  const actualOutstanding = total > verified ? total - verified : 0n;

  const paymentStatus =
    verified === 0n
      ? "UNPAID"
      : actualOutstanding <= 0n
        ? "PAID"
        : "PARTIALLY PAID";

  const remaining = total > verified + drafts ? total - verified - drafts : 0n;

  return (
    <main style={{
      maxWidth: 1300,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link className="btn-link" href={`/accounting/purchases/${purchaseId}`}>
        ← Purchase Details
      </Link>

      <h1>Purchase Payments</h1>

      <p>
        {purchase.purchase_no} — {purchase.supplier_name}
        {" · "}
        Goods receipt: <strong>{purchase.status}</strong>
      </p>

      {query.result && (
        <p role="status" style={card}>
          {messages[query.result] ?? "Request processed."}
        </p>
      )}

      <section style={card}>
        <h2>Payment Summary</h2>

        <p>
          Payment Status:{" "}
          <strong>{paymentStatus}</strong>
        </p>

        <table>
          <tbody>
            <tr>
              <td style={cell}>Purchase Total</td>
              <td style={cell}>{rupees(total)}</td>
            </tr>

            {returnedCredit > 0n && (
              <tr>
                <td style={cell}>Includes goods returned to supplier</td>
                <td style={cell}>{rupees(returnedCredit)} taken off the bill</td>
              </tr>
            )}

            <tr>
              <td style={cell}>Amount Paid</td>
              <td style={cell}>{rupees(verified)}</td>
            </tr>

            <tr>
              <td style={cell}>Pending Confirmation</td>
              <td style={cell}>{rupees(drafts)}</td>
            </tr>

            <tr>
              <td style={cell}>
                <strong>Supplier Outstanding</strong>
              </td>
              <td style={cell}>
                <strong>{rupees(actualOutstanding)}</strong>
              </td>
            </tr>

            {supplierOwesUs > 0n && (
              <tr>
                <td style={cell}>
                  <strong>Supplier owes you</strong>
                </td>
                <td style={cell}>
                  <strong>{rupees(supplierOwesUs)}</strong>{" "}
                  <Link href="/accounting/supplier-statement">See supplier statement</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={card}>
        <h2>Record Purchase Payment</h2>

        {purchase.status !== "POSTED" ? (
          <p>Post the Goods Receipt before entering payments.</p>
        ) : remaining <= 0n ? (
          <p>No unallocated amount remains for a new payment draft.</p>
        ) : (
          <form action={createPurchasePaymentDraftAction}>
            <input type="hidden" name="purchase_id" value={purchaseId}/>

            <div style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 16,
            }}>
              <label>
                Payment Date
                <input type="date" name="payment_date" required style={input}/>
              </label>

              <label>
                Amount (₹)
                <input name="amount" required inputMode="decimal"
                       placeholder="10000.00" style={input}/>
              </label>

              <label>
                Payment Method
                <select name="payment_method" required defaultValue="" style={input}>
                  <option value="">Select Method</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>

              <label>
                Paid From / Payment Source
                <select name="payment_source" required defaultValue="" style={input}>
                  <option value="">Select Source</option>
                  <option value="BUSINESS_BANK">Abhiram Group Bank</option>
                  <option value="BUSINESS_CASH">Abhiram Group Cash</option>
                  <option value="INVESTOR_BANK">Investor Bank</option>
                  <option value="INVESTOR_CASH">Investor Cash</option>
                  <option value="OWNER_PERSONAL">Owner Personal Funds</option>
                </select>
              </label>

              <label>
                Bank Account
                <select name="source_bank_account_id" defaultValue="" style={input}>
                  <option value="">Not Applicable</option>
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.ownership_type} — {b.bank_name} / {b.account_label}
                      {b.funding_party_id
                        ? ` (Investor ${b.funding_party_id})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Business Cash Account
                <select name="source_cash_account_id" defaultValue="" style={input}>
                  <option value="">Not Applicable</option>
                  {cashAccounts.map(c => (
                    <option key={c.id} value={c.id}>{c.cash_name}</option>
                  ))}
                </select>
              </label>

              <label>
                Investor
                <select name="funding_party_id" defaultValue="" style={input}>
                  <option value="">Not Applicable</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </label>

              <label>
                Investor Agreement
                <select name="funding_agreement_id" defaultValue="" style={input}>
                  <option value="">None — Temporary Advance</option>
                  {agreements.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.agreement_no}
                      {" (Investor "}{a.party_id}{")"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Payer Name
                <input name="payer_name" maxLength={160}
                       placeholder="Required for owner personal payment"
                       style={input}/>
              </label>

              <label>
                UTR / Cheque / Receipt Reference
                <input name="payment_reference" maxLength={120} style={input}/>
              </label>

              <label>
                Evidence Reference
                <input name="evidence_reference" maxLength={255}
                       placeholder="Bank statement or receipt reference"
                       style={input}/>
              </label>

              <label style={{gridColumn:"1 / -1"}}>
                Remarks
                <textarea name="remarks" maxLength={500} rows={3} style={input}/>
              </label>
            </div>

            <p>
              Choose only the account relevant to the selected payment
              source. For investor payments, select the investor and
              optionally an agreement. Without an agreement, the
              transaction is treated as a temporary advance.
            </p>

            <button type="submit"
                    style={{padding:"12px 20px",marginTop:14}}>
              Save Payment Draft
            </button>
          </form>
        )}
      </section>

      <section style={card}>
        <h2>Payment History &amp; Verification</h2>

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
                  "Payment No",
                  "Date",
                  "Amount",
                  "Source",
                  "Funding Treatment",
                  "Cutover",
                  "Evidence",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading} style={cell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td style={cell}>
                    {payment.payment_no}
                  </td>

                  <td style={cell}>
                    {payment.payment_date}
                  </td>

                  <td style={cell}>
                    {rupees(paise(payment.amount))}
                  </td>

                  <td style={cell}>
                    {payment.payment_source}
                  </td>

                  <td style={cell}>
                    {payment.funding_treatment}
                  </td>

                  <td style={cell}>
                    {payment.cutover_treatment ?? "—"}
                  </td>

                  <td style={cell}>
                    {payment.evidence_reference ?? "Not supplied"}
                  </td>

                  <td style={cell}>
                    <strong>{payment.status}</strong>
                    {payment.journal_entry_id !== null && (
                      <div>
                        Journal #{payment.journal_entry_id}
                      </div>
                    )}
                  </td>

                  <td style={cell}>
                    {payment.status === "DRAFT" ? (
                      <form action={verifyPurchasePaymentAction}>
                        <input
                          type="hidden"
                          name="purchase_id"
                          value={purchaseId}
                        />

                        <input
                          type="hidden"
                          name="payment_id"
                          value={payment.id}
                        />

                        <label style={{ display: "block" }}>
                          <input
                            type="checkbox"
                            name="confirm"
                            value="VERIFY_PAYMENT"
                            required
                          />
                          {" "}
                          I confirm this amount was actually paid
                        </label>

                        <button
                          type="submit"
                          style={{
                            padding: "9px 12px",
                            marginTop: 8,
                          }}
                        >
                          Confirm Payment
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}

              {payments.length === 0 && (
                <tr>
                  <td colSpan={9} style={cell}>
                    No supplier payments recorded for this purchase.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p>
          Verifying a payment confirms its supporting record
          and reduces the supplier&apos;s operational outstanding
          balance. It does not immediately post to the GL.
        </p>
      </section>
    </main>
  );
}

export default function PurchasePaymentsPage(props: Props) {
  return (
    <Suspense fallback={<main style={{padding:24}}>Loading purchase payments…</main>}>
      <PaymentContent {...props}/>
    </Suspense>
  );
}
