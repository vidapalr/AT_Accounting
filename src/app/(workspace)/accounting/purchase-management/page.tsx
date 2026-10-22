
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  createPurchasePaymentDraftAction,
} from "@/lib/purchase-payment-actions";
import {
  verifyPurchasePaymentAction,
} from "@/lib/purchase-payment-verification-actions";
import styles from "./purchase-management.module.css";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

interface PurchaseRow extends RowDataPacket {
  id: number;
  purchase_no: string;
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  invoice_date: string;
  received_date: string | null;
  status: string;
  invoice_total: string;
  amount_paid: string;
  draft_amount: string;
  payment_sources: string | null;
  draft_payment_id: number | null;
  draft_payment_no: string | null;
}

interface InventoryRow extends RowDataPacket {
  unit_of_measure: string;
  total_quantity: string;
}

interface BankRow extends RowDataPacket {
  id: number;
  account_label: string;
  bank_name: string;
  ownership_type: string;
  funding_party_id: number | null;
}

interface CashRow extends RowDataPacket {
  id: number;
  cash_name: string;
}

interface PartyRow extends RowDataPacket {
  id: number;
  full_name: string;
}

interface AgreementRow extends RowDataPacket {
  id: number;
  agreement_no: string;
  party_id: number;
}

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 9,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  marginTop: 5,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 14,
};

function paise(value: string): bigint {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  return `${negative ? "-" : ""}₹${
    (absolute / 100n).toLocaleString("en-IN")
  }.${String(absolute % 100n).padStart(2, "0")}`;
}

function status(total: bigint, paid: bigint) {
  if (paid <= 0n) return "UNPAID";
  if (paid >= total) return "PAID";
  return "PARTIALLY PAID";
}

const messages: Record<string, string> = {
  created: "Payment draft saved. Confirm the payment below.",
  verified: "Supplier payment confirmed successfully.",
  invalid: "Check the payment details.",
  "source-invalid": "Select a valid source account or investor.",
  "amount-exceeds-balance": "Payment exceeds the available amount.",
  "duplicate-reference": "This payment reference is already recorded.",
  "cutover-required": "Accounting opening date is required.",
  "amount-invalid": "Payment amount validation failed.",
  failed: "Unable to process the payment. Check server logs.",
};

async function PurchaseManagementContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const [purchases] = await db.execute<PurchaseRow[]>(
    `SELECT
       h.id,
       h.purchase_no,
       s.id AS supplier_id,
       s.supplier_code,
       s.supplier_name,
       DATE_FORMAT(h.invoice_date, '%Y-%m-%d')
         AS invoice_date,
       DATE_FORMAT(h.received_date, '%Y-%m-%d')
         AS received_date,
       h.status,

       CAST(COALESCE((
         SELECT SUM(l.line_amount)
         FROM acct_purchase_lines l
         WHERE l.legal_business_id = h.legal_business_id
           AND l.division_id = h.division_id
           AND l.purchase_id = h.id
       ), 0) AS CHAR) AS invoice_total,

       CAST(COALESCE((
         SELECT SUM(pp.amount)
         FROM acct_purchase_payments pp
         WHERE pp.legal_business_id = h.legal_business_id
           AND pp.division_id = h.division_id
           AND pp.purchase_id = h.id
           AND pp.status = 'VERIFIED'
       ), 0) AS CHAR) AS amount_paid,

       CAST(COALESCE((
         SELECT SUM(pp.amount)
         FROM acct_purchase_payments pp
         WHERE pp.legal_business_id = h.legal_business_id
           AND pp.division_id = h.division_id
           AND pp.purchase_id = h.id
           AND pp.status = 'DRAFT'
       ), 0) AS CHAR) AS draft_amount,

       (
         SELECT GROUP_CONCAT(
           DISTINCT CASE pp.payment_source
             WHEN 'BUSINESS_BANK' THEN 'Group Bank'
             WHEN 'BUSINESS_CASH' THEN 'Group Cash'
             WHEN 'INVESTOR_BANK' THEN CONCAT(
               'Investor Bank — ',
               COALESCE(fp.full_name, 'Investor')
             )
             WHEN 'INVESTOR_CASH' THEN CONCAT(
               'Investor Cash — ',
               COALESCE(fp.full_name, 'Investor')
             )
             WHEN 'OWNER_PERSONAL' THEN 'Owner Personal'
             ELSE pp.payment_source
           END
           SEPARATOR ' · '
         )
         FROM acct_purchase_payments pp
         LEFT JOIN acct_funding_parties fp
           ON fp.id = pp.funding_party_id
          AND fp.legal_business_id = pp.legal_business_id
         WHERE pp.legal_business_id = h.legal_business_id
           AND pp.division_id = h.division_id
           AND pp.purchase_id = h.id
           AND pp.status = 'VERIFIED'
       ) AS payment_sources,

       (
         SELECT MIN(pp.id)
         FROM acct_purchase_payments pp
         WHERE pp.legal_business_id = h.legal_business_id
           AND pp.division_id = h.division_id
           AND pp.purchase_id = h.id
           AND pp.status = 'DRAFT'
       ) AS draft_payment_id,

       (
         SELECT MIN(pp.payment_no)
         FROM acct_purchase_payments pp
         WHERE pp.legal_business_id = h.legal_business_id
           AND pp.division_id = h.division_id
           AND pp.purchase_id = h.id
           AND pp.status = 'DRAFT'
       ) AS draft_payment_no

     FROM acct_purchase_headers h
     JOIN acct_suppliers s
       ON s.id = h.supplier_id
      AND s.legal_business_id = h.legal_business_id
     WHERE h.legal_business_id = ?
       AND h.division_id = 1
       AND h.status IN ('DRAFT', 'POSTED')
     ORDER BY h.invoice_date DESC, h.id DESC`,
    [businessId]
  );

  const [inventory] = await db.execute<InventoryRow[]>(
    `SELECT
       v.unit_of_measure,
       CAST(SUM(l.quantity) AS CHAR) AS total_quantity
     FROM acct_purchase_headers h
     JOIN acct_purchase_lines l
       ON l.purchase_id = h.id
      AND l.legal_business_id = h.legal_business_id
      AND l.division_id = h.division_id
     JOIN acct_product_variants v
       ON v.id = l.variant_id
      AND v.legal_business_id = l.legal_business_id
      AND v.division_id = l.division_id
     WHERE h.legal_business_id = ?
       AND h.division_id = 1
       AND h.status = 'POSTED'
     GROUP BY v.unit_of_measure
     ORDER BY v.unit_of_measure`,
    [businessId]
  );

  const [banks] = await db.execute<BankRow[]>(
    `SELECT id, account_label, bank_name,
            ownership_type, funding_party_id
     FROM acct_bank_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY ownership_type, bank_name`,
    [businessId]
  );

  const [cashAccounts] = await db.execute<CashRow[]>(
    `SELECT id, cash_name
     FROM acct_cash_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY cash_name`,
    [businessId]
  );

  const [parties] = await db.execute<PartyRow[]>(
    `SELECT id, full_name
     FROM acct_funding_parties
     WHERE legal_business_id = ?
     ORDER BY full_name`,
    [businessId]
  );

  const [agreements] = await db.execute<AgreementRow[]>(
    `SELECT id, agreement_no, party_id
     FROM acct_funding_agreements
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
       AND branch_id IS NULL
       AND (division_id IS NULL OR division_id = 1)
     ORDER BY agreement_no`,
    [businessId]
  );

  const totalPurchases = purchases.reduce(
    (sum, p) => p.status === "POSTED"
      ? sum + paise(p.invoice_total)
      : sum,
    0n
  );

  const totalPaid = purchases.reduce(
    (sum, p) => p.status === "POSTED"
      ? sum + paise(p.amount_paid)
      : sum,
    0n
  );

  const pending = totalPurchases - totalPaid;

  const inventoryDisplay = inventory.length
    ? inventory
        .map(
          (r) => `${r.total_quantity} ${r.unit_of_measure}`
        )
        .join(" · ")
    : "0";

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Purchases · Accounts payable</p>
          <h1>Purchase Management</h1>
          <p className={styles.description}>
            Track goods receipts, supplier payments and outstanding balances.
          </p>
        </div>

        <Link
          className={styles.primaryLink}
          href="/accounting/purchases"
        >
          + New Purchase
        </Link>
      </header>

      {query.result && (
        <p role="status" className={styles.notice}>
          {messages[query.result] ??
            "Request processed. Review payment status."}
        </p>
      )}

      <div className={styles.summaryGrid}>
        {[
          {
            label: "Total Purchased Inventory",
            value: inventoryDisplay,
          },
          {
            label: "Total Purchase Amount",
            value: money(totalPurchases),
          },
          {
            label: "Total Paid",
            value: money(totalPaid),
          },
          {
            label: "Total Pending",
            value: money(pending),
          },
        ].map((item) => (
          <div key={item.label} className={styles.summaryCard}>
            <div className={styles.summaryLabel}>
              {item.label}
            </div>
            <h2>
              {item.value}
            </h2>
          </div>
        ))}
      </div>

      <section className={styles.register}>
        <div className={styles.registerHeader}>
          <div>
            <h2>Purchase Register</h2>
            <p>View invoices, goods receipt status and payment activity.</p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {[
                  "Supplier ID",
                  "Supplier Name",
                  "Invoice ID",
                  "Invoice Date",
                  "Goods Status",
                  "Payment Status",
                  "Payment Type",
                  "Payment Amount",
                  "Action",
                ].map((heading) => (
                  <th key={heading} className={styles.tableHeading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {purchases.map((purchase) => {
                const total = paise(purchase.invoice_total);
                const paid = paise(purchase.amount_paid);
                const draft = paise(purchase.draft_amount);
                const outstanding = total - paid;
                const available = outstanding - draft;

                return (
                  <tr key={purchase.id} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      {purchase.supplier_code}
                    </td>

                    <td className={styles.tableCell}>
                      <strong>{purchase.supplier_name}</strong>
                    </td>

                    <td className={styles.tableCell}>
                      <Link href={
                        `/accounting/purchases/${purchase.id}`
                      }>
                        {purchase.purchase_no}
                      </Link>
                      <div className={styles.secondaryText}>
                        Invoice: {money(total)}
                      </div>
                    </td>

                    <td className={styles.tableCell}>
                      {purchase.invoice_date}
                    </td>

                    <td className={styles.tableCell}>
                      {purchase.status === "POSTED" ? (
                        <span className={`${styles.badge} ${styles.received}`}>
                          Received
                        </span>
                      ) : (
                        <>
                          <span className={`${styles.badge} ${styles.notReceived}`}>
                            Not received
                          </span>
                          <Link
                            className={styles.smallLink}
                            href={`/accounting/purchases/${purchase.id}`}
                          >
                            Record goods receipt
                          </Link>
                        </>
                      )}
                      {purchase.received_date && (
                        <div className={styles.secondaryText}>
                          {purchase.received_date}
                        </div>
                      )}
                    </td>

                    <td className={styles.tableCell}>
                      <strong>{status(total, paid)}</strong>
                      {draft > 0n && (
                        <div className={styles.secondaryText}>
                          Pending confirmation: {money(draft)}
                        </div>
                      )}

                      <div className={styles.secondaryText}>
                        Due: {money(outstanding)}
                      </div>
                    </td>

                    <td className={styles.tableCell}>
                      {purchase.payment_sources ?? "CREDIT / NOT PAID"}
                    </td>

                    <td className={styles.tableCell}>
                      {money(paid)}
                    </td>

                    <td className={styles.tableCell}>
                      <details>
                        <summary className={styles.actionSummary}>
                          {purchase.status !== "POSTED"
                            ? "Receive Goods"
                            : available > 0n
                              ? "Record Payment"
                              : draft > 0n
                                ? "Confirm Payment"
                                : "View"}
                        </summary>

                        <div className={styles.actionPanel}>
                          <p>
                            <Link href={
                              `/accounting/purchases/${purchase.id}`
                            }>
                              View Invoice
                            </Link>
                          </p>

                          <p>
                            Goods Received:{" "}
                            <strong>
                              {purchase.status === "POSTED"
                                ? `Received${purchase.received_date
                                  ? ` on ${purchase.received_date}`
                                  : ""}`
                                : "Not received"}
                            </strong>
                          </p>

                          {purchase.status === "DRAFT" && (
                            <p>
                              <Link href={
                                `/accounting/purchases/${purchase.id}`
                              }>
                                Update status / record goods receipt
                              </Link>
                            </p>
                          )}

                          {purchase.status === "POSTED" && (
                            <>
                          <p>
                            <strong>Invoice:</strong>{" "}
                            {purchase.purchase_no}
                          </p>

                          <p>
                            Total: {money(total)}
                            {" · "}
                            Paid: {money(paid)}
                            {" · "}
                            Outstanding: {money(outstanding)}
                          </p>

                          {purchase.draft_payment_id !== null && (
                            <form action={
                              verifyPurchasePaymentAction
                            }>
                              <input
                                type="hidden"
                                name="purchase_id"
                                value={purchase.id}
                              />
                              <input
                                type="hidden"
                                name="payment_id"
                                value={purchase.draft_payment_id}
                              />
                              <input
                                type="hidden"
                                name="return_to"
                                value="purchase-management"
                              />
                              <label>
                                <input
                                  type="checkbox"
                                  name="confirm"
                                  value="VERIFY_PAYMENT"
                                  required
                                />
                                {" "}I confirm this payment was made
                              </label>
                              <div style={{marginTop:8}}>
                                <button type="submit">
                                  Confirm Pending Payment
                                </button>
                              </div>
                            </form>
                          )}

                          {available > 0n && (
                            <form action={
                              createPurchasePaymentDraftAction
                            }>
                              <input
                                type="hidden"
                                name="purchase_id"
                                value={purchase.id}
                              />
                              <input
                                type="hidden"
                                name="return_to"
                                value="purchase-management"
                              />

                              <h3>Record Payment</h3>

                              <div style={grid}>
                                <label>
                                  Payment Date
                                  <input
                                    type="date"
                                    name="payment_date"
                                    required
                                    style={input}
                                  />
                                </label>

                                <label>
                                  Amount (₹)
                                  <input
                                    name="amount"
                                    inputMode="decimal"
                                    placeholder="Amount paid"
                                    required
                                    style={input}
                                  />
                                </label>

                                <label>
                                  Payment Method
                                  <select
                                    name="payment_method"
                                    required
                                    defaultValue=""
                                    style={input}
                                  >
                                    <option value="">
                                      Select Method
                                    </option>
                                    <option value="BANK_TRANSFER">
                                      Bank Transfer
                                    </option>
                                    <option value="UPI">UPI</option>
                                    <option value="CASH">Cash</option>
                                    <option value="CHEQUE">Cheque</option>
                                    <option value="OTHER">Other</option>
                                  </select>
                                </label>

                                <label>
                                  Payment Source
                                  <select
                                    name="payment_source"
                                    required
                                    defaultValue=""
                                    style={input}
                                  >
                                    <option value="">
                                      Select Source
                                    </option>
                                    <option value="BUSINESS_BANK">
                                      Group Bank
                                    </option>
                                    <option value="BUSINESS_CASH">
                                      Group Cash
                                    </option>
                                    <option value="INVESTOR_BANK">
                                      Investor Bank
                                    </option>
                                    <option value="INVESTOR_CASH">
                                      Investor Cash
                                    </option>
                                    <option value="OWNER_PERSONAL">
                                      Owner Personal
                                    </option>
                                  </select>
                                </label>

                                <label>
                                  Bank Account
                                  <select
                                    name="source_bank_account_id"
                                    defaultValue=""
                                    style={input}
                                  >
                                    <option value="">
                                      Not Applicable
                                    </option>
                                    {banks.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        {b.ownership_type}
                                        {" — "}
                                        {b.bank_name}
                                        {" / "}
                                        {b.account_label}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Business Cash Account
                                  <select
                                    name="source_cash_account_id"
                                    defaultValue=""
                                    style={input}
                                  >
                                    <option value="">
                                      Not Applicable
                                    </option>
                                    {cashAccounts.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.cash_name}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Investor
                                  <select
                                    name="funding_party_id"
                                    defaultValue=""
                                    style={input}
                                  >
                                    <option value="">
                                      Not Applicable
                                    </option>
                                    {parties.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.full_name}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Funding Agreement
                                  <select
                                    name="funding_agreement_id"
                                    defaultValue=""
                                    style={input}
                                  >
                                    <option value="">
                                      None / Temporary Advance
                                    </option>
                                    {agreements.map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.agreement_no}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Payer Name
                                  <input
                                    name="payer_name"
                                    maxLength={160}
                                    style={input}
                                  />
                                </label>

                                <label>
                                  UTR / Reference (Optional)
                                  <input
                                    name="payment_reference"
                                    maxLength={120}
                                    style={input}
                                  />
                                </label>

                                <label>
                                  Evidence Reference (Optional)
                                  <input
                                    name="evidence_reference"
                                    maxLength={255}
                                    style={input}
                                  />
                                </label>

                                <label>
                                  Remarks
                                  <textarea
                                    name="remarks"
                                    maxLength={500}
                                    style={input}
                                  />
                                </label>
                              </div>

                              <p style={{fontSize:12}}>
                                Select only the bank, cash or
                                investor fields applicable to
                                this payment source.
                              </p>

                              <button
                                type="submit"
                                style={{
                                  padding: "10px 16px",
                                  marginTop: 10,
                                }}
                              >
                                Save Payment
                              </button>
                            </form>
                          )}

                          <p>
                            <Link href={
                              `/accounting/purchases/${purchase.id}/payments`
                            }>
                              Full Payment History
                            </Link>
                          </p>
                            </>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}

              {purchases.length === 0 && (
                <tr>
                  <td colSpan={9} className={styles.emptyCell}>
                    No purchase invoices found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function PurchaseManagementPage(
  props: Props
) {
  return (
    <Suspense fallback={
      <main style={{padding:24}}>
        Loading Purchase Management…
      </main>
    }>
      <PurchaseManagementContent {...props}/>
    </Suspense>
  );
}
