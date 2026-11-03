import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import { BRAND_NAME, SHOP_PHONE, SHOP_EMAIL, SHOP_WEBSITES } from "@/lib/brand";
import { rupeesInWords } from "@/lib/voucher-math";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
};

const rupees = (v: string | number) =>
  Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toPaise = (v: string | number) => BigInt(Math.round(Number(v) * 100));

const SOURCE_WORDS: Record<string, string> = {
  BUSINESS_CASH: "Paid in cash from the shop cash drawer",
  BUSINESS_BANK: "Paid from the business bank account",
  OWNER_PERSONAL: "Paid by the owner from his own money (to be repaid or treated as owner money)",
  INVESTOR_CASH: "Paid from an investor's own cash",
  INVESTOR_BANK: "Paid from an investor's own bank account",
};

const cell: React.CSSProperties = { border: "1px solid #334155", padding: "8px 10px", fontSize: 14 };

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const expenseId = Number((await params).id);
  const paymentText = (await searchParams).payment;
  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) notFound();

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT e.expense_no, e.category, e.description, e.payee_name, e.amount, e.status, e.remarks,
            DATE_FORMAT(e.expense_date, '%d-%m-%Y') AS date_text,
            b.address_line1, b.address_line2, b.city, b.state, b.postal_code
       FROM acct_expenses e
       LEFT JOIN acct_branches b
         ON b.legal_business_id = e.legal_business_id AND b.division_id = e.division_id AND b.id = e.branch_id
      WHERE e.legal_business_id = ? AND e.id = ?`,
    [businessId, expenseId]
  );
  if (rows.length !== 1) notFound();
  const e = rows[0];
  const address = [e.address_line1, e.address_line2, e.city, e.state, e.postal_code].filter(Boolean).join(", ") || "Kapra, Hyderabad";

  let voucher: RowDataPacket | null = null;
  if (paymentText) {
    const paymentId = Number(paymentText);
    const [v] = await db.execute<RowDataPacket[]>(
      `SELECT v.voucher_no, v.voucher_type, p.payment_method, p.payment_source, p.amount, p.payment_reference, p.status,
              DATE_FORMAT(p.payment_date, '%d-%m-%Y') AS pay_date,
              CASE WHEN p.bank_account_id IS NOT NULL THEN CONCAT(bk.bank_name, ' ••••', bk.account_number_last4)
                   WHEN p.cash_account_id IS NOT NULL THEN ca.cash_name
                   WHEN p.payment_source = 'INVESTOR_CASH' THEN f.full_name
                   ELSE NULL END AS account_name
         FROM acct_vouchers v
         JOIN acct_expense_payments p ON p.legal_business_id = v.legal_business_id AND p.id = v.expense_payment_id
         LEFT JOIN acct_bank_accounts bk ON bk.legal_business_id = p.legal_business_id AND bk.id = p.bank_account_id
         LEFT JOIN acct_cash_accounts ca ON ca.legal_business_id = p.legal_business_id AND ca.id = p.cash_account_id
         LEFT JOIN acct_funding_parties f ON f.legal_business_id = p.legal_business_id AND f.id = p.funding_party_id
        WHERE v.legal_business_id = ? AND v.expense_payment_id = ? AND p.expense_id = ?`,
      [businessId, paymentId, expenseId]
    );
    if (v.length !== 1 || v[0].status !== "RECORDED") notFound();
    voucher = v[0];
  }

  const isVoucher = voucher !== null;
  const amount = isVoucher ? voucher!.amount : e.amount;
  const title = isVoucher
    ? voucher!.voucher_type === "BPV" ? "BANK PAYMENT VOUCHER" : voucher!.voucher_type === "CPV" ? "CASH PAYMENT VOUCHER"
      : voucher!.voucher_type === "OPV" ? "PAYMENT VOUCHER (PAID BY OWNER)" : "PAYMENT VOUCHER (PAID BY INVESTOR)"
    : "EXPENSE RECORD";

  return (
    <main style={{ maxWidth: 794, margin: "0 auto", padding: 24 }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <Link className="btn-link" href={`/accounting/expenses/${expenseId}`}>← Back to {String(e.expense_no)}</Link>
        <PrintButton label={isVoucher ? "Print voucher" : "Print expense record"} />
      </div>

      <section style={{ border: "2px solid #142c50", padding: 20, background: "#fff", color: "#0f172a" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "2px solid #142c50", paddingBottom: 12 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/abhiram-logo-print.png" alt="Abhiram Group" width={72} height={72} />
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#142c50" }}>ABHIRAM GROUP</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#142c50" }}>{BRAND_NAME}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{address}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>Phone {SHOP_PHONE} · {SHOP_EMAIL}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{SHOP_WEBSITES}</div>
            </div>
          </div>
          <div style={{ textAlign: "right", fontWeight: 800, color: "#142c50", fontSize: 16 }}>{title}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, fontWeight: 700, width: "18%" }}>{isVoucher ? "Voucher no." : "Expense no."}</td>
              <td style={{ ...cell, width: "32%" }}>{isVoucher ? String(voucher!.voucher_no) : String(e.expense_no)}</td>
              <td style={{ ...cell, fontWeight: 700, width: "18%" }}>Date</td>
              <td style={cell}>{isVoucher ? String(voucher!.pay_date) : String(e.date_text)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>{isVoucher ? "Expense no." : "Type"}</td>
              <td style={cell}>{isVoucher ? String(e.expense_no) : String(e.category).replaceAll("_", " ")}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{isVoucher ? "Type" : "Status"}</td>
              <td style={cell}>{isVoucher ? String(e.category).replaceAll("_", " ") : String(e.status)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Paid to</td>
              <td style={{ ...cell, height: 36 }} colSpan={3}>{String(e.payee_name ?? "")}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14 }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: "left" }}>Particulars</th>
              <th style={{ ...cell, width: "22%", textAlign: "right" }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cell, height: 120, verticalAlign: "top" }}>
                {String(e.description)}
                {e.remarks ? <div style={{ color: "#475569", marginTop: 6 }}>{String(e.remarks)}</div> : null}
              </td>
              <td style={{ ...cell, textAlign: "right", verticalAlign: "top" }}>{rupees(amount)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>TOTAL</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{rupees(amount)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 14, margin: "10px 0" }}><strong>In words:</strong> {rupeesInWords(toPaise(amount))}</p>

        {isVoucher ? (
          <p style={{ fontSize: 14, margin: "10px 0" }}>
            <strong>How paid:</strong> {String(voucher!.payment_method).replaceAll("_", " ").toLowerCase()}
            {voucher!.account_name ? ` · ${String(voucher!.account_name)}` : ""}
            {voucher!.payment_reference ? ` · Ref ${String(voucher!.payment_reference)}` : ""}
            <br />
            {SOURCE_WORDS[String(voucher!.payment_source)] ?? ""}
          </p>
        ) : (
          <p style={{ fontSize: 14, margin: "10px 0", fontWeight: 600, color: "#b45309" }}>
            This is a record of an expense. It is not a payment voucher: nothing has been paid by this paper.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 56, fontSize: 13 }}>
          <div style={{ borderTop: "1px solid #334155", paddingTop: 4, width: "28%" }}>Prepared by</div>
          <div style={{ borderTop: "1px solid #334155", paddingTop: 4, width: "28%" }}>Approved by</div>
          {isVoucher && <div style={{ borderTop: "1px solid #334155", paddingTop: 4, width: "28%" }}>Received by (signature)</div>}
        </div>
      </section>
    </main>
  );
}

export default function ExpensePrintPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
