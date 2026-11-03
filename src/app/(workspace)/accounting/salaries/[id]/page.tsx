import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { addPayChangeAction, saveStaffDatesAction } from "@/lib/staff-record-actions";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const field: React.CSSProperties = { display: "block", padding: 10, fontSize: 16, width: "100%", marginTop: 4 };
const inr = (v: unknown) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("salary");
  const { id } = await params;
  const q = await searchParams;
  if (!/^[1-9]\d{0,9}$/.test(id)) notFound();
  const businessId = user.legal_business_id;

  const [emp] = await db.execute<RowDataPacket[]>(
    `SELECT * FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [businessId, Number(id)]);
  const e = emp[0];
  if (!e) notFound();
  const d = (v: unknown) => (v ? new Date(v as string).toLocaleDateString("en-CA") : "");

  let ready = true;
  let history: RowDataPacket[] = [];
  try {
    [history] = await db.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(effective_from, '%d-%m-%Y') AS f, monthly_salary, note
         FROM acct_employee_pay_history WHERE legal_business_id = ? AND employee_id = ?
        ORDER BY effective_from DESC, id DESC`, [businessId, Number(id)]);
  } catch {
    ready = false;
  }
  const [paid] = await db.execute<RowDataPacket[]>(
    `SELECT salary_month, amount, advance_deducted, DATE_FORMAT(paid_on, '%d-%m-%Y') AS p
       FROM acct_salary_payments WHERE legal_business_id = ? AND employee_id = ? ORDER BY salary_month DESC LIMIT 24`,
    [businessId, Number(id)]).catch(() => [[] as RowDataPacket[]]);

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <Link className="btn-link" href="/accounting/salaries">← Salaries</Link>
      <h1>{String(e.full_name)}{e.status === "LEFT" ? " (left)" : ""}</h1>
      <p style={{ color: "#64748b" }}>{[e.job_title, e.phone].filter(Boolean).join(" · ")} · Salary now {inr(e.monthly_salary)}</p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved.slice(0, 220)}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error.slice(0, 220)}</p>}
      {!ready && <p role="alert">Not set up yet. Ask Claude for the database file named 062_staff_record.</p>}

      {ready && (
        <>
          <section style={box}>
            <h2>Joined, notice and leaving</h2>
            <form action={saveStaffDatesAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <input type="hidden" name="employee_id" value={String(e.id)} />
              <label>Joined on<input type="date" name="joined_on" defaultValue={d(e.joined_on)} style={field} /></label>
              <label>Gave notice on<input type="date" name="notice_given_on" defaultValue={d(e.notice_given_on)} style={field} /></label>
              <label>Last working day<input type="date" name="left_on" defaultValue={d(e.left_on)} style={field} /></label>
              <div style={{ alignSelf: "end" }}><button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Save dates</button></div>
            </form>
            <p style={{ color: "#64748b", fontSize: 13 }}>Once the last working day has come, the person is marked as left. Earlier payments stay in the books.</p>
          </section>

          <section style={box}>
            <h2>Pay changes</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["From", "Monthly salary", "Note"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}><td style={cell}>{String(h.f)}</td><td style={cell}>{inr(h.monthly_salary)}</td><td style={cell}>{String(h.note ?? "")}</td></tr>
                ))}
              </tbody>
            </table>
            <h3>Change the pay</h3>
            <form action={addPayChangeAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <input type="hidden" name="employee_id" value={String(e.id)} />
              <label>New monthly salary (₹)<input name="monthly_salary" inputMode="decimal" required style={field} /></label>
              <label>Starts on<input type="date" name="effective_from" required defaultValue={new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)} style={field} /></label>
              <label>Note (optional)<input name="note" maxLength={200} style={field} /></label>
              <div style={{ alignSelf: "end" }}><button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Save pay change</button></div>
            </form>
          </section>
        </>
      )}

      <section style={box}>
        <h2>Salary paid</h2>
        {paid.length === 0 ? <p>No salary paid yet.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Month", "Paid", "Taken off advance", "On"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {paid.map((p, i) => (
                <tr key={i}><td style={cell}>{String(p.salary_month)}</td><td style={cell}>{inr(p.amount)}</td><td style={cell}>{Number(p.advance_deducted) > 0 ? inr(p.advance_deducted) : ""}</td><td style={cell}>{String(p.p)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default function StaffRecordPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
