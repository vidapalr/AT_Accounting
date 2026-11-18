import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { prettyPhone } from "@/lib/customer-phone";
import { isMissingColumn } from "@/lib/db-errors";
import { addEmployeeAction, updateEmployeeAction } from "@/lib/salary-actions";
import EmploymentPayFields from "@/components/EmploymentPayFields";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";
import { cellTop as cell, box, fieldFull as field } from "@/lib/ui/styles";
import { getBrand } from "@/lib/brand";
import { todayInIndia } from "@/lib/format";

type Props = { searchParams: Promise<{ month?: string; saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

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
  const brand = await getBrand();
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const nowMonth = todayInIndia().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month ?? "") ? String(query.month) : nowMonth;

  const listSql = (extra: string) =>
    `SELECT e.id, e.full_name, e.phone, e.job_title, e.monthly_salary, e.status,${extra}
            s.amount AS paid_amount, s.advance_deducted, DATE_FORMAT(s.paid_on, '%d %b') AS paid_on,
            COALESCE((SELECT SUM(a.amount) FROM acct_staff_advances a WHERE a.employee_id = e.id AND a.legal_business_id = e.legal_business_id), 0)
              - COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.employee_id = e.id), 0) AS advance_left,
            (SELECT MAX(a.instalment) FROM acct_staff_advances a WHERE a.employee_id = e.id AND a.legal_business_id = e.legal_business_id
               AND a.amount > COALESCE((SELECT SUM(r.amount) FROM acct_staff_advance_recoveries r WHERE r.advance_id = a.id), 0)) AS instalment
       FROM acct_employees e
       LEFT JOIN acct_salary_payments s
         ON s.employee_id = e.id AND s.legal_business_id = e.legal_business_id AND s.salary_month = ?
      WHERE e.legal_business_id = ? AND (e.status = 'ACTIVE' OR s.id IS NOT NULL)
      ORDER BY e.status, e.full_name`;
  let people: Row[] = [];
  try {
    [people] = await db.execute<Row[]>(listSql(" e.employment_type, e.daily_wage, e.hourly_rate,"), [month, businessId]);
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    [people] = await db.execute<Row[]>(listSql(""), [month, businessId]);
  }
  // The salary in force for the month shown (pay changes can start on a later date).
  try {
    const [hist] = await db.execute<Row[]>(
      `SELECT employee_id, monthly_salary FROM acct_employee_pay_history
        WHERE legal_business_id = ? AND effective_from <= LAST_DAY(?) ORDER BY effective_from, id`,
      [businessId, `${month}-01`]
    );
    const inForce = new Map<number, unknown>();
    for (const h of hist) inForce.set(Number(h.employee_id), h.monthly_salary);
    for (const person of people) if (inForce.has(Number(person.id))) person.monthly_salary = inForce.get(Number(person.id));
  } catch { /* migration 062 not run yet: the saved salary is used */ }

  const [branches] = await db.execute<Row[]>(
    `SELECT id, branch_name FROM acct_branches WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY branch_name`,
    [businessId]
  );

  const active = people.filter((p) => p.status === "ACTIVE");
  const monthlyStaff = (p: Row) => !["DAILY_WAGE", "HOURLY"].includes(String(p.employment_type ?? "FULL_TIME"));
  const payLabel = (p: Row) =>
    String(p.employment_type) === "DAILY_WAGE"
      ? `${p.daily_wage == null ? "Daily wage not set" : `${inr(p.daily_wage)} a day`}`
      : String(p.employment_type) === "HOURLY"
        ? `${p.hourly_rate == null ? "Hourly rate not set" : `${inr(p.hourly_rate)} an hour`}`
        : `Salary ${inr(p.monthly_salary)}`;
  const payable = active.filter(monthlyStaff).reduce((s, p) => s + Number(p.monthly_salary), 0);
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
            ? `https://wa.me/91${p.phone}?text=${encodeURIComponent(`Hello ${p.full_name}, your salary for ${monthLabel(month)} of ₹${Number(p.paid_amount).toLocaleString("en-IN")} was paid on ${p.paid_on}.` + (Number(p.advance_deducted) > 0 ? ` ₹${Number(p.advance_deducted).toLocaleString("en-IN")} was taken off for your advance; advance balance ₹${Number(p.advance_left).toLocaleString("en-IN")}.` : "") + ` - ${brand.shopName}`)}`
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
                    <>{payLabel(p)}</>
                  )}
                </span>
              </div>

              {p.paid_amount === null && !left && (
                <Link href={`/accounting/payroll?month=${month}`} className="btn-link btn-link-primary">Pay on the Payroll page</Link>
              )}
              <a href={`/accounting/salaries/${p.id}`} className="btn-link">Staff record</a>
              {slip && <a href={slip} target="_blank" rel="noreferrer" className="btn-link">Send pay slip on WhatsApp</a>}

              {!left && (
                <details>
                  <summary style={{ cursor: "pointer", color: "#64748b" }}>Change pay or mark as left</summary>
                  {monthlyStaff(p) ? (
                    <form action={updateEmployeeAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
                      <input type="hidden" name="month" value={month} />
                      <input type="hidden" name="employee_id" value={String(p.id)} />
                      <input type="hidden" name="what" value="SALARY" />
                      <input name="monthly_salary" inputMode="decimal" defaultValue={String(Number(p.monthly_salary))} style={{ ...field, width: 140 }} aria-label="New monthly salary" />
                      <SubmitButton label="Save new salary" className="btn-link" />
                    </form>
                  ) : (
                    <p style={{ margin: "8px 0" }}><a href={`/accounting/salaries/${p.id}`} className="btn-link">Change the wage on the staff record</a></p>
                  )}
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
          <EmploymentPayFields showSalary />
          <label>Mobile (for pay slips)<input name="phone" inputMode="tel" style={field} /></label>
          <label>WhatsApp number for attendance (optional)<input name="whatsapp_number" inputMode="numeric" maxLength={14} style={field} /></label>
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
