import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { DAY_STATUSES, hoursWorked, monthHours, monthMarks } from "@/lib/attendance";
import { loadRegister, unmatchedPunches } from "@/lib/attendance-data";
import { markAttendanceAction, markWeeklyOffAction } from "@/lib/attendance-actions";
import { paidDaysFromAttendance, type EmploymentType } from "@/lib/payroll/ctc";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ month?: string; saved?: string; error?: string }> };
const SHORT = new Map(DAY_STATUSES.map((s) => [s.key, s.short]));
const COLOUR: Record<string, string> = { P: "#e5f4e4", H: "#f9eeda", A: "#fbebeb", L: "#e7f1fb", W: "#f0efec", O: "#f0efec" };
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const q = await searchParams;
  const today = todayInIndia();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? q.month! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const { ready, rows } = await loadRegister(user.legal_business_id, month);
  const strays = await unmatchedPunches(user.legal_business_id);
  const noNumber = rows.filter((r) => !r.whatsapp);
  const todayRows = rows.map((r) => ({ r, d: r.days.get(today) })).filter((x) => x.d);

  return (
    <main style={{ maxWidth: 1200 }}>
      <PageHeader
        title="Attendance register"
        intro="Staff send IN when they arrive and OUT when they leave, on WhatsApp, from the number saved on their staff record. You can also mark any day by hand."
      />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 091 in phpMyAdmin to switch on the attendance register.</Notice> : null}
      <form method="get" style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 12 }}>
        <Field label="Month"><input type="month" name="month" defaultValue={month} style={fieldFull} /></Field>
        <button type="submit" className="btn-link" style={{ cursor: "pointer" }}>Show</button>
      </form>

      {strays.length ? (
        <Section title="IN or OUT from a number nobody has">
          <table style={{ borderCollapse: "collapse" }}>
            <thead><tr><th style={cell}>Number</th><th style={cell}>Said</th><th style={cell}>When</th></tr></thead>
            <tbody>
              {strays.map((x, i) => (
                <tr key={i}><td style={cell}>{x.phone}</td><td style={cell}>{x.word}</td><td style={cell}>{x.date} {x.time}</td></tr>
              ))}
            </tbody>
          </table>
          <p style={muted}>
            These messages were not marked because no staff record has that number. Open the person under{" "}
            <Link href="/accounting/salaries">Staff records</Link>, put the number in <strong>WhatsApp number for attendance</strong>, press{" "}
            <strong>Save type of work</strong>, and ask them to send IN again. The message itself cannot be marked later; mark that day by hand below.
          </p>
        </Section>
      ) : null}

      {month === today.slice(0, 7) ? (
        <Section title={`Today (${today})`}>
          {todayRows.length === 0 ? <EmptyState>Nobody has sent IN yet today.</EmptyState> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={cell}>Person</th><th style={cell}>IN</th><th style={cell}>OUT</th><th style={cell}>Hours</th><th style={cell}>From</th></tr></thead>
              <tbody>
                {todayRows.map(({ r, d }) => (
                  <tr key={r.id}>
                    <td style={cell}>{r.name}</td>
                    <td style={cell}>{d!.inTime ?? "—"}</td>
                    <td style={cell}>{d!.outTime ?? "—"}</td>
                    <td style={cell}>{hoursWorked(d!.inTime, d!.outTime) ?? "—"}</td>
                    <td style={cell}>{d!.source === "WHATSAPP" ? "WhatsApp" : "Marked by hand"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      ) : null}

      <Section title="The month">
        {rows.length === 0 ? <EmptyState>No staff. Add people under <Link href="/accounting/salaries">Staff records</Link>.</EmptyState> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...cell, position: "sticky", left: 0, background: "#fff" }}>Person</th>
                  {dates.map((d) => <th key={d} style={{ ...cell, padding: 4, textAlign: "center" }}>{Number(d.slice(8))}</th>)}
                  <th style={cell}>Present</th><th style={cell}>Absent</th><th style={cell}>Hours</th><th style={cell}>Days paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const marks = monthMarks([...r.days.values()]);
                  const paid = r.days.size ? paidDaysFromAttendance(r.type as EmploymentType, days, marks) : null;
                  return (
                    <tr key={r.id}>
                      <td style={{ ...cell, position: "sticky", left: 0, background: "#fff", whiteSpace: "nowrap" }}>
                        <Link href={`/accounting/salaries/${r.id}`}>{r.name}</Link>
                        <div style={muted}>{r.type === "DAILY_WAGE" ? "Daily wage" : r.type === "HOURLY" ? "Paid by the hour" : r.type === "PART_TIME" ? "Part time" : "Full time"}</div>
                      </td>
                      {dates.map((d) => {
                        const day = r.days.get(d);
                        const s = day?.status ? SHORT.get(day.status) ?? "" : "";
                        return (
                          <td key={d} title={day ? `${day.inTime ?? ""}${day.outTime ? `-${day.outTime}` : ""}` : ""} style={{ ...cell, padding: 4, textAlign: "center", background: s ? COLOUR[s] : undefined }}>
                            {s}
                          </td>
                        );
                      })}
                      <td style={cell}>{marks.present + marks.half / 2}</td>
                      <td style={cell}>{marks.absent}</td>
                      <td style={cell}>{r.days.size ? monthHours([...r.days.values()]) : "—"}</td>
                      <td style={cell}>{r.type === "HOURLY" ? "paid by the hour" : paid ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p style={muted}>
          {DAY_STATUSES.map((s) => `${s.short} = ${s.label}`).join(" · ")}. Days paid: daily wage = days present; monthly staff = days in the month less days marked absent (unmarked days are not cut). People paid by the hour are paid for the hours in this table. Payroll uses these figures.
        </p>
        <p style={muted}>
          IN and OUT on WhatsApp work for: {rows.filter((r) => r.whatsapp).map((r) => `${r.name} (${r.whatsapp})`).join(", ") || "nobody yet"}.
          {noNumber.length ? ` No number saved yet for ${noNumber.map((r) => r.name).join(", ")} — open the person under Staff records and save it.` : ""}
        </p>
      </Section>

      {ready ? (
        <form action={markAttendanceAction}>
          <input type="hidden" name="month" value={month} />
          <Section title="Mark a day by hand">
            <div style={formGrid}>
              <Field label="Person">
                <select name="employee_id" required defaultValue="" style={fieldFull}>
                  <option value="" disabled>Choose…</option>
                  {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Date"><input type="date" name="work_date" defaultValue={today.slice(0, 7) === month ? today : `${month}-01`} required style={fieldFull} /></Field>
              <Field label="Day">
                <select name="status" defaultValue="PRESENT" style={fieldFull}>
                  {DAY_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  <option value="CLEAR">Clear the day (no mark)</option>
                </select>
              </Field>
              <Field label="IN (optional)"><input type="time" name="in_time" style={fieldFull} /></Field>
              <Field label="OUT (optional)"><input type="time" name="out_time" style={fieldFull} /></Field>
            </div>
            <Field label="Note (optional)"><input name="note" maxLength={200} style={fieldFull} /></Field>
          </Section>
          <SubmitButton label="Save the day" />
        </form>
      ) : null}

      {ready ? (
        <form action={markWeeklyOffAction}>
          <input type="hidden" name="month" value={month} />
          <Section title="Weekly off for the month">
            <p style={muted}>Marks the chosen weekday as weekly off for all monthly staff this month. Days already marked are left as they are.</p>
            <Field label="Day of the week">
              <select name="weekday" defaultValue="0" style={fieldFull}>
                {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}
              </select>
            </Field>
          </Section>
          <SubmitButton label="Mark weekly off" className="btn-link" />
        </form>
      ) : null}
    </main>
  );
}

export default function AttendancePage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
