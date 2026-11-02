
import LedgerStatusNote from "@/components/LedgerStatusNote";
import { Suspense } from "react";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { loadAccountFlow } from "@/lib/reports/account-flow";

type Props = {
  searchParams: Promise<{ account?: string }>;
};

function inr(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = abs / 100n;
  const decimal = String(abs % 100n).padStart(2, "0");

  return `${negative ? "-" : ""}₹${whole.toLocaleString(
    "en-IN"
  )}.${decimal}`;
}

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  whiteSpace: "nowrap",
};

async function AccountBalancesContent({
  searchParams,
}: Props) {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;
  const { account: selected = "" } = await searchParams;

  const { movements, accountSummaries } = await loadAccountFlow(db, businessId);

  // Unallocated amounts are excluded from known-account
  // balances. Investor bank movements are not Group cash.
  const groupSummaries = accountSummaries.filter(
    a => a.category === "GROUP_BANK" ||
         a.category === "CASH"
  );

  const totalCredits = groupSummaries.reduce(
    (sum, a) => sum + a.credited, 0n
  );
  const totalDebits = groupSummaries.reduce(
    (sum, a) => sum + a.debited, 0n
  );

  const activeAccount = accountSummaries.find(
    a => a.key === selected
  );

  const detailEntries = activeAccount
    ? movements.filter(
        m => m.accountKey === activeAccount.key
      )
    : [];

  let running = 0n;
  const details = detailEntries.map(m => {
    running += m.credit - m.debit;
    return { ...m, running };
  });

  return (
    <main style={{
      maxWidth: 1500,
      margin: "0 auto",
      padding: 24,
    }}>
      <h1>Account Balances & Money Flow</h1>
      <Suspense fallback={null}>
        <LedgerStatusNote businessId={businessId} />
      </Suspense>

      <p>
        Recorded sales collections
        verified supplier payments and recorded expense payments
        by account. Includes Textiles expenses and Group overheads.
      </p>

      <nav style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        marginBottom: 24,
      }}>
        <Link href="/accounting/invoices">
          Invoices
        </Link>
        <Link href="/accounting/purchase-management">
          Purchases
        </Link>
        <Link href="/accounting/investment-accounts">
          Investment Accounts
        </Link>
      </nav>

      <div style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 14,
        marginBottom: 26,
      }}>
        {[
          ["Group Receipts", totalCredits],
          ["Group Payments", totalDebits],
          ["Group Net Movement", totalCredits - totalDebits],
        ].map(([label, amount]) => (
          <div key={String(label)} style={{
            border: "1px solid #cbd5e1",
            padding: 18,
            borderRadius: 10,
          }}>
            <div style={{ color: "#64748b" }}>
              {label}
            </div>
            <strong style={{ fontSize: 23 }}>
              {inr(amount as bigint)}
            </strong>
          </div>
        ))}
      </div>

      <h2>Account Summary</h2>

      <div style={{ overflowX: "auto" }}>
        <table style={{
          width: "100%",
          borderCollapse: "collapse",
        }}>
          <thead>
            <tr>
              {[
                "Bank / Investor Account / Cash",
                "Category",
                "Amount Credited",
                "Amount Debited",
                "Net Movement",
                "Transactions",
                "Action",
              ].map(h => (
                <th key={h} style={cell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accountSummaries.map(a => (
              <tr key={a.key}>
                <td style={cell}>{a.name}</td>
                <td style={cell}>
                  {a.category.replaceAll("_", " ")}
                </td>
                <td style={cell}>{inr(a.credited)}</td>
                <td style={cell}>{inr(a.debited)}</td>
                <td style={{
                  ...cell,
                  fontWeight: 700,
                }}>
                  {inr(a.net)}
                </td>
                <td style={cell}>{a.count}</td>
                <td style={cell}>
                  <Link href={
                    `/accounting/account-balances?account=${encodeURIComponent(a.key)}`
                  }>
                    View Transactions
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ color: "#64748b", fontSize: 13 }}>
        Net Movement = Recorded Credits − Recorded Debits.
        This is not yet an actual bank or cash closing
        balance. Opening balances, transfers and funding movements
        are not included. Owner personal and investor cash expense
        payments appear separately and do not reduce Group cash.
        Investor accounts display Textiles-related activity,
        not personal account balances.
      </p>

      {activeAccount && (
        <section style={{ marginTop: 36 }}>
          <h2>Transactions — {activeAccount.name}</h2>

          <p>
            {detailEntries.length} recorded transactions
            {" · "}
            Net movement: {inr(activeAccount.net)}
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
                    "Reference",
                    "Transaction",
                    "Payment Type",
                    "Credited",
                    "Debited",
                    "Running Net",
                  ].map(h => (
                    <th key={h} style={cell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {details.map(m => (
                  <tr key={m.key}>
                    <td style={cell}>{m.date}</td>
                    <td style={cell}>{m.reference}</td>
                    <td style={cell}>{m.purpose}</td>
                    <td style={cell}>{m.method}</td>
                    <td style={cell}>
                      {m.credit > 0n ? inr(m.credit) : "—"}
                    </td>
                    <td style={cell}>
                      {m.debit > 0n ? inr(m.debit) : "—"}
                    </td>
                    <td style={cell}>
                      {inr(m.running)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {details.length === 0 && (
            <p>No recorded transactions for this account.</p>
          )}
        </section>
      )}
    </main>
  );
}

export default function AccountBalancesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading account balances…</p>}>
      <AccountBalancesContent {...props} />
    </Suspense>
  );
}
