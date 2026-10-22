
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type BalanceRow = RowDataPacket & {
  agreement_id: number;
  agreement_no: string;
  investor_name: string;
  funding_type: string;
  agreement_status: string;
  investment_amount: string;
  principal_returned: string;
  other_returns: string;
  remaining_balance: string;
};

type PurchaseFundingRow = RowDataPacket & {
  payment_id: number;
  purchase_id: number;
  payment_date: string;
  supplier_name: string;
  investor_name: string;
  amount: string;
  payment_source: string;
  funding_treatment: string;
  agreement_no: string | null;
};

function inr(value: string | number): string {
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const cell: React.CSSProperties = {
  padding: "11px 12px",
  textAlign: "left",
  whiteSpace: "nowrap",
  borderBottom: "1px solid #e2e8f0",
};

async function InvestmentAccountsContent() {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const [balances] = await db.execute<BalanceRow[]>(
    `SELECT
       a.id AS agreement_id,
       a.agreement_no,
       p.full_name AS investor_name,
       a.funding_type,
       a.status AS agreement_status,

       COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'FUNDING_RECEIVED'
           THEN t.amount ELSE 0
         END
       ), 0) AS investment_amount,

       COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'PRINCIPAL_REPAID'
           THEN t.amount ELSE 0
         END
       ), 0) AS principal_returned,

       COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'RETURN_PAID'
           THEN t.amount ELSE 0
         END
       ), 0) AS other_returns,

       COALESCE(SUM(
         CASE
           WHEN t.transaction_type = 'FUNDING_RECEIVED'
           THEN t.amount
           WHEN t.transaction_type = 'PRINCIPAL_REPAID'
           THEN -t.amount
           ELSE 0
         END
       ), 0) AS remaining_balance

     FROM acct_funding_agreements a

     JOIN acct_funding_parties p
       ON p.legal_business_id = a.legal_business_id
      AND p.id = a.party_id

     LEFT JOIN acct_funding_transactions t
       ON t.legal_business_id = a.legal_business_id
      AND t.agreement_id = a.id
      AND t.status = 'VERIFIED'

     WHERE a.legal_business_id = ?
       AND a.division_id = 1

     GROUP BY
       a.id,
       a.agreement_no,
       p.full_name,
       a.funding_type,
       a.status

     ORDER BY p.full_name, a.agreement_no`,
    [businessId]
  );

  const [purchaseFunding] =
    await db.execute<PurchaseFundingRow[]>(
      `SELECT
         pp.id AS payment_id,
         pp.purchase_id,
         DATE_FORMAT(pp.payment_date, '%Y-%m-%d')
           AS payment_date,
         s.supplier_name,
         fp.full_name AS investor_name,
         pp.amount,
         pp.payment_source,
         pp.funding_treatment,
         a.agreement_no

       FROM acct_purchase_payments pp

       JOIN acct_purchase_headers ph
         ON ph.id = pp.purchase_id
        AND ph.legal_business_id = pp.legal_business_id

       JOIN acct_suppliers s
         ON s.id = ph.supplier_id
        AND s.legal_business_id = ph.legal_business_id

       JOIN acct_funding_parties fp
         ON fp.id = pp.funding_party_id
        AND fp.legal_business_id = pp.legal_business_id

       LEFT JOIN acct_funding_agreements a
         ON a.id = pp.funding_agreement_id
        AND a.legal_business_id = pp.legal_business_id

       WHERE pp.legal_business_id = ?
         AND ph.division_id = 1
         AND pp.status = 'VERIFIED'
         AND pp.payment_source IN (
           'INVESTOR_BANK',
           'INVESTOR_CASH'
         )

       ORDER BY pp.payment_date DESC, pp.id DESC`,
      [businessId]
    );

  const totalInvested = balances.reduce(
    (sum, r) => sum + Number(r.investment_amount),
    0
  );

  const totalReturned = balances.reduce(
    (sum, r) => sum + Number(r.principal_returned),
    0
  );

  const totalBalance = balances.reduce(
    (sum, r) => sum + Number(r.remaining_balance),
    0
  );

  const pendingClassification = purchaseFunding
    .filter(p =>
      p.funding_treatment !== "AGREEMENT" ||
      p.agreement_no === null
    );

  const pendingAmount = pendingClassification.reduce(
    (sum, p) => sum + Number(p.amount),
    0
  );

  return (
    <main style={{
      padding: 24,
      maxWidth: 1450,
      margin: "0 auto",
    }}>
      <h1>Investment Account Balances</h1>

      <p>
        Abhiram Textiles — verified funding contributions,
        principal repayments and outstanding balances.
      </p>

      <nav style={{
        display: "flex",
        gap: 18,
        flexWrap: "wrap",
        marginBottom: 24,
      }}>
        <Link href="/accounting/purchase-management">
          Purchase Management
        </Link>
        <Link href="/accounting/product-profitability">
          Product Profitability
        </Link>
      </nav>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 12,
        marginBottom: 28,
      }}>
        {[
          ["Verified Investment", totalInvested],
          ["Principal Returned", totalReturned],
          ["Outstanding Principal", totalBalance],
          ["Purchase Funding to Reconcile", pendingAmount],
        ].map(([label, amount]) => (
          <div key={String(label)} style={{
            border: "1px solid #cbd5e1",
            borderRadius: 10,
            padding: 18,
          }}>
            <div style={{ color: "#64748b" }}>
              {label}
            </div>

            <strong style={{ fontSize: 23 }}>
              ₹{inr(Number(amount))}
            </strong>
          </div>
        ))}
      </div>

      <h2>Agreement-wise Investment Balances</h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
        }}>
          <thead>
            <tr>
              {[
                "Account / Investor",
                "Agreement",
                "Funding Type",
                "Investment Amt",
                "Returned Amt",
                "Remaining Balance",
                "Status",
              ].map(heading => (
                <th key={heading} style={cell}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {balances.map(row => (
              <tr key={row.agreement_id}>
                <td style={cell}>{row.investor_name}</td>
                <td style={cell}>{row.agreement_no}</td>
                <td style={cell}>{row.funding_type}</td>

                <td style={cell}>
                  ₹{inr(row.investment_amount)}
                </td>

                <td style={cell}>
                  ₹{inr(row.principal_returned)}
                </td>

                <td style={{
                  ...cell,
                  fontWeight: 700,
                }}>
                  ₹{inr(row.remaining_balance)}
                </td>

                <td style={cell}>
                  {row.agreement_status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{
        marginTop: 10,
        fontSize: 12,
        color: "#64748b",
      }}>
        Balances above are calculated from VERIFIED
        funding transactions only. RETURN_PAID is
        tracked separately from principal repayments
        and is not deducted from principal.
      </p>

      <section style={{ marginTop: 36 }}>
        <h2>Investor-Paid Supplier Purchases</h2>

        <p>
          These payments are recorded separately
          until we reconcile them against funding
          transactions and agreement classifications.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "Date",
                  "Investor",
                  "Supplier",
                  "Purchase ID",
                  "Amount",
                  "Funding Treatment",
                  "Agreement",
                ].map(heading => (
                  <th key={heading} style={cell}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {purchaseFunding.map(row => (
                <tr key={row.payment_id}>
                  <td style={cell}>{row.payment_date}</td>
                  <td style={cell}>{row.investor_name}</td>
                  <td style={cell}>{row.supplier_name}</td>
                  <td style={cell}>{row.purchase_id}</td>
                  <td style={cell}>₹{inr(row.amount)}</td>
                  <td style={cell}>
                    {row.funding_treatment}
                  </td>
                  <td style={cell}>
                    {row.agreement_no ?? "Not linked"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {purchaseFunding.length === 0 && (
          <p>No verified investor-funded purchase payments.</p>
        )}
      </section>

      <p style={{
        marginTop: 20,
        fontSize: 12,
        color: "#64748b",
      }}>
        The summary does not combine supplier-funded
        purchases with agreement contributions, because
        doing so without transaction-level reconciliation
        could double-count investment principal.
        Investment returns and profit distributions
        are not interchangeable.
      </p>
    </main>
  );
}

export default function InvestmentAccountsPage() {
  return (
    <Suspense fallback={
      <p>Loading investment balances...</p>
    }>
      <InvestmentAccountsContent />
    </Suspense>
  );
}
