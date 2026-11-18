import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { addPayChangeAction, saveStaffDatesAction } from "@/lib/staff-record-actions";
import { cell, box, fieldBlock as field } from "@/lib/ui/styles";
import { saveEmployeeStatutoryAction, saveEmploymentAction } from "@/lib/payroll-actions";
import { loadComponents, loadCtcOptions, loadPayrollSettings } from "@/lib/payroll/data";
import { ctcFromGross, EMPLOYMENT_TYPES, grossFromCtc, type Ctc } from "@/lib/payroll/ctc";
import { ageAt } from "@/lib/payroll/engine";
import { inr as inrP, parseRupees } from "@/lib/reports/money";
import { todayInIndia } from "@/lib/format";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; ctc?: string }> };

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

  // Cost to company of the current salary, and (when asked) the salary that fits a yearly CTC.
  const month = todayInIndia().slice(0, 7);
  const [settings, components, ctcOptions] = await Promise.all([loadPayrollSettings(businessId), loadComponents(businessId), loadCtcOptions(businessId)]);
  const age = ageAt(month, e.date_of_birth ? new Date(e.date_of_birth as string).toISOString().slice(0, 10) : null);
  const ctcNow = ctcFromGross({ monthlyGross: parseRupees(String(e.monthly_salary ?? "0")) ?? 0n, components, settings, options: ctcOptions, month, age });
  const askedCtc = q.ctc ? parseRupees(q.ctc) : null;
  const fit = askedCtc && askedCtc > 0n ? grossFromCtc({ annualCtc: askedCtc, components, settings, options: ctcOptions, month, age }) : null;
  const typeKnown = "employment_type" in e;
  const CtcTable = ({ c }: { c: Ctc }) => (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        <tr><td style={cell}>Monthly gross salary (Basic {inrP(c.basic)} + other parts)</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.monthlyGross)}</td></tr>
        <tr><td style={cell}>Business&apos;s PF share each month (PF, pension, EDLI, admin)</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.employerMonthly.pf)}</td></tr>
        <tr><td style={cell}>Business&apos;s ESI share each month</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.employerMonthly.esi)}</td></tr>
        <tr><td style={cell}>Statutory bonus for the year</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.annual.bonus)}</td></tr>
        <tr><td style={cell}>Gratuity provision for the year</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.annual.gratuity)}</td></tr>
        <tr style={{ fontWeight: 700 }}><td style={cell}>Cost to company (CTC) a year</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.annual.ctc)}</td></tr>
        <tr><td style={cell}>Take-home each month before income tax (gross less the person&apos;s PF, ESI and professional tax)</td><td style={{ ...cell, textAlign: "right" }}>{inrP(c.takeHomeMonthly)}</td></tr>
      </tbody>
    </table>
  );

  return (
    <main style={{ padding: 24, maxWidth: 820 }}>
      <Link className="btn-link" href="/accounting/salaries">← Salaries</Link>
      <h1>{String(e.full_name)}{e.status === "LEFT" ? " (left)" : ""}</h1>
      <p><Link className="btn-link btn-link-primary" href={`/accounting/salaries/${e.id}/letters`}>Letters and pay slip</Link></p>
      <p style={{ color: "#64748b" }}>{[e.job_title, e.phone].filter(Boolean).join(" · ")} · Salary now {inr(e.monthly_salary)}</p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved.slice(0, 220)}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error.slice(0, 220)}</p>}
      {!ready && <p role="alert">Not set up yet. Ask Claude for the database file named 062_staff_record.</p>}

      <section style={box}>
        <h2>Type of work and attendance</h2>
        {typeKnown ? (
          <form action={saveEmploymentAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <input type="hidden" name="employee_id" value={String(e.id)} />
            <label>Type of work
              <select name="employment_type" defaultValue={String(e.employment_type ?? "FULL_TIME")} style={field}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label>Daily wage (₹, daily-wage staff)<input name="daily_wage" defaultValue={e.daily_wage == null ? "" : String(Number(e.daily_wage))} inputMode="decimal" style={field} /></label>
            <label>WhatsApp number for attendance<input name="whatsapp_number" defaultValue={String(e.whatsapp_number ?? "")} inputMode="numeric" maxLength={14} style={field} /></label>
            <p style={{ gridColumn: "1 / -1", color: "#64748b", margin: 0 }}>
              The person sends <strong>IN</strong> when they arrive and <strong>OUT</strong> when they leave, from this number to the shop&apos;s WhatsApp. Daily wage is paid for days present; monthly staff are cut only for days marked absent.{" "}
              <Link href="/accounting/attendance">Attendance register</Link>
            </p>
            <div><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Save type of work</button></div>
          </form>
        ) : <p role="alert">Run migration 091 in phpMyAdmin to set the type of work and attendance.</p>}
      </section>

      <section style={box}>
        <h2>Salary and cost to company (CTC)</h2>
        {String(e.employment_type ?? "") === "DAILY_WAGE" ? (
          <p>Daily wage {e.daily_wage == null ? "not set" : inr(e.daily_wage)}: about {e.daily_wage == null ? "—" : inr(Number(e.daily_wage) * 26)} for 26 working days in a month. Pay each month = daily wage × days present.</p>
        ) : <CtcTable c={ctcNow} />}
        <p style={{ color: "#64748b" }}>
          How CTC is worked out: 12 months of gross salary, plus the business&apos;s PF and ESI share (only when switched on in <Link href="/accounting/payroll/settings">Payroll settings</Link>), plus bonus and gratuity when ticked there. The salary is split into Basic, HRA and other parts as set in Payroll settings.
        </p>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label>Offering a yearly CTC? Type it (₹)<input name="ctc" defaultValue={q.ctc ?? ""} inputMode="decimal" style={field} /></label>
          <button type="submit" className="btn-link" style={{ cursor: "pointer" }}>Work out the monthly salary</button>
        </form>
        {fit ? (
          <>
            <h3>For a CTC of {inrP(askedCtc ?? 0n)} a year</h3>
            <CtcTable c={fit} />
            <p style={{ color: "#64748b" }}>To use it, add a pay change below with the monthly gross {inrP(fit.monthlyGross)}.</p>
          </>
        ) : null}
      </section>

      {"uan" in e ? (
        <section style={box}>
          <h2>PF, ESI and income tax</h2>
          <form action={saveEmployeeStatutoryAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <input type="hidden" name="employee_id" value={String(e.id)} />
            <label>Date of birth<input type="date" name="date_of_birth" defaultValue={d(e.date_of_birth)} style={field} /></label>
            <label>PAN<input name="pan" defaultValue={String(e.pan ?? "")} maxLength={10} style={field} /></label>
            <label>UAN (PF number, 12 digits)<input name="uan" defaultValue={String(e.uan ?? "")} inputMode="numeric" maxLength={12} style={field} /></label>
            <label>Name as in PF records<input name="name_as_per_uan" defaultValue={String(e.name_as_per_uan ?? "")} maxLength={150} style={field} /></label>
            <label>ESI number<input name="esi_number" defaultValue={String(e.esi_number ?? "")} inputMode="numeric" maxLength={17} style={field} /></label>
            <label>Income tax regime
              <select name="tax_regime" defaultValue={String(e.tax_regime ?? "NEW")} style={field}>
                <option value="NEW">New regime (most people)</option>
                <option value="OLD">Old regime (has chosen it)</option>
              </select>
            </label>
            <label>Old regime: yearly deductions declared (₹)<input name="old_regime_deductions" defaultValue={String(Number(e.old_regime_deductions ?? 0))} inputMode="decimal" style={field} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="pf_member" value="1" defaultChecked={Number(e.pf_member ?? 1) === 1} /> PF is taken</label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="esi_member" value="1" defaultChecked={Number(e.esi_member ?? 1) === 1} /> ESI is taken (when wages are within the limit)</label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="pt_applicable" value="1" defaultChecked={Number(e.pt_applicable ?? 1) === 1} /> Professional tax is taken</label>
            <div><button type="submit" className="btn-link btn-link-primary">Save PF, ESI and tax details</button></div>
          </form>
        </section>
      ) : null}

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
