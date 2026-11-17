import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getBrand } from "@/lib/brand";
import { loadPayrollSettings, toPaise } from "@/lib/payroll/data";
import { annualTax } from "@/lib/payroll/engine";
import { taxYearRule } from "@/lib/payroll/rules";
import PrintButton from "@/components/PrintButton";
import Letterhead from "@/components/Letterhead";

type Props = { searchParams: Promise<{ employee?: string; fy?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (p: bigint) => `₹${(Number(p) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const td: React.CSSProperties = { border: "1px solid #334155", padding: "6px 10px" };
const right: React.CSSProperties = { ...td, textAlign: "right" };
const QUARTERS = [["Q1 (Apr-Jun)", 4, 6], ["Q2 (Jul-Sep)", 7, 9], ["Q3 (Oct-Dec)", 10, 12], ["Q4 (Jan-Mar)", 1, 3]] as const;

/** Salary and tax details for the year (Part B of the salary tax certificate), from the payslips paid. */
async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const biz = user.legal_business_id;
  const q = await searchParams;
  const employeeId = Number(q.employee);
  const fy = Number(q.fy);
  if (!Number.isInteger(employeeId) || employeeId <= 0 || !Number.isInteger(fy) || fy < 2020 || fy > 2100) notFound();
  const [emps] = await db.query<Row[]>(`SELECT * FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [biz, employeeId]);
  const e = emps[0];
  if (!e) notFound();
  const [slips] = await db.query<Row[]>(
    `SELECT salary_month, gross, emp_pf, emp_pt, emp_tds, detail_json, tds_remittance_id
       FROM acct_payslips WHERE legal_business_id = ? AND employee_id = ? AND status = 'PAID' AND salary_month BETWEEN ? AND ?
      ORDER BY salary_month`,
    [biz, employeeId, `${fy}-04`, `${fy + 1}-03`]
  );
  const [challans] = await db.query<Row[]>(
    `SELECT id, salary_month, DATE_FORMAT(paid_on, '%d-%m-%Y') AS d, challan_no FROM acct_statutory_remittances
      WHERE legal_business_id = ? AND statute = 'TDS' AND salary_month BETWEEN ? AND ?`,
    [biz, `${fy}-04`, `${fy + 1}-03`]
  );
  const brand = await getBrand(biz);
  const settings = await loadPayrollSettings(biz);
  const { rule, assumed } = taxYearRule(fy);
  const regime = e.tax_regime === "OLD" ? "OLD" : "NEW";
  const r = rule[regime];

  const parts = new Map<string, bigint>();
  for (const s of slips) for (const x of (JSON.parse(String(s.detail_json || "{}")).earnings ?? []) as Array<{ name: string; earned: string }>) parts.set(x.name, (parts.get(x.name) ?? 0n) + toPaise(x.earned));
  const gross = slips.reduce((t, s) => t + toPaise(s.gross), 0n);
  const pt = slips.reduce((t, s) => t + toPaise(s.emp_pt), 0n);
  const tds = slips.reduce((t, s) => t + toPaise(s.emp_tds), 0n);
  const other = regime === "OLD" ? toPaise(e.old_regime_deductions) + pt : 0n;
  const taxable = gross - r.standardDeduction - other > 0n ? gross - r.standardDeduction - other : 0n;
  const tax = annualTax(taxable, r, rule.cessPct);
  const challanById = new Map(challans.map((c) => [Number(c.id), c]));
  const fyText = `${fy}-${String((fy + 1) % 100).padStart(2, "0")}`;

  return (
    <main style={{ maxWidth: 794, margin: "0 auto", padding: 24 }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 14mm; } }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <Link className="btn-link" href="/accounting/payroll/dues">← Statutory dues</Link>
        <PrintButton label="Print" />
      </div>
      <section data-print-sheet style={{ border: "1px solid #cbd5e1", padding: 24, background: "#fff", color: "#0f172a" }}>
        <Letterhead />
        <h2 style={{ textAlign: "center", margin: "16px 0 4px" }}>{rule.certificate.toUpperCase()}: SALARY AND TAX DETAILS (PART B)</h2>
        <p style={{ textAlign: "center", margin: "0 0 12px" }}>Financial year {fyText} · {regime === "NEW" ? "New" : "Old"} tax regime</p>
        {assumed ? <p style={{ color: "#b45309" }}>Tax rules for this year are not in the app yet; last year&apos;s were used. Check with your accountant.</p> : null}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            <tr><td style={td}><strong>Employer</strong> {brand.groupName}</td><td style={td}><strong>TAN</strong> {settings.tan || "—"}</td></tr>
            <tr><td style={td}><strong>Employee</strong> {String(e.full_name)}</td><td style={td}><strong>PAN</strong> {String(e.pan ?? "—")}</td></tr>
          </tbody>
        </table>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
          <tbody>
            {[...parts].map(([name, v]) => <tr key={name}><td style={td}>{name}</td><td style={right}>{inr(v)}</td></tr>)}
            <tr><td style={{ ...td, fontWeight: 700 }}>Gross salary</td><td style={{ ...right, fontWeight: 700 }}>{inr(gross)}</td></tr>
            <tr><td style={td}>Less: standard deduction</td><td style={right}>{inr(r.standardDeduction)}</td></tr>
            {regime === "OLD" ? <tr><td style={td}>Less: professional tax and declared deductions</td><td style={right}>{inr(other)}</td></tr> : null}
            <tr><td style={{ ...td, fontWeight: 700 }}>Taxable salary</td><td style={{ ...right, fontWeight: 700 }}>{inr(taxable)}</td></tr>
            <tr><td style={td}>Tax on taxable salary (after rebate, with {rule.cessPct}% cess)</td><td style={right}>{inr(tax)}</td></tr>
            <tr><td style={td}>Tax deducted from salary (TDS)</td><td style={right}>{inr(tds)}</td></tr>
            <tr><td style={{ ...td, fontWeight: 700 }}>{tax >= tds ? "Tax still payable" : "Tax deducted in excess"}</td><td style={{ ...right, fontWeight: 700 }}>{inr(tax >= tds ? tax - tds : tds - tax)}</td></tr>
          </tbody>
        </table>
        <h3>Tax deducted each quarter</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={td}>Quarter</th><th style={right}>Salary paid</th><th style={right}>TDS</th><th style={td}>Paid to government</th></tr></thead>
          <tbody>
            {QUARTERS.map(([name, a, b]) => {
              const inQ = slips.filter((s) => { const m = Number(String(s.salary_month).slice(5, 7)); return m >= a && m <= b; });
              const paidTo = [...new Set(inQ.map((s) => (s.tds_remittance_id ? challanById.get(Number(s.tds_remittance_id)) : null)).filter(Boolean).map((c) => `${c!.d}${c!.challan_no ? ` (${c!.challan_no})` : ""}`))];
              return (
                <tr key={name}>
                  <td style={td}>{name}</td>
                  <td style={right}>{inr(inQ.reduce((t, s) => t + toPaise(s.gross), 0n))}</td>
                  <td style={right}>{inr(inQ.reduce((t, s) => t + toPaise(s.emp_tds), 0n))}</td>
                  <td style={td}>{paidTo.join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: "#475569", marginTop: 12 }}>Prepared from the payslips paid through Payroll. Part A (tax deposited, from the tax department&apos;s TRACES site) is attached separately.</p>
        <p style={{ marginTop: 32 }}>For {brand.groupName.toUpperCase()}<br /><br />_____________________________<br />Authorised signatory</p>
      </section>
    </main>
  );
}

export default function Form130Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
