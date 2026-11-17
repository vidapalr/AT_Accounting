import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { todayInIndia } from "@/lib/format";
import { fyStartOf } from "@/lib/payroll/engine";
import { taxYearRule } from "@/lib/payroll/rules";
import { paymentAccounts } from "@/lib/payment-accounts";
import { remitStatutoryAction } from "@/lib/payroll-actions";
import { Field, Notice, PageHeader, Section } from "@/components/ui";
import PayFromFields from "@/components/PayFromFields";
import SubmitButton from "@/components/SubmitButton";
import { cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ month?: string; saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const shift = (m: string, d: number) => { const x = new Date(`${m}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + d); return x.toISOString().slice(0, 7); };

/** Statute, what it is in plain words, the employee and employer columns, and the usual due day of the next month. */
const STATUTES: Array<{ key: "PF" | "ESI" | "PT" | "TDS"; name: string; emp: string; er: string; dueDay: number | null }> = [
  { key: "PF", name: "Provident fund (EPFO)", emp: "emp_pf", er: "er_epf + er_eps + er_edli + er_pf_admin", dueDay: 15 },
  { key: "ESI", name: "ESI (ESIC)", emp: "emp_esi", er: "er_esi", dueDay: 15 },
  { key: "PT", name: "Professional tax (state)", emp: "emp_pt", er: "0", dueDay: null },
  { key: "TDS", name: "Income tax on salary (TDS)", emp: "emp_tds", er: "0", dueDay: 7 },
];

async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const biz = user.legal_business_id;
  const q = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? String(q.month) : shift(todayInIndia().slice(0, 7), -1);

  let totals: Row[] = [];
  let remitted: Row[] = [];
  try {
    [totals] = await db.query<Row[]>(
      `SELECT ${STATUTES.map((s) => `SUM(CASE WHEN ${s.key.toLowerCase()}_remittance_id IS NULL THEN ${s.emp} + ${s.er} ELSE 0 END) AS due_${s.key},
                                    SUM(${s.emp} + ${s.er}) AS all_${s.key}`).join(", ")},
              COUNT(*) AS paid_slips
         FROM acct_payslips WHERE legal_business_id = ? AND salary_month = ? AND status = 'PAID'`,
      [biz, month]
    );
    [remitted] = await db.query<Row[]>(
      `SELECT statute, DATE_FORMAT(paid_on, '%d-%m-%Y') AS d, amount, challan_no FROM acct_statutory_remittances
        WHERE legal_business_id = ? AND salary_month = ? ORDER BY id`,
      [biz, month]
    );
  } catch (error) {
    if (isMissingTable(error)) return <Notice tone="error">Payroll needs database file 088_payroll.sql. Ask for it to be run in phpMyAdmin.</Notice>;
    throw error;
  }
  const t = totals[0] ?? {};
  const accounts = await paymentAccounts(biz);
  const next = shift(month, 1);
  const fy = fyStartOf(month);
  const { rule } = taxYearRule(fy);
  const [people] = await db.query<Row[]>(
    `SELECT DISTINCT e.id, e.full_name FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.status = 'PAID' AND p.salary_month BETWEEN ? AND ? ORDER BY e.full_name`,
    [biz, `${fy}-04`, `${fy + 1}-03`]
  );
  const [missing] = await db.query<Row[]>(
    `SELECT e.id, e.full_name,
            (p.emp_pf > 0 AND (e.uan IS NULL OR e.uan = '')) AS no_uan,
            (p.esi_wages > 0 AND (e.esi_number IS NULL OR e.esi_number = '')) AS no_esi,
            (p.emp_tds > 0 AND (e.pan IS NULL OR e.pan = '')) AS no_pan
       FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.salary_month = ? AND p.status = 'PAID'
     HAVING no_uan = 1 OR no_esi = 1 OR no_pan = 1`,
    [biz, month]
  );
  const file = (kind: string, text: string) => <a className="btn-link" href={`/api/payroll/file?kind=${kind}&month=${month}`}>{text}</a>;

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader
        title={`Statutory dues: ${label(month)}`}
        intro="What was taken off salaries (and the employer's share) and is owed to the government, the files to upload, and a record of each payment."
        back={{ href: `/accounting/payroll?month=${month}`, label: "Payroll" }}
        actions={<>
          <Link className="btn-link" href={`/accounting/payroll/dues?month=${shift(month, -1)}`}>← {label(shift(month, -1))}</Link>
          <Link className="btn-link" href={`/accounting/payroll/dues?month=${next}`}>{label(next)} →</Link>
        </>}
      />
      {q.saved ? <Notice tone="ok">{q.saved}</Notice> : null}
      {q.error ? <Notice tone="error">{q.error}</Notice> : null}
      {Number(t.paid_slips ?? 0) === 0 ? <Notice tone="info">No salaries were paid through Payroll for {label(month)}.</Notice> : null}

      {STATUTES.map((s) => {
        const due = Number(t[`due_${s.key}`] ?? 0);
        const all = Number(t[`all_${s.key}`] ?? 0);
        if (all === 0) return null;
        const paid = remitted.filter((r) => r.statute === s.key);
        return (
          <Section key={s.key} title={s.name} aside={<span style={muted}>{s.dueDay ? `Usually due by ${s.dueDay} ${label(next)}` : "Due date: as per your state"}</span>}>
            <p>For {label(month)}: {inr(all)} in all · <strong>{due > 0 ? `${inr(due)} still to pay` : "fully paid"}</strong></p>
            {paid.length ? (
              <table style={{ borderCollapse: "collapse", marginBottom: 8 }}>
                <tbody>{paid.map((r, i) => <tr key={i}><td style={cell}>Paid {String(r.d)}</td><td style={cell}>{inr(r.amount)}</td><td style={cell}>{r.challan_no ? `Challan ${r.challan_no}` : ""}</td></tr>)}</tbody>
              </table>
            ) : null}
            {due > 0 ? (
              <form action={remitStatutoryAction} style={formGrid}>
                <input type="hidden" name="month" value={month} />
                <input type="hidden" name="statute" value={s.key} />
                <Field label="Paid on"><input type="date" name="paid_on" required defaultValue={todayInIndia()} style={fieldFull} /></Field>
                <Field label="Challan or reference number"><input name="challan_no" maxLength={60} style={fieldFull} /></Field>
                <PayFromFields accounts={accounts} allowOther />
                <div style={{ alignSelf: "end" }}><SubmitButton label={`Record ${s.key} paid`} question={`Record ${inr(due)} of ${s.key} for ${label(month)} as paid?`} /></div>
              </form>
            ) : null}
          </Section>
        );
      })}

      <Section title="Files to upload or give your accountant">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {file("ecr", "PF ECR file (EPFO portal)")}
          {file("esi", "ESI contribution sheet (ESIC portal)")}
          {file("pt", "Professional tax register")}
          {file("tds", `Salary TDS details for the quarter (${rule.quarterly})`)}
          {file("register", "Payroll register (all amounts)")}
        </div>
        {missing.length ? (
          <Notice tone="error">
            Missing details (fill them on each staff record before uploading):{" "}
            {missing.map((m, i) => (
              <span key={String(m.id)}>{i ? "; " : ""}<Link href={`/accounting/salaries/${m.id}`}>{String(m.full_name)}</Link>: {[Number(m.no_uan) ? "UAN" : "", Number(m.no_esi) ? "ESI number" : "", Number(m.no_pan) ? "PAN" : ""].filter(Boolean).join(", ")}</span>
            ))}
          </Notice>
        ) : null}
        <p style={muted}>People without a UAN, ESI number or PAN are left out of that file so the upload is not refused.</p>
      </Section>

      <Section title={`Salary tax certificates (${rule.certificate}) for FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`}>
        {people.length === 0 ? <p style={muted}>Nobody has been paid through Payroll this year yet.</p> : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {people.map((p) => <Link key={String(p.id)} className="btn-link" href={`/accounting/payroll/form130?employee=${p.id}&fy=${fy}`}>{String(p.full_name)}</Link>)}
          </div>
        )}
        <p style={muted}>Part A comes from the tax department (TRACES) after the quarterly statements are filed; this gives the salary and tax details (Part B) to print with it.</p>
      </Section>
    </main>
  );
}

export default function StatutoryDuesPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
