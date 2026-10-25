import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { CASHIER_SPENDING_LIMIT } from "@/lib/access";
import { recordShopSpendingAction } from "@/lib/shop-spending-actions";
import { SPENDING_KINDS } from "@/lib/shop-spending-kinds";
import SubmitButton from "@/components/SubmitButton";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "14px 12px", fontSize: 18, minWidth: 0, width: "100%" };
const inr = (v: string | number | null) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function SpendingContent({ searchParams }: Props) {
  const user = await requireAccess("shop_spending");
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const [drawers] = await db.execute<Row[]>(
    `SELECT id, cash_name FROM acct_cash_accounts
     WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_type, cash_name`,
    [businessId]
  );
  const [recent] = await db.execute<Row[]>(
    `SELECT e.id, e.expense_no, e.description, e.amount,
            DATE_FORMAT(CONVERT_TZ(e.created_at, '+00:00', '+05:30'), '%d %b, %H:%i') AS at, u.full_name AS who
       FROM acct_expenses e
       JOIN acct_expense_payments p ON p.expense_id = e.id AND p.legal_business_id = e.legal_business_id
        AND p.payment_source = 'BUSINESS_CASH' AND p.status = 'RECORDED'
       LEFT JOIN acct_app_users u ON u.id = e.created_by
      WHERE e.legal_business_id = ? AND e.status = 'CONFIRMED'
        AND e.expense_date >= (CURDATE() - INTERVAL 6 DAY)
        AND EXISTS (SELECT 1 FROM acct_audit_events a WHERE a.legal_business_id = e.legal_business_id
                     AND a.action = 'SHOP_SPENDING_NOTED' AND a.subject_id = e.id)
      ORDER BY e.id DESC LIMIT 40`,
    [businessId]
  );
  const [today] = await db.execute<Row[]>(
    `SELECT COALESCE(SUM(e.amount), 0) AS total
       FROM acct_expenses e
       JOIN acct_expense_payments p ON p.expense_id = e.id AND p.legal_business_id = e.legal_business_id
        AND p.payment_source = 'BUSINESS_CASH' AND p.status = 'RECORDED'
      WHERE e.legal_business_id = ? AND e.status = 'CONFIRMED' AND e.expense_date = CURDATE()
        AND EXISTS (SELECT 1 FROM acct_audit_events a WHERE a.legal_business_id = e.legal_business_id
                     AND a.action = 'SHOP_SPENDING_NOTED' AND a.subject_id = e.id)`,
    [businessId]
  );

  return (
    <main style={{ padding: 16, maxWidth: 640 }}>
      <h1>Shop spending</h1>
      <p style={{ color: "#64748b" }}>
        Paid something from the drawer? Note it here so the cash count adds up. Noted here today: <strong>{inr(today[0].total)}</strong>
      </p>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <form action={recordShopSpendingAction} style={{ ...box, display: "grid", gap: 14 }}>
        <label>How much (₹)
          <input name="amount" inputMode="decimal" required placeholder="250" style={field} />
        </label>
        <label>What was it for
          <select name="kind" required defaultValue="" style={field}>
            <option value="" disabled>Choose…</option>
            {Object.entries(SPENDING_KINDS).map(([key, k]) => <option key={key} value={key}>{k.label}</option>)}
          </select>
        </label>
        <label>A few words
          <input name="note" required minLength={3} maxLength={200} placeholder="e.g. Auto for parcel to Uppal" style={field} />
        </label>
        <label>Money taken from
          <select name="drawer" required defaultValue={drawers.length === 1 ? String(drawers[0].id) : ""} style={field}>
            {drawers.length !== 1 && <option value="" disabled>Choose the drawer…</option>}
            {drawers.map((d) => <option key={String(d.id)} value={String(d.id)}>{d.cash_name}</option>)}
          </select>
        </label>
        <SubmitButton label="Note this spending" />
        {user.role === "CASHIER" && (
          <p style={{ color: "#64748b", margin: 0 }}>Up to ₹{CASHIER_SPENDING_LIMIT.toLocaleString("en-IN")} at a time. For more, ask the owner.</p>
        )}
      </form>

      <section style={box}>
        <h2>Last 7 days</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {recent.map((r) => (
              <tr key={String(r.id)}>
                <td style={cell}>{r.description}<br /><span style={{ color: "#64748b", fontSize: 13 }}>{r.at} · {r.who ?? "—"}</span></td>
                <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{inr(r.amount)}</td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td style={cell}>Nothing noted yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default function ShopSpendingPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SpendingContent {...props} />
    </Suspense>
  );
}
