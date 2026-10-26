import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { prettyPhone } from "@/lib/customer-phone";
import { addEmployeeAction, paySalaryAction, updateEmployeeAction } from "@/lib/salary-actions";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";

type Props = { searchParams: Promise<{ month?: string; saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };
const inr = (v: string | number | null) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const shiftMonth = (month: string, delta: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
};
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

async function SalariesContent({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const nowMonth = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? String(query.month) : nowMonth;

  const [people] = await db.execute<Row[]>(
    `SELECT e.id, e.full_name, e.phone, e.job_title, e.monthly_salary, e.status,
            s.amount AS paid_amount, s.advance_deducted, DATE_FORMAT(s.paid_on, '%d %b') AS paid_on,
            COALESCE((SELECT SUM(a.amount) FROM acct_staff_advances a WHERE a.employee_id = e.id AND a.legal_business_id = e.legal_business_id), 0)
              - COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.employee_id = e.id), 0) AS advance_left,
            (SELECT MAX(a.instalment) FROM acct_staff_advances a WHERE a.employee_id = e.id AND a.legal_business_id = e.legal_business_id
               AND a.amount > COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.advance_id = a.id), 0)) AS instalment
       FROM acct_employees e
       LEFT JOIN acct_salary_payments s
         ON s.employee_id = e.id AND s.legal_business_id = e.legal_business_id AND s.salary_month = ?
      WHERE e.legal_business_id = ? AND (e.status = 'ACTIVE' OR s.id IS NOT NULL)
      ORDER BY e.status, e.full_name`,
    [month, businessId]
  );
  const [cash] = await db.execute<Row[]>(
    `SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`,
    [businessId]
  );
  const [banks] = await db.execute<Row[]>(
    `SELECT id, bank_name, account_number_last4 FROM acct_bank_accounts
     WHERE legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE'
       AND verification_status = 'VERIFIED' AND can_send = 1 ORDER BY bank_name`,
    [businessId]
  );
  const [branches] = await db.execute<Row[]>(
    `SELECT id, branch_name FROM acct_branches WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY branch_name`,
    [businessId]
  );

  const active = people.filter((p) => p.status === "ACTIVE");
  const payable = active.reduce((s, p) => s + Number(p.monthly_salary), 0);
  const paid = people.reduce((s, p) => s + Number(p.paid_amount ?? 0), 0);
  const waiting = active.filter((p) => p.paid_amount === null).length;

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Salaries</h1>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <a className="btn-link" href={`/accounting/salaries?month=${shiftMonth(month, -1)}`}>← {monthLabel(shiftMonth(month, -1))}</a>
        <strong style={{ fontSize: 20 }}>{monthLabel(month)}</strong>
        <a className="btn-link" href={`/accounting/salaries?month=${shiftMonth(month, 1)}`}>{monthLabel(shiftMonth(month, 1))} →</a>
      </div>
      <p style={{ color: "#64748b" }}>
        Monthly salaries {inr(payable)} · paid {inr(paid)} · {waiting === 0 ? "everyone is paid" : `${waiting} still to pay`}
      </p>

      <p><a className="btn-link" href="/accounting/staff-advances">Staff advances</a></p>

      <section style={box}>
        {people.map((p) => {
          const left = p.status !== "ACTIVE";
          const slip = p.paid_amount !== null && p.phone
            ? `https://wa.me/91${p.phone}?text=${encodeURIComponent(`Hello ${p.full_name}, your salary for ${monthLabel(month)} of ₹${Number(p.paid_amount).toLocaleString("en-IN")} was paid on ${p.paid_on}.` + (Number(p.advance_deducted) > 0 ? ` ₹${Number(p.advance_deducted).toLocaleString("en-IN")} was taken off for your advance; advance balance ₹${Number(p.advance_left).toLocaleString("en-IN")}.` : "") + ` - Abhiram Textiles`)}`
            : null;
          return (
            <div key={String(p.id)} style={{ ...cell, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span>
                  <strong>{p.full_name}</strong>{left ? " (left)" : ""}
                  <br /><span style={{ color: "#64748b", fontSize: 14 }}>{[p.job_title, p.phone ? prettyPhone(String(p.phone)) : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  {p.paid_amount !== null ? (
                    <><strong style={{ color: "#166534" }}>✓ Paid {inr(p.paid_amount)}</strong>{Number(p.advance_deducted) > 0 && <><br /><span style={{ fontSize: 14 }}>{inr(p.advance_deducted)} taken off an advance</span></>}<br /><span style={{ color: "#64748b", fontSize: 14 }}>on {p.paid_on}</span></>
                  ) : (
                    <>Salary {inr(p.monthly_salary)}</>
                  )}
                </span>
              </div>

              {p.paid_amount === null && !left && (
                <form action={paySalaryAction} style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}>
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="employee_id" value={String(p.id)} />
                  <label>Pay (₹)<input name="amount" inputMode="decimal" defaultValue={String(Number(p.monthly_salary))} required style={field} /></label>
                  <label>From
                    <select name="account" required defaultValue="" style={field}>
                      <option value="" disabled>Choose…</option>
                      {cash.map((c) => <option key={`c${c.id}`} value={`CASH:${c.id}`}>Cash: {c.cash_name}</option>)}
                      {banks.map((b) => <option key={`b${b.id}`} value={`BANK:${b.id}`}>Bank: {b.bank_name}{b.account_number_last4 ? ` ••${b.account_number_last4}` : ""}</option>)}
                    </select>
                  </label>
                  <label>How
                    <select name="how" required defaultValue="CASH" style={field}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </label>
                  {Number(p.advance_left) > 0 && (
                    <label>Advance to take off (₹) · they owe {inr(p.advance_left)}
                      <input name="deduct" inputMode="decimal" defaultValue={String(Math.min(Number(p.advance_left), Number(p.monthly_salary), Number(p.instalment ?? p.advance_left)))} style={field} />
                    </label>
                  )}
                  <label>Note (leaves, bonus…)<input name="note" maxLength={300} style={field} /></label>
                  <SubmitButton label="Pay" question={`Pay ${p.full_name} for ${monthLabel(month)}? This is saved as an expense.`} />
                </form>
              )}
              {slip && <a href={slip} target="_blank" rel="noreferrer" className="btn-link">Send pay slip on WhatsApp</a>}

              {!left && (
                <details>
                  <summary style={{ cursor: "pointer", color: "#64748b" }}>Change salary or mark as left</summary>
                  <form action={updateEmployeeAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="employee_id" value={String(p.id)} />
                    <input type="hidden" name="what" value="SALARY" />
                    <input name="monthly_salary" inputMode="decimal" defaultValue={String(Number(p.monthly_salary))} style={{ ...field, width: 140 }} aria-label="New monthly salary" />
                    <SubmitButton label="Save new salary" className="btn-link" />
                  </form>
                  <form action={updateEmployeeAction}>
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="employee_id" value={String(p.id)} />
                    <input type="hidden" name="what" value="LEFT" />
                    <ConfirmButton label="Mark as left" question={`Mark ${p.full_name} as having left? They will no longer appear for new months.`} />
                  </form>
                </details>
              )}
            </div>
          );
        })}
        {people.length === 0 && <p>No one added yet. Add the first person below.</p>}
      </section>

      <section style={box}>
        <h2>Add a person</h2>
        <form action={addEmployeeAction} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <input type="hidden" name="month" value={month} />
          <label>Name<input name="full_name" required maxLength={150} style={field} /></label>
          <label>Monthly salary (₹)<input name="monthly_salary" inputMode="decimal" required style={field} /></label>
          <label>Mobile (for pay slips)<input name="phone" inputMode="tel" style={field} /></label>
          <label>Job (optional)<input name="job_title" maxLength={100} style={field} /></label>
          <label>Branch
            <select name="branch_id" defaultValue={branches.length === 1 ? String(branches[0].id) : ""} style={field}>
              <option value="">Whole business</option>
              {branches.map((b) => <option key={String(b.id)} value={String(b.id)}>{b.branch_name}</option>)}
            </select>
          </label>
          <label>Joined on (optional)<input type="date" name="joined_on" style={field} /></label>
          <div style={{ alignSelf: "end" }}><SubmitButton label="Add person" /></div>
        </form>
      </section>
    </main>
  );
}

export default function SalariesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <SalariesContent {...props} />
    </Suspense>
  );
}
