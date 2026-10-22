
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type Props = {
  searchParams: Promise<{ account?: string }>;
};

type BankRow = RowDataPacket & {
  id: number;
  bank_name: string;
  account_label: string;
  account_number_last4: string;
  ownership_type: "BUSINESS" | "INVESTOR";
  status: string;
};

type CashRow = RowDataPacket & {
  id: number;
  cash_name: string;
  cash_code: string;
};

type SalePaymentRow = RowDataPacket & {
  id: number;
  invoice_no: string;
  payment_date: string;
  payment_method: string;
  amount: string;
  bank_account_id: number | null;
  cash_account_id: number | null;
};

type PurchasePaymentRow = RowDataPacket & {
  id: number;
  purchase_id: number;
  supplier_invoice_no: string | null;
  payment_date: string;
  payment_method: string;
  payment_source: string;
  amount: string;
  source_bank_account_id: number | null;
  source_cash_account_id: number | null;
};

type Account = {
  key: string;
  name: string;
  category: "GROUP_BANK" | "INVESTOR_BANK" | "CASH" | "UNALLOCATED";
};

type Movement = {
  key: string;
  accountKey: string;
  date: string;
  reference: string;
  purpose: string;
  method: string;
  credit: bigint;
  debit: bigint;
};

function toPaise(value: string | number): bigint {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Invalid amount: ${text}`);
  }

  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

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
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const { account: selected = "" } = await searchParams;

  // Include inactive accounts so historical transactions
  // remain visible.
  const [banks] = await db.execute<BankRow[]>(
    `SELECT
       id,
       bank_name,
       account_label,
       account_number_last4,
       ownership_type,
       status
     FROM acct_bank_accounts
     WHERE legal_business_id = ?
     ORDER BY ownership_type, bank_name, id`,
    [businessId]
  );

  const [cashAccounts] = await db.execute<CashRow[]>(
    `SELECT id, cash_name, cash_code
     FROM acct_cash_accounts
     WHERE legal_business_id = ?
     ORDER BY cash_name, id`,
    [businessId]
  );

  const [salePayments] =
    await db.execute<SalePaymentRow[]>(
      `SELECT
         sp.id,
         sh.invoice_no,
         DATE_FORMAT(
           sp.payment_date, '%Y-%m-%d'
         ) AS payment_date,
         sp.payment_method,
         sp.amount,
         sp.bank_account_id,
         sp.cash_account_id
       FROM acct_sales_payments sp
       JOIN acct_sales_headers sh
         ON sh.legal_business_id = sp.legal_business_id
        AND sh.division_id = sp.division_id
        AND sh.id = sp.sale_id
       WHERE sp.legal_business_id = ?
         AND sp.division_id = 1
         AND sp.status = 'RECORDED'
         AND sh.status = 'POSTED'
       ORDER BY sp.payment_date, sp.id`,
      [businessId]
    );

  const [purchasePayments] =
    await db.execute<PurchasePaymentRow[]>(
      `SELECT
         pp.id,
         pp.purchase_id,
         ph.supplier_invoice_no,
         DATE_FORMAT(
           pp.payment_date, '%Y-%m-%d'
         ) AS payment_date,
         pp.payment_method,
         pp.payment_source,
         pp.amount,
         pp.source_bank_account_id,
         pp.source_cash_account_id
       FROM acct_purchase_payments pp
       JOIN acct_purchase_headers ph
         ON ph.legal_business_id = pp.legal_business_id
        AND ph.id = pp.purchase_id
       WHERE pp.legal_business_id = ?
         AND ph.division_id = 1
         AND pp.status = 'VERIFIED'
       ORDER BY pp.payment_date, pp.id`,
      [businessId]
    );

  const accounts: Account[] = [
    ...banks.map(bank => ({
      key: `BANK:${bank.id}`,
      name: `${bank.bank_name} — ${bank.account_label} ••••${bank.account_number_last4}`,
      category: bank.ownership_type === "INVESTOR"
        ? "INVESTOR_BANK" as const
        : "GROUP_BANK" as const,
    })),
    ...cashAccounts.map(cash => ({
      key: `CASH:${cash.id}`,
      name: `${cash.cash_name} (${cash.cash_code})`,
      category: "CASH" as const,
    })),
    {
      key: "UNALLOCATED",
      name: "Unallocated Transactions",
      category: "UNALLOCATED",
    },
  ];

  const validAccounts = new Set(accounts.map(a => a.key));
  const movements: Movement[] = [];

  function addMovement(
    movement: Movement
  ) {
    // Unknown or missing account IDs must never be
    // assigned to another account by assumption.
    movements.push({
      ...movement,
      accountKey: validAccounts.has(movement.accountKey)
        ? movement.accountKey
        : "UNALLOCATED",
    });
  }

  for (const p of salePayments) {
    const bankId = p.bank_account_id === null
      ? null : Number(p.bank_account_id);
    const cashId = p.cash_account_id === null
      ? null : Number(p.cash_account_id);

    const accountKey =
      bankId !== null && cashId === null
        ? `BANK:${bankId}`
        : cashId !== null && bankId === null
          ? `CASH:${cashId}`
          : "UNALLOCATED";

    addMovement({
      key: `SALE:${p.id}`,
      accountKey,
      date: p.payment_date,
      reference: p.invoice_no,
      purpose: "Sales collection",
      method: p.payment_method,
      credit: toPaise(p.amount),
      debit: 0n,
    });
  }

  for (const p of purchasePayments) {
    let accountKey = "UNALLOCATED";

    if (
      ["BUSINESS_BANK", "INVESTOR_BANK"].includes(
        p.payment_source
      ) &&
      p.source_bank_account_id !== null &&
      p.source_cash_account_id === null
    ) {
      accountKey = `BANK:${p.source_bank_account_id}`;
    } else if (
      ["BUSINESS_CASH", "INVESTOR_CASH"].includes(
        p.payment_source
      ) &&
      p.source_cash_account_id !== null &&
      p.source_bank_account_id === null
    ) {
      accountKey = `CASH:${p.source_cash_account_id}`;
    }

    addMovement({
      key: `PURCHASE:${p.id}`,
      accountKey,
      date: p.payment_date,
      reference:
        p.supplier_invoice_no ||
        `Purchase #${p.purchase_id}`,
      purpose: "Supplier payment",
      method: p.payment_method,
      credit: 0n,
      debit: toPaise(p.amount),
    });
  }

  movements.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.key.localeCompare(b.key)
  );

  const accountSummaries = accounts.map(account => {
    const entries = movements.filter(
      m => m.accountKey === account.key
    );

    const credited = entries.reduce(
      (sum, m) => sum + m.credit,
      0n
    );

    const debited = entries.reduce(
      (sum, m) => sum + m.debit,
      0n
    );

    return {
      ...account,
      credited,
      debited,
      net: credited - debited,
      count: entries.length,
    };
  });

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

      <p>
        Abhiram Textiles — recorded sales collections
        and verified supplier payments by account.
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
        balance. Opening balances, expenses, transfers
        and funding movements will be integrated next.
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
