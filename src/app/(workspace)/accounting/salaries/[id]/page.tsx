import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { addPayChangeAction, saveStaffDatesAction } from "@/lib/staff-record-actions";
import { cell, box, bigButton, fieldBlock as field } from "@/lib/ui/styles";
import { saveEmployeeStatutoryAction, saveEmploymentAction } from "@/lib/payroll-actions";
import { saveStaffDetailsAction } from "@/lib/salary-actions";
import { loadComponents, loadCtcOptions, loadPayrollSettings } from "@/lib/payroll/data";
import { ctcFromGross, grossFromCtc, monthlyGrossFor, type Ctc } from "@/lib/payroll/ctc";
import { ctcForEmployee, defaultLetterType } from "@/lib/staff-letter-data";
import { addStaffPaperAction, removeStaffPaperAction, saveAadhaarAction, sendStaffPaperAction } from "@/lib/staff-paper-actions";
import { letterSendStatus } from "@/lib/letter-send";
import ConfirmButton from "@/components/ConfirmButton";
import { Badge, Notice, StatTile, Tabs } from "@/components/ui";
import { ACCEPT_KINDS, missingPapers, PAPER_KINDS, paperLabel } from "@/lib/staff-papers";
import { isMissingTable } from "@/lib/db-errors";
import EmploymentPayFields from "@/components/EmploymentPayFields";
import { ageAt } from "@/lib/payroll/engine";
import { inr as inrP, parseRupees } from "@/lib/reports/money";
import { todayInIndia } from "@/lib/format";

type Row = RowDataPacket & Record<string, string | number | null>;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string; ctc?: string; tab?: string }> };

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
  // Every type of work gets a cost to company: wage and hourly staff on a normal month (26 days, 8 hours).
  const { type: workType, normal } = await ctcForEmployee(businessId, e as Row, month);
  const grossNow = monthlyGrossFor(
    workType,
    { monthlySalary: parseRupees(String(e.monthly_salary ?? "0")) ?? 0n, dailyWage: parseRupees(String(e.daily_wage ?? "0")) ?? 0n, hourlyRate: parseRupees(String(e.hourly_rate ?? "0")) ?? 0n },
    normal
  );
  const ctcNow = ctcFromGross({ monthlyGross: grossNow, components, settings, options: ctcOptions, month, age });
  const askedCtc = q.ctc ? parseRupees(q.ctc) : null;
  const fit = askedCtc && askedCtc > 0n ? grossFromCtc({ annualCtc: askedCtc, components, settings, options: ctcOptions, month, age }) : null;
  const typeKnown = "employment_type" in e;

  // The person's folder of papers, and the company's own PF/ESI/PT numbers (from Registrations).
  let papers: Row[] = [];
  let papersReady = true;
  try {
    [papers] = await db.query<Row[]>(
      `SELECT id, folder, kind, label, mime_type, size_bytes, belongs_to, DATE_FORMAT(uploaded_at, '%d-%m-%Y') AS on_date
         FROM acct_employee_documents
        WHERE legal_business_id = ? AND employee_id = ? AND status = 'ACTIVE'
        ORDER BY folder, kind, uploaded_at DESC`,
      [businessId, Number(id)]
    );
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    papersReady = false;
  }
  const [companyNumbers] = await db.query<Row[]>(
    `SELECT kind, registration_no FROM acct_statutory_logins
      WHERE legal_business_id = ? AND status = 'ACTIVE' AND kind IN ('PF','ESI','PROFESSIONAL_TAX') AND registration_no IS NOT NULL`,
    [businessId]
  ).catch(() => [[] as Row[]]);
  const companyNo = new Map(companyNumbers.map((r) => [String(r.kind), String(r.registration_no)]));
  const stillToDo = missingPapers(papers.map((d) => String(d.kind)), String(e.employment_type ?? "FULL_TIME"));
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

  // Letters sent on WhatsApp and their acceptance, for the badges in the folder.
  const sends = papersReady ? await letterSendStatus(businessId, Number(id)) : new Map<number, { status: string; at: string; acceptedAt: string; error: string }>();
  const toAccept = papers.filter((p) => ACCEPT_KINDS.has(String(p.kind)) && !String(p.label ?? "").includes("(accepted copy)"));
  const acceptedCount = toAccept.filter((p) => sends.get(Number(p.id))?.status === "ACCEPTED").length;
  const waitingCount = toAccept.filter((p) => sends.get(Number(p.id))?.status === "SENT").length;
  const expectedKinds = PAPER_KINDS.filter((k) => k.expected).length;
  const tab = (["details", "pay", "papers", "statutory"] as const).find((t) => t === q.tab) ?? "details";
  const base = `/accounting/salaries/${e.id}`;
  const typeWords = { FULL_TIME: "Full time", PART_TIME: "Part time", DAILY_WAGE: "Daily wage", HOURLY: "Paid by the hour" }[workType];
  const payNow = workType === "DAILY_WAGE" ? `${e.daily_wage == null ? "—" : inr(e.daily_wage)} a day` : workType === "HOURLY" ? `${e.hourly_rate == null ? "—" : inr(e.hourly_rate)} an hour` : `${inr(e.monthly_salary)} a month`;

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <Link className="btn-link" href="/accounting/salaries">← Staff</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {String(e.full_name)} <Badge tone={e.status === "LEFT" ? "plain" : "ok"}>{e.status === "LEFT" ? "Left" : "Working"}</Badge>
          </h1>
          <div style={{ color: "#475569" }}>
            {[e.employee_code ? `Employee ID ${e.employee_code}` : "", e.job_title, typeWords, e.department, e.phone].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn-link btn-link-primary" style={bigButton} href={`${base}/letters`}>Make a letter</Link>
          <Link className="btn-link" style={bigButton} href={`${base}?tab=papers`}>Papers and letters</Link>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 16 }}>
        <StatTile label="Pay" value={payNow} note={typeWords} />
        <StatTile label="Cost to company a year" value={inrP(ctcNow.annual.ctc)} note={`Take-home ${inrP(ctcNow.takeHomeMonthly)} a month`} />
        <StatTile label="Papers on file" value={papersReady ? `${papers.length}` : "—"} note={stillToDo.length ? `Still to take: ${stillToDo.length}` : "Nothing missing"} />
        <StatTile label="Letters accepted" value={papersReady ? `${acceptedCount} of ${toAccept.length}` : "—"} note={waitingCount ? `${waitingCount} waiting for the person` : "None waiting"} />
      </div>

      {q.saved && <div style={{ marginTop: 14 }}><Notice tone="ok">{q.saved.slice(0, 400)}</Notice></div>}
      {q.error && <div style={{ marginTop: 14 }}><Notice tone="error">{q.error.slice(0, 400)}</Notice></div>}
      {!ready && <p role="alert">Not set up yet. Ask Claude for the database file named 062_staff_record.</p>}

      <Tabs base={base} current={tab} tabs={[
        { key: "details", label: "Details" },
        { key: "pay", label: "Pay and CTC" },
        { key: "papers", label: "Papers and letters", count: papersReady ? papers.length : undefined },
        { key: "statutory", label: "PF, ESI and tax" },
      ]} />

      {tab === "details" && (
        <>
      <section style={box} id="details">
        <h2>Contact and job details (for letters)</h2>
        {"employee_code" in e ? (
          <form action={saveStaffDetailsAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <input type="hidden" name="employee_id" value={String(e.id)} />
            <label>Email (letters are emailed too when this is filled)<input name="email" type="email" defaultValue={String(e.email ?? "")} maxLength={150} style={field} /></label>
            <label>Department<input name="department" defaultValue={String(e.department ?? "")} maxLength={100} placeholder="e.g. Sales" style={field} /></label>
            <label>Reports to<input name="reports_to" defaultValue={String(e.reports_to ?? "")} maxLength={150} placeholder="e.g. Shop manager" style={field} /></label>
            <label style={{ gridColumn: "1 / -1" }}>Home address<textarea name="home_address" defaultValue={String(e.home_address ?? "")} maxLength={300} rows={2} style={field} /></label>
            <div><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Save details</button></div>
          </form>
        ) : <p role="alert">Run migration 095 in phpMyAdmin to add the Employee ID, email and address.</p>}
      </section>
      <section style={box}>
        <h2>Type of work and attendance</h2>
        {typeKnown ? (
          <form action={saveEmploymentAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <input type="hidden" name="employee_id" value={String(e.id)} />
            <EmploymentPayFields
              type={String(e.employment_type ?? "FULL_TIME")}
              dailyWage={e.daily_wage == null ? "" : String(Number(e.daily_wage))}
              hourlyRate={e.hourly_rate == null ? "" : String(Number(e.hourly_rate))}
            />
            <label>WhatsApp number for attendance<input name="whatsapp_number" defaultValue={String(e.whatsapp_number ?? "")} inputMode="numeric" maxLength={14} style={field} /></label>
            <p style={{ gridColumn: "1 / -1", color: "#64748b", margin: 0 }}>
              The person sends <strong>IN</strong> when they arrive and <strong>OUT</strong> when they leave, from this number to the shop&apos;s WhatsApp.{" "}
              <Link href="/accounting/attendance">Attendance register</Link>
            </p>
            <div><button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Save type of work</button></div>
          </form>
        ) : <p role="alert">Run migrations 091 and 092 in phpMyAdmin to set the type of work and attendance.</p>}
      </section>
          {ready && (
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
          )}
        </>
      )}

      {tab === "pay" && (
        <>
      <section style={box}>
        <h2>Salary and cost to company (CTC)</h2>
        {workType === "DAILY_WAGE" ? (
          <p style={{ margin: "0 0 8px" }}>
            Daily wage {e.daily_wage == null ? "not set" : inr(e.daily_wage)} × {normal.daysAMonth} working days = {inrP(grossNow)} in a normal month.
            What is actually paid each month = daily wage × days present in the <Link href="/accounting/attendance">attendance register</Link>.
          </p>
        ) : workType === "HOURLY" ? (
          <p style={{ margin: "0 0 8px" }}>
            {e.hourly_rate == null ? "Rate for one hour not set" : `${inr(e.hourly_rate)} an hour`} × {normal.hoursADay} hours × {normal.daysAMonth} days = {inrP(grossNow)} in a normal month.
            What is actually paid each month = rate × hours worked, from the IN and OUT times in the <Link href="/accounting/attendance">attendance register</Link>.
          </p>
        ) : null}
        <CtcTable c={ctcNow} />
        <p style={{ color: "#64748b" }}>
          How CTC is worked out: 12 months of gross pay, plus the business&apos;s PF and ESI share (only when switched on in <Link href="/accounting/payroll/settings">Payroll settings</Link>), plus bonus and gratuity when ticked there. The pay is split into Basic, HRA and other parts as set in Payroll settings.
          {workType === "DAILY_WAGE" || workType === "HOURLY" ? ` A normal month is taken as ${normal.daysAMonth} working days of ${normal.hoursADay} hours; change that in Payroll settings.` : ""}
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
          {ready && (
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
        </>
      )}

      {tab === "statutory" && (
        <>
      {"uan" in e ? (
        <section style={box}>
          <h2>PF, ESI and income tax</h2>
          <p style={{ color: settings.pf.enabled || settings.esi.enabled || settings.pt.enabled ? "#166534" : "#92400e", margin: "0 0 10px" }}>
            {[["PF", settings.pf.enabled, "PF"], ["ESI", settings.esi.enabled, "ESI"], ["Professional tax", settings.pt.enabled, "PROFESSIONAL_TAX"]]
              .map(([label, on, key]) => `${label}: ${on ? `on for the company${companyNo.get(String(key)) ? ` (${companyNo.get(String(key))})` : ""}` : "off for the company"}`)
              .join(" · ")}
            .{" "}
            {settings.pf.enabled || settings.esi.enabled ? null : (
              <>Switch them on in <Link href="/accounting/payroll/settings">Payroll settings</Link> once the company is registered; nothing is taken from anyone until then. Keep the registration numbers and portal passwords on <Link href="/accounting/registrations">Registrations and portal logins</Link>.</>
            )}
          </p>
          {settings.pf.enabled && Number(e.pf_member ?? 1) === 1 && !e.uan ? (
            <p role="alert" style={{ color: "#92400e", margin: "0 0 10px" }}>PF is on for the company but this person has no UAN yet. Add it below; the PF file needs it.</p>
          ) : null}
          {settings.esi.enabled && Number(e.esi_member ?? 1) === 1 && !e.esi_number ? (
            <p role="alert" style={{ color: "#92400e", margin: "0 0 10px" }}>ESI is on for the company but this person has no ESI number yet. Add it below.</p>
          ) : null}
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
        </>
      )}

      {tab === "papers" && (
        <section style={box}>
          {!papersReady ? <p role="alert">Run migration 093 in phpMyAdmin to keep papers for each person.</p> : (
            <>
              {stillToDo.length ? (
                <Notice tone="warn">
                  Still to take: {stillToDo.map((k) => k.label).join(", ")}.{" "}
                  {stillToDo.some((k) => k.key.endsWith("LETTER")) ? <Link href={`${base}/letters?type=${defaultLetterType(e.employment_type)}`}>Make the letter now</Link> : null}
                </Notice>
              ) : <Notice tone="ok">Every paper this person needs is on file ({expectedKinds} required).</Notice>}

              {(["OFFICIAL", "PERSONAL"] as const).map((folder) => {
                const inFolder = papers.filter((d) => String(d.folder) === folder);
                return (
                  <div key={folder} style={{ marginTop: 18 }}>
                    <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{folder === "OFFICIAL" ? "Letters and official papers" : "Personal papers (ID, bank, certificates)"}</h2>
                    {inFolder.length === 0 ? <p style={{ color: "#64748b", margin: 0 }}>Nothing kept here yet.</p> : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {inFolder.map((docu) => {
                          const sent = sends.get(Number(docu.id));
                          const isPdf = String(docu.mime_type).includes("pdf");
                          const isCopy = String(docu.label ?? "").includes("(accepted copy)");
                          const askAccept = ACCEPT_KINDS.has(String(docu.kind)) && !isCopy;
                          return (
                            <div key={String(docu.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", background: "#fff" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <a href={`/api/staff-papers/${docu.id}`} target="_blank" rel="noreferrer">{String(docu.label || paperLabel(String(docu.kind)))}</a>
                                  {isCopy ? <Badge tone="ok">Signed copy</Badge>
                                    : sent?.status === "ACCEPTED" ? <Badge tone="ok" title={`Accepted on ${sent.acceptedAt}`}>Accepted {sent.acceptedAt.slice(0, 10)}</Badge>
                                    : sent?.status === "SENT" ? <Badge tone={askAccept ? "wait" : "info"} title={`Sent ${sent.at}`}>{askAccept ? "Waiting for acceptance" : "Sent"}</Badge>
                                    : sent?.status === "FAILED" ? <Badge tone="bad" title={sent.error}>Not sent</Badge>
                                    : null}
                                </div>
                                <div style={{ color: "#64748b", fontSize: 13 }}>
                                  {[paperLabel(String(docu.kind)), `kept ${String(docu.on_date)}`, sent?.status === "SENT" ? `sent ${sent.at}` : "", sent?.status === "FAILED" ? sent.error : ""].filter(Boolean).join(" · ")}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <a className="btn-link" href={`/api/staff-papers/${docu.id}`} target="_blank" rel="noreferrer">View</a>
                                {folder === "OFFICIAL" && isPdf && !isCopy && sent?.status !== "ACCEPTED" ? (
                                  <form action={sendStaffPaperAction}>
                                    <input type="hidden" name="employee_id" value={String(e.id)} />
                                    <input type="hidden" name="paper_id" value={String(docu.id)} />
                                    <ConfirmButton className="btn-link btn-link-primary" label={sent?.status === "SENT" || sent?.status === "FAILED" ? "Send again" : "Send on WhatsApp"}
                                      question={`Send this to ${String(e.full_name)} on WhatsApp${e.email ? " and email" : ""}?${askAccept ? " They will be asked to tap I accept." : ""}`} />
                                  </form>
                                ) : null}
                                {sent?.status !== "ACCEPTED" || isCopy ? (
                                  <form action={removeStaffPaperAction}>
                                    <input type="hidden" name="employee_id" value={String(e.id)} />
                                    <input type="hidden" name="paper_id" value={String(docu.id)} />
                                    <ConfirmButton label="Remove" question="Remove this paper from the folder? The file is deleted." />
                                  </form>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              <details style={{ marginTop: 20 }} open={papers.length === 0}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>Add a paper (Aadhaar, PAN, bank, certificate...)</summary>
                <div style={{ marginTop: 12 }}>
            <form action={addStaffPaperAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
              <input type="hidden" name="employee_id" value={String(e.id)} />
              <label>What is it
                <select name="kind" defaultValue="AADHAAR" style={field}>
                  <optgroup label="Personal">
                    {PAPER_KINDS.filter((k) => k.folder === "PERSONAL").map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </optgroup>
                  <optgroup label="Official">
                    {PAPER_KINDS.filter((k) => k.folder === "OFFICIAL").map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </optgroup>
                </select>
              </label>
              <label>File (PDF, JPG or PNG, up to 5 MB)<input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required style={field} /></label>
              <label>Note (optional)<input name="label" maxLength={150} style={field} /></label>
              <div style={{ alignSelf: "end" }}><button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Keep in the folder</button></div>
            </form>
            <form action={saveAadhaarAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", margin: "12px 0" }}>
              <input type="hidden" name="employee_id" value={String(e.id)} />
              <label style={{ display: "grid", gap: 4 }}>Aadhaar number (only the last 4 digits are kept)
                <input name="aadhaar" inputMode="numeric" maxLength={14} placeholder={e.aadhaar_last4 ? `XXXX XXXX ${String(e.aadhaar_last4)}` : "12 digits"} style={{ ...field, width: 220 }} />
              </label>
              <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Save Aadhaar</button>
              {e.aadhaar_last4 ? <span style={{ color: "#64748b" }}>On record: ending {String(e.aadhaar_last4)}</span> : null}
            </form>
                </div>
              </details>
              <p style={{ color: "#64748b", fontSize: 13 }}>
                Only people who may see salaries can open these papers. Letters are made on <Link href={`${base}/letters`}>Make a letter</Link> and kept here with one press; then send them from here. A letter to accept comes back as a signed copy when the person taps I accept on WhatsApp. The full Aadhaar number is never stored.
              </p>
            </>
          )}
        </section>
      )}
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
