import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { prettyPhone } from "@/lib/customer-phone";
import { isMissingColumn } from "@/lib/db-errors";
import { addEmployeeAction } from "@/lib/salary-actions";
import EmploymentPayFields from "@/components/EmploymentPayFields";
import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import { Badge, Notice, PageHeader, StatTile } from "@/components/ui";
import { cellTop as cell, box, bigButton, fieldFull as field } from "@/lib/ui/styles";
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
  // Newest columns first; fall back step by step on a database where later migrations are not run yet.
  let people: Row[] = [];
  for (const extra of [" e.employment_type, e.daily_wage, e.hourly_rate, e.employee_code,", " e.employment_type, e.daily_wage, e.hourly_rate,", ""]) {
    try {
      [people] = await db.execute<Row[]>(listSql(extra), [month, businessId]);
      break;
    } catch (error) {
      if (!isMissingColumn(error) || extra === "") throw error;
    }
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

  const typeWords: Record<string, string> = { FULL_TIME: "Full time", PART_TIME: "Part time", DAILY_WAGE: "Daily wage", HOURLY: "Hourly" };

  return (
    <main style={{ padding: 16, maxWidth: 1060 }}>
      <PageHeader
        title="Staff records"
        intro="Everyone who works here: their record, papers and letters, and whether this month's pay is done."
        actions={<>
          <a className="btn-link btn-link-primary" style={bigButton} href="#add">Add a person</a>
          <Link className="btn-link" href={`/accounting/payroll?month=${month}`}>Payroll</Link>
          <Link className="btn-link" href="/accounting/attendance">Attendance</Link>
          <Link className="btn-link" href="/accounting/staff-advances">Advances</Link>
          <Link className="btn-link" href="/accounting/letter-templates">Letter templates</Link>
        </>}
      />
      {query.saved && <Notice tone="ok">{query.saved.slice(0, 300)}</Notice>}
      {query.error && <Notice tone="error">{query.error.slice(0, 300)}</Notice>}

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", margin: "12px 0" }}>
        <Link className="btn-link" href={`/accounting/salaries?month=${shiftMonth(month, -1)}`}>← {monthLabel(shiftMonth(month, -1))}</Link>
        <strong style={{ fontSize: 18 }}>{monthLabel(month)}</strong>
        <Link className="btn-link" href={`/accounting/salaries?month=${shiftMonth(month, 1)}`}>{monthLabel(shiftMonth(month, 1))} →</Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
        <StatTile label="People working" value={active.length} />
        <StatTile label="Monthly salaries" value={inr(payable)} note="Full and part time" />
        <StatTile label={`Paid for ${monthLabel(month)}`} value={inr(paid)} />
        <StatTile label="Still to pay" value={waiting} note={waiting ? <Link href={`/accounting/payroll?month=${month}`}>Pay on the Payroll page</Link> : "Everyone is paid"} />
      </div>

      <section style={{ ...box, padding: 0, overflowX: "auto" }}>
        {people.length === 0 ? <p style={{ padding: 16 }}>No one added yet. Add the first person below.</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>{["Person", "Type", "Pay", monthLabel(month), ""].map((h) => <th key={h} style={{ ...cell, fontSize: 13, color: "#475569" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const left = p.status !== "ACTIVE";
                const slip = p.paid_amount !== null && p.phone
                  ? `https://wa.me/91${p.phone}?text=${encodeURIComponent(`Hello ${p.full_name}, your salary for ${monthLabel(month)} of ₹${Number(p.paid_amount).toLocaleString("en-IN")} was paid on ${p.paid_on}.` + (Number(p.advance_deducted) > 0 ? ` ₹${Number(p.advance_deducted).toLocaleString("en-IN")} was taken off for your advance; advance balance ₹${Number(p.advance_left).toLocaleString("en-IN")}.` : "") + ` - ${brand.shopName}`)}`
                  : null;
                return (
                  <tr key={String(p.id)} style={{ opacity: left ? 0.65 : 1 }}>
                    <td style={cell}>
                      <Link href={`/accounting/salaries/${p.id}`} style={{ fontWeight: 700, fontSize: 16 }}>{p.full_name}</Link>{left ? <> <Badge>Left</Badge></> : null}
                      <div style={{ color: "#64748b", fontSize: 13 }}>{[p.employee_code, p.job_title, p.phone ? prettyPhone(String(p.phone)) : null].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td style={cell}>{typeWords[String(p.employment_type ?? "FULL_TIME")] ?? "Full time"}</td>
                    <td style={{ ...cell, whiteSpace: "nowrap" }}>{payLabel(p).replace(/^Salary /, "")}</td>
                    <td style={cell}>
                      {p.paid_amount !== null ? (
                        <><Badge tone="ok">Paid {inr(p.paid_amount)}</Badge><div style={{ color: "#64748b", fontSize: 12.5, marginTop: 2 }}>on {p.paid_on}{Number(p.advance_deducted) > 0 ? ` · ${inr(p.advance_deducted)} off advance` : ""}</div></>
                      ) : left ? "—" : <Badge tone="wait">To pay</Badge>}
                    </td>
                    <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                      {slip && <a href={slip} target="_blank" rel="noreferrer" className="btn-link" style={{ marginRight: 6 }}>Pay message</a>}
                      <Link href={`/accounting/salaries/${p.id}`} className="btn-link btn-link-primary">Open</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <details id="add" open={people.length === 0} style={{ ...box }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 18 }}>Add a person</summary>
        <form action={addEmployeeAction} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginTop: 12 }}>
          <input type="hidden" name="month" value={month} />
          <label>Name<input name="full_name" required maxLength={150} style={field} /></label>
          <EmploymentPayFields showSalary />
          <label>Mobile (for pay slips)<input name="phone" inputMode="tel" style={field} /></label>
          <label>WhatsApp number for attendance and letters (optional)<input name="whatsapp_number" inputMode="numeric" maxLength={14} style={field} /></label>
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
        <p style={{ color: "#64748b", fontSize: 13 }}>The Employee ID is given automatically. You land on the person&apos;s record to take their papers and make the letter.</p>
      </details>
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
