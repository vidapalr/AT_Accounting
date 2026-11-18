import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { todayInIndia } from "@/lib/format";
import { loadPayrollSettings } from "@/lib/payroll/data";
import { paymentAccounts } from "@/lib/payment-accounts";
import { payPayslipsAction, preparePayrollAction, removePayslipDraftAction, updatePayslipAction } from "@/lib/payroll-actions";
import { EmptyState, Notice, PageHeader, Section } from "@/components/ui";
import PayFromFields from "@/components/PayFromFields";
import SubmitButton from "@/components/SubmitButton";
import { cellTopCompact as cell, field, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ month?: string; saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const WORK_WORDS: Record<string, string> = { PART_TIME: "part time", DAILY_WAGE: "daily wage", HOURLY: "paid by the hour" };
const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const shift = (m: string, d: number) => { const x = new Date(`${m}-01T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + d); return x.toISOString().slice(0, 7); };
const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const biz = user.legal_business_id;
  const q = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month ?? "") ? String(q.month) : todayInIndia().slice(0, 7);

  let slips: Row[] = [];
  try {
    [slips] = await db.query<Row[]>(
      `SELECT p.*, e.full_name, e.job_title, e.employment_type
         FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
        WHERE p.legal_business_id = ? AND p.salary_month = ? ORDER BY p.status DESC, e.full_name`,
      [biz, month]
    );
  } catch (error) {
    if (isMissingTable(error)) return <Notice tone="error">Payroll needs database file 088_payroll.sql. Ask for it to be run in phpMyAdmin.</Notice>;
    throw error;
  }
  const settings = await loadPayrollSettings(biz);
  // When the monthly job last worked pay slips out on its own: "<time>|<month>|<count>".
  const [runRows] = await db.query<Row[]>(
    `SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = 'payroll_last_run'`,
    [biz]
  ).catch(() => [[] as Row[]]);
  const runParts = String(runRows[0]?.setting_value ?? "").split("|");
  const lastRun = runParts.length === 3 && /^\d{4}-\d{2}$/.test(runParts[1])
    ? { on: new Date(runParts[0]).toLocaleDateString("en-GB").replaceAll("/", "-"), month: runParts[1], count: Number(runParts[2]) || 0 }
    : null;
  const accounts = await paymentAccounts(biz);
  const drafts = slips.filter((s) => s.status === "DRAFT");
  const sum = (k: string) => slips.reduce((t, s) => t + Number(s[k] ?? 0), 0);
  const on = (b: boolean) => (b ? "on" : "off");

  return (
    <main style={{ maxWidth: 1200 }}>
      <PageHeader
        title={`Payroll: ${label(month)}`}
        intro="Work out everyone's pay for the month, check the days, then pay. PF, ESI, professional tax and income tax are taken off by themselves when they are switched on."
        actions={<>
          <Link className="btn-link" href={`/accounting/payroll?month=${shift(month, -1)}`}>← {label(shift(month, -1))}</Link>
          <Link className="btn-link" href={`/accounting/payroll?month=${shift(month, 1)}`}>{label(shift(month, 1))} →</Link>
        </>}
      />
      {q.saved ? <Notice tone="ok">{q.saved}</Notice> : null}
      {q.error ? <Notice tone="error">{q.error}</Notice> : null}
      <p style={muted}>
        PF {on(settings.pf.enabled)} · ESI {on(settings.esi.enabled)} · Professional tax {on(settings.pt.enabled)} · Income tax (TDS) {on(settings.tds.enabled)} ·{" "}
        <Link href="/accounting/payroll/settings">Payroll settings</Link> · <Link href={`/accounting/payroll/dues?month=${month}`}>Statutory dues and returns</Link>
      </p>

      {lastRun ? (
        <p style={muted}>
          The monthly job last worked out pay slips for {label(lastRun.month)} on {lastRun.on} ({lastRun.count} pay slip{lastRun.count === 1 ? "" : "s"}), from the{" "}
          <Link href="/accounting/attendance">attendance register</Link>. Nothing is paid until someone presses Pay below.
        </p>
      ) : null}

      <form action={preparePayrollAction} style={{ margin: "12px 0" }}>
        <input type="hidden" name="month" value={month} />
        <SubmitButton label={slips.length ? "Work out again (paid ones stay as they are)" : `Work out payslips for ${label(month)}`} />
      </form>

      {slips.length === 0 ? (
        <EmptyState>No payslips for {label(month)} yet. Press the button above to work them out for everyone on the staff list.</EmptyState>
      ) : (
        <Section title="Payslips" aside={<span style={muted}>{drafts.length} to pay · {slips.length - drafts.length} paid</span>}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={cell}>Pay</th><th style={cell}>Person</th><th style={cell}>Days paid</th><th style={num}>Gross</th>
                  <th style={num}>PF</th><th style={num}>ESI</th><th style={num}>Prof. tax</th><th style={num}>TDS</th>
                  <th style={cell}>Advance back</th><th style={num}>Net pay</th><th style={num}>Employer share</th><th style={cell}></th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => {
                  const draft = s.status === "DRAFT";
                  const er = Number(s.er_epf) + Number(s.er_eps) + Number(s.er_edli) + Number(s.er_pf_admin) + Number(s.er_esi);
                  const notes = (JSON.parse(String(s.detail_json || "{}")).notes ?? []) as string[];
                  return (
                    <tr key={String(s.id)}>
                      <td style={cell}>{draft ? <input type="checkbox" name="payslip_id" value={String(s.id)} form="pay-form" defaultChecked aria-label={`Pay ${s.full_name}`} /> : <span style={{ color: "#15803d" }}>Paid</span>}</td>
                      <td style={cell}>{String(s.full_name)}<div style={muted}>{[String(s.job_title ?? ""), WORK_WORDS[String(s.employment_type ?? "")] ?? ""].filter(Boolean).join(" · ")}{notes.length ? ` · ${notes.join(" ")}` : ""}</div></td>
                      <td style={cell}>
                        {draft ? <input name="paid_days" form={`upd-${s.id}`} defaultValue={String(Number(s.paid_days))} inputMode="decimal" style={{ ...field, width: 70 }} aria-label="Days paid" /> : Number(s.paid_days)}
                        <span style={muted}> / {Number(s.days_in_month)}</span>
                      </td>
                      <td style={num}>{inr(s.gross)}</td>
                      <td style={num}>{inr(s.emp_pf)}</td>
                      <td style={num}>{inr(s.emp_esi)}</td>
                      <td style={num}>{inr(s.emp_pt)}</td>
                      <td style={num}>{inr(s.emp_tds)}</td>
                      <td style={cell}>{draft ? <input name="advance" form={`upd-${s.id}`} defaultValue={String(Number(s.advance_deducted))} inputMode="decimal" style={{ ...field, width: 90 }} aria-label="Advance to take back" /> : inr(s.advance_deducted)}</td>
                      <td style={{ ...num, fontWeight: 700 }}>{inr(s.net_pay)}</td>
                      <td style={num}>{inr(er)}</td>
                      <td style={cell}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {draft ? (
                            <>
                              <form id={`upd-${s.id}`} action={updatePayslipAction}>
                                <input type="hidden" name="payslip_id" value={String(s.id)} />
                                <input type="hidden" name="month" value={month} />
                                <button type="submit" className="btn-link btn-link-small">Update</button>
                              </form>
                              <form action={removePayslipDraftAction}>
                                <input type="hidden" name="payslip_id" value={String(s.id)} />
                                <input type="hidden" name="month" value={month} />
                                <button type="submit" className="btn-link btn-link-small">Remove</button>
                              </form>
                            </>
                          ) : null}
                          <Link className="btn-link btn-link-small" href={`/accounting/payroll/payslip/${s.id}`}>Payslip</Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700 }}>
                  <td style={cell}></td><td style={cell}>Total</td><td style={cell}></td>
                  <td style={num}>{inr(sum("gross"))}</td><td style={num}>{inr(sum("emp_pf"))}</td><td style={num}>{inr(sum("emp_esi"))}</td>
                  <td style={num}>{inr(sum("emp_pt"))}</td><td style={num}>{inr(sum("emp_tds"))}</td><td style={cell}>{inr(sum("advance_deducted"))}</td>
                  <td style={num}>{inr(sum("net_pay"))}</td>
                  <td style={num}>{inr(sum("er_epf") + sum("er_eps") + sum("er_edli") + sum("er_pf_admin") + sum("er_esi"))}</td><td style={cell}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p style={muted}>Change days or the advance on a row, then press Update on that row to work it out again.</p>
        </Section>
      )}

      {drafts.length > 0 ? (
        <Section title="Pay the ticked people">
          <form id="pay-form" action={payPayslipsAction} style={formGrid}>
            <input type="hidden" name="month" value={month} />
            <PayFromFields accounts={accounts} />
            <div style={{ alignSelf: "end" }}>
              <SubmitButton label="Pay now" question={`Pay the ticked people for ${label(month)}? Net pay leaves the chosen account; PF, ESI, professional tax and TDS stay owing until you pay them on Statutory dues.`} />
            </div>
          </form>
        </Section>
      ) : null}
    </main>
  );
}

export default function PayrollPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
