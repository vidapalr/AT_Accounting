import type { RowDataPacket } from "mysql2";

import { getBrand } from "@/lib/brand";

type Earning = { code: string; name: string; full: string; earned: string };
const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const td: React.CSSProperties = { border: "1px solid #334155", padding: "6px 10px" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * A full payslip: earnings with the days paid, every deduction, net pay, and the employer's share.
 * Reads one acct_payslips row (with the person's name, job, PAN, UAN and ESI number joined in).
 */
export default async function PayslipView({ p }: { p: RowDataPacket }) {
  const brand = await getBrand();
  const detail = JSON.parse(String(p.detail_json ?? "{}")) as { earnings?: Earning[]; notes?: string[] };
  const [yy, mm] = String(p.salary_month).split("-");
  const deductions: Array<[string, unknown]> = [
    ["Provident fund (PF)", p.emp_pf],
    ["ESI", p.emp_esi],
    ["Professional tax", p.emp_pt],
    ["Income tax (TDS)", p.emp_tds],
    ["Advance taken back", p.advance_deducted],
  ].filter(([, v]) => Number(v) > 0) as Array<[string, unknown]>;
  const totalDeductions = deductions.reduce((t, [, v]) => t + Number(v), 0);
  const employer = Number(p.er_epf) + Number(p.er_eps) + Number(p.er_edli) + Number(p.er_pf_admin) + Number(p.er_esi);

  return (
    <div>
      <h2 style={{ textAlign: "center", margin: "16px 0" }}>PAY SLIP: {MONTHS[Number(mm) - 1]} {yy}</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <tbody>
          <tr><td style={td}><strong>Name</strong> {String(p.full_name)}</td><td style={td}><strong>Job</strong> {String(p.job_title ?? "—")}</td></tr>
          <tr><td style={td}><strong>Days paid</strong> {Number(p.paid_days)} of {Number(p.days_in_month)}</td><td style={td}><strong>Monthly salary</strong> {inr(p.monthly_salary)}</td></tr>
          <tr><td style={td}><strong>PAN</strong> {String(p.pan ?? "—")}</td><td style={td}><strong>UAN</strong> {String(p.uan ?? "—")} · <strong>ESI</strong> {String(p.esi_number ?? "—")}</td></tr>
        </tbody>
      </table>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={td}>Earnings</th><th style={{ ...td, textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {(detail.earnings ?? []).map((e) => <tr key={e.code}><td style={td}>{e.name}</td><td style={{ ...td, textAlign: "right" }}>{inr(e.earned)}</td></tr>)}
            <tr><td style={{ ...td, fontWeight: 700 }}>Gross pay</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(p.gross)}</td></tr>
          </tbody>
        </table>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={td}>Deductions</th><th style={{ ...td, textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {deductions.length === 0 ? <tr><td style={td} colSpan={2}>None</td></tr> : deductions.map(([k, v]) => <tr key={k}><td style={td}>{k}</td><td style={{ ...td, textAlign: "right" }}>{inr(v)}</td></tr>)}
            <tr><td style={{ ...td, fontWeight: 700 }}>Total deductions</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(totalDeductions)}</td></tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 18, fontWeight: 800, margin: "14px 0" }}>Net pay: {inr(p.net_pay)}{p.paid_on ? <span style={{ fontWeight: 400, fontSize: 14 }}> · paid on {new Date(String(p.paid_on)).toLocaleDateString("en-GB")}</span> : <span style={{ fontWeight: 400, fontSize: 14, color: "#b45309" }}> · not paid yet</span>}</p>
      {employer > 0 ? <p style={{ fontSize: 13, color: "#475569" }}>Paid by {brand.groupName} on top of your salary: PF and pension {inr(Number(p.er_epf) + Number(p.er_eps))}, ESI {inr(p.er_esi)}.</p> : null}
      {(detail.notes ?? []).map((n, i) => <p key={i} style={{ fontSize: 13, color: "#b45309" }}>{n}</p>)}
      <p style={{ marginTop: 32 }}>For {brand.groupName.toUpperCase()}<br /><br />_____________________________<br />Authorised signatory</p>
    </div>
  );
}

/** The SQL that reads a payslip with the person's details, for PayslipView. */
export const PAYSLIP_SELECT = `SELECT p.*, e.full_name, e.job_title, e.pan, e.uan, e.esi_number
  FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id`;
