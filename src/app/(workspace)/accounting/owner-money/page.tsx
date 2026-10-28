import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { recordOwnerMoneyAction } from "@/lib/owner-money-actions";
import SubmitButton from "@/components/SubmitButton";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const paise = (v: unknown) => BigInt(Math.round(Number(v ?? 0) * 100));
const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const [rows] = await db.execute<Row[]>(
    `SELECT o.entry_no, o.direction, DATE_FORMAT(o.entry_date, '%Y-%m-%d') AS d, o.amount, o.reference, o.note, o.payment_method,
            COALESCE(CONCAT(b.bank_name, ' ', COALESCE(b.account_label, '')), c.cash_name) AS account_name
       FROM acct_owner_money o
       LEFT JOIN acct_bank_accounts b ON b.id = o.bank_account_id
       LEFT JOIN acct_cash_accounts c ON c.id = o.cash_account_id
      WHERE o.legal_business_id = ? ORDER BY o.entry_date DESC, o.id DESC LIMIT 100`,
    [businessId]
  );
  const [cash] = await db.execute<Row[]>(`SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`, [businessId]);
  const [banks] = await db.execute<Row[]>(
    `SELECT id, bank_name, account_number_last4 FROM acct_bank_accounts
      WHERE legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE' ORDER BY bank_name`, [businessId]);

  const inTotal = rows.filter((r) => r.direction === "IN").reduce((t, r) => t + paise(r.amount), 0n);
  const outTotal = rows.filter((r) => r.direction === "OUT").reduce((t, r) => t + paise(r.amount), 0n);

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Owner money in and out</h1>
      <p style={{ color: "#64748b" }}>
        Use this when you put your own money into a business bank or cash account, or take money back out. It is your capital in the business, not a sale and not a profit. The entry goes to the books by itself.
        To record that you paid a business bill from your own pocket, use the Expenses page instead.
      </p>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <p style={{ fontSize: 18, margin: 0 }}>
          Put in so far <strong>{rupees(inTotal)}</strong> · Taken out <strong>{rupees(outTotal)}</strong> · Net in the business <strong>{rupees(inTotal - outTotal)}</strong>
        </p>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Record money</h2>
        <form action={recordOwnerMoneyAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", alignItems: "end" }}>
          <label>What happened
            <select name="direction" defaultValue="IN" style={field}>
              <option value="IN">I put money in</option>
              <option value="OUT">I took money out</option>
            </select>
          </label>
          <label>Amount (₹)<input name="amount" inputMode="decimal" required style={field} /></label>
          <label>Date<input type="date" name="entry_date" defaultValue={today} max={today} required style={field} /></label>
          <label>Bank or cash account
            <select name="account" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {banks.map((b) => <option key={`b${b.id}`} value={`BANK:${b.id}`}>Bank: {String(b.bank_name)}{b.account_number_last4 ? ` ••${b.account_number_last4}` : ""}</option>)}
              {cash.map((c) => <option key={`c${c.id}`} value={`CASH:${c.id}`}>Cash: {String(c.cash_name)}</option>)}
            </select>
          </label>
          <label>How
            <select name="how" required defaultValue="BANK_TRANSFER" style={field}>
              <option value="BANK_TRANSFER">Bank transfer</option><option value="UPI">UPI</option><option value="CHEQUE">Cheque</option><option value="CASH">Cash</option>
            </select>
          </label>
          <label>Bank reference (optional)<input name="reference" maxLength={80} style={field} /></label>
          <label>Note (optional)<input name="note" maxLength={300} style={field} /></label>
          <div><SubmitButton label="Save" question="Save this? It goes into the books and changes the account balance." /></div>
        </form>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>History</h2>
        {rows.length === 0 ? <p>Nothing yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead><tr><th style={cell}>Entry</th><th style={cell}>Account</th><th style={right}>In</th><th style={right}>Out</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.entry_no)}>
                    <td style={cell}>{String(r.entry_no)}<br /><span style={{ color: "#64748b", fontSize: 13 }}>{pretty(String(r.d))}{r.reference ? ` · ${r.reference}` : ""}{r.note ? ` · ${r.note}` : ""}</span></td>
                    <td style={cell}>{String(r.account_name ?? "")}</td>
                    <td style={right}>{r.direction === "IN" ? rupees(paise(r.amount)) : ""}</td>
                    <td style={right}>{r.direction === "OUT" ? rupees(paise(r.amount)) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
