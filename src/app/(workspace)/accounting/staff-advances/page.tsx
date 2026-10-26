import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { giveStaffAdvanceAction } from "@/lib/staff-advance-actions";
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
  const user = await requireAccess("salary");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const [people] = await db.execute<Row[]>(
    `SELECT e.id, e.full_name, e.status,
            COALESCE((SELECT SUM(a.amount) FROM acct_staff_advances a WHERE a.employee_id = e.id AND a.legal_business_id = e.legal_business_id), 0) AS given,
            COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.employee_id = e.id), 0) AS taken
       FROM acct_employees e WHERE e.legal_business_id = ? ORDER BY e.status, e.full_name`,
    [businessId]
  );
  const [history] = await db.execute<Row[]>(
    `SELECT a.advance_no, e.full_name, DATE_FORMAT(a.given_on, '%Y-%m-%d') AS d, a.amount, a.note, a.instalment,
            COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.advance_id = a.id), 0) AS taken
       FROM acct_staff_advances a JOIN acct_employees e ON e.id = a.employee_id
      WHERE a.legal_business_id = ? ORDER BY a.given_on DESC, a.id DESC LIMIT 100`,
    [businessId]
  );
  const [cash] = await db.execute<Row[]>(`SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`, [businessId]);
  const [banks] = await db.execute<Row[]>(
    `SELECT id, bank_name, account_number_last4 FROM acct_bank_accounts
      WHERE legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE' AND verification_status = 'VERIFIED' AND can_send = 1 ORDER BY bank_name`, [businessId]);

  const owing = people.filter((p) => paise(p.given) - paise(p.taken) > 0n);
  const totalOwed = owing.reduce((t, p) => t + paise(p.given) - paise(p.taken), 0n);

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <p><Link href="/accounting/salaries">← Salaries</Link></p>
      <h1>Staff advances</h1>
      <p style={{ color: "#64748b" }}>Money given to staff before payday. It is not an expense: it is taken off their next salary on the Salaries page, all at once or a little each month.</p>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <h2>Who owes the business</h2>
        {owing.length === 0 ? <p>No one has an advance outstanding.</p> : (
          <>
            <p style={{ fontSize: 18 }}>Total outstanding <strong>{rupees(totalOwed)}</strong></p>
            {owing.map((p) => (
              <p key={String(p.id)} style={{ margin: "6px 0" }}>{String(p.full_name)}{p.status !== "ACTIVE" ? " (left)" : ""}: <strong>{rupees(paise(p.given) - paise(p.taken))}</strong></p>
            ))}
          </>
        )}
      </section>

      <section style={box}>
        <h2>Give an advance</h2>
        <form action={giveStaffAdvanceAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", alignItems: "end" }}>
          <label>Person
            <select name="employee_id" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {people.filter((p) => p.status === "ACTIVE").map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.full_name)}</option>)}
            </select>
          </label>
          <label>Amount (₹)<input name="amount" inputMode="decimal" required style={field} /></label>
          <label>Date<input type="date" name="given_on" defaultValue={today} max={today} required style={field} /></label>
          <label>Paid from
            <select name="account" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {cash.map((c) => <option key={`c${c.id}`} value={`CASH:${c.id}`}>Cash: {String(c.cash_name)}</option>)}
              {banks.map((b) => <option key={`b${b.id}`} value={`BANK:${b.id}`}>Bank: {String(b.bank_name)}{b.account_number_last4 ? ` ••${b.account_number_last4}` : ""}</option>)}
            </select>
          </label>
          <label>How
            <select name="how" required defaultValue="CASH" style={field}>
              <option value="CASH">Cash</option><option value="UPI">UPI</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option>
            </select>
          </label>
          <label>Take off each month (₹, optional)<input name="instalment" inputMode="decimal" placeholder="empty = all at once" style={field} /></label>
          <label>Note (optional)<input name="note" maxLength={300} style={field} /></label>
          <div><SubmitButton label="Give advance" question="Give this advance? Money leaves the chosen cash drawer or bank now." /></div>
        </form>
      </section>

      <section style={box}>
        <h2>History</h2>
        {history.length === 0 ? <p>Nothing yet.</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead><tr><th style={cell}>Advance</th><th style={cell}>Person</th><th style={right}>Given</th><th style={right}>Taken off</th><th style={right}>Left</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={String(h.advance_no)}>
                    <td style={cell}>{String(h.advance_no)}<br /><span style={{ color: "#64748b", fontSize: 13 }}>{pretty(String(h.d))}{h.note ? ` · ${h.note}` : ""}{h.instalment ? ` · ${rupees(paise(h.instalment))} a month` : ""}</span></td>
                    <td style={cell}>{String(h.full_name)}</td>
                    <td style={right}>{rupees(paise(h.amount))}</td>
                    <td style={right}>{rupees(paise(h.taken))}</td>
                    <td style={right}>{rupees(paise(h.amount) - paise(h.taken))}</td>
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
