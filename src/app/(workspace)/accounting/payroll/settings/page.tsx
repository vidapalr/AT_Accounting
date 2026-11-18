import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { businessSettings } from "@/lib/business-settings";
import { PAYROLL_KEYS } from "@/lib/payroll/data";
import { ESI_DEFAULTS, PF_CEILINGS, PT_PRESETS } from "@/lib/payroll/rules";
import { savePayComponentsAction, savePayrollSettingsAction } from "@/lib/payroll-actions";
import { Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { cellTopCompact as cell, field, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
const rs = (p: bigint) => Number(p / 100n).toLocaleString("en-IN");

async function Content({ searchParams }: Props) {
  const user = await requireAccess("salary");
  const q = await searchParams;
  const owner = user.role === "GROUP_OWNER";
  const s = await businessSettings(user.legal_business_id, [...PAYROLL_KEYS]);
  let parts: RowDataPacket[] = [];
  try {
    [parts] = await db.query<RowDataPacket[]>(
      `SELECT code, name, percent_bps, pf_wage, esi_wage, status FROM acct_pay_components WHERE legal_business_id = ? ORDER BY sort_order, id`,
      [user.legal_business_id]
    );
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  const blankRows = Array.from({ length: 2 }, (_, i) => ({ code: `NEW${i + 1}`, name: "", percent_bps: null, pf_wage: 0, esi_wage: 1, status: "INACTIVE" }));
  const ceiling = PF_CEILINGS[PF_CEILINGS.length - 1];
  const tick = (name: string, labelText: string, checked: boolean, hint?: string) => (
    <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <input type="checkbox" name={name} value="1" defaultChecked={checked} disabled={!owner} style={{ marginTop: 4 }} />
      <span>{labelText}{hint ? <span style={{ ...muted, display: "block" }}>{hint}</span> : null}</span>
    </label>
  );

  return (
    <main style={{ maxWidth: 980 }}>
      <PageHeader title="Payroll settings" intro="Which deductions apply, and how a salary is split. Only the owner can change these." back={{ href: "/accounting/payroll", label: "Payroll" }} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      <Notice tone="info">
        Switch a deduction on only when the business is registered for it. Current rules built in: PF 12% + 12% on wages up to ₹{rs(ceiling.wageCeiling)} (from {ceiling.from}); ESI 0.75% + 3.25% when wages are up to ₹{rs(ESI_DEFAULTS.wageLimit)}; income tax by the year&apos;s slabs. Ask your accountant before switching on.
      </Notice>

      <form action={savePayrollSettingsAction}>
        <Section title="Deductions">
          <div style={{ display: "grid", gap: 12 }}>
            {tick("payroll_pf_enabled", "Provident fund (PF)", s.payroll_pf_enabled === "1", "The business has a PF code from EPFO.")}
            {tick("payroll_pf_full_wages", "PF on full wages (not limited to the ceiling)", s.payroll_pf_full_wages === "1", "Leave off unless you and the staff agreed to contribute on the whole wage.")}
            {tick("payroll_pf_fifty_rule", "Count allowances above half the pay as PF wages", s.payroll_pf_fifty_rule !== "0", "Labour codes: when allowances are more than half of the pay, the excess counts as wages. Keep on unless your accountant says otherwise.")}
            {tick("payroll_esi_enabled", "ESI", s.payroll_esi_enabled === "1", "The business has an ESI code from ESIC.")}
            {tick("payroll_pt_enabled", "Professional tax", s.payroll_pt_enabled === "1")}
            {tick("payroll_tds_enabled", "Income tax (TDS) on salary", s.payroll_tds_enabled === "1", "Worked out each month from the year's tax slabs and spread over the months left.")}
          </div>
        </Section>
        <Section title="Professional tax and TAN">
          <div style={formGrid}>
            <Field label="State for professional tax">
              <select name="payroll_pt_state" defaultValue={s.payroll_pt_state ?? ""} disabled={!owner} style={fieldFull}>
                <option value="">Not chosen</option>
                {Object.entries(PT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                <option value="CUSTOM">Other state (type the slabs)</option>
              </select>
            </Field>
            <Field label="Slabs for another state" hint="Monthly gross up to = tax, e.g. 15000=0; 20000=150; *=200 (and *=200/300 for a different February amount).">
              <input name="payroll_pt_slabs" defaultValue={s.payroll_pt_slabs ?? ""} disabled={!owner} style={fieldFull} />
            </Field>
            <Field label="TAN (for income tax on salary)" hint="10 characters, from the tax department. Printed on the salary tax certificate.">
              <input name="payroll_tan" defaultValue={s.payroll_tan ?? ""} maxLength={10} disabled={!owner} style={fieldFull} />
            </Field>
          </div>
        </Section>
        <Section title="Cost to company (CTC)">
          <p style={muted}>CTC = 12 months of gross salary + the business&apos;s PF and ESI share + the items ticked below. It is shown on every staff record, whatever way the person is paid, and in offer letters.</p>
          <div style={{ display: "grid", gap: 12 }}>
            {tick("payroll_ctc_bonus", "Include statutory bonus (8.33% of basic, for pay up to ₹21,000 a month)", s.payroll_ctc_bonus === "1")}
            {tick("payroll_ctc_gratuity", "Include gratuity provision (4.81% of basic)", s.payroll_ctc_gratuity === "1", "Gratuity is payable after 5 years of service (1 year for fixed-term staff under the labour codes).")}
          </div>
          <div style={formGrid}>
            <Field label="Basic counted for bonus, per month (₹)" hint="₹7,000, or the state minimum wage if that is higher.">
              <input name="payroll_bonus_wage_cap" defaultValue={s.payroll_bonus_wage_cap ?? "7000"} inputMode="numeric" disabled={!owner} style={fieldFull} />
            </Field>
            <Field label="Working days in a normal month" hint="Used to show a cost to company for daily-wage and hourly staff.">
              <input name="payroll_ctc_days" defaultValue={s.payroll_ctc_days ?? "26"} inputMode="numeric" disabled={!owner} style={fieldFull} />
            </Field>
            <Field label="Working hours in a day" hint="Used to show a cost to company for hourly staff.">
              <input name="payroll_ctc_hours" defaultValue={s.payroll_ctc_hours ?? "8"} inputMode="numeric" disabled={!owner} style={fieldFull} />
            </Field>
          </div>
        </Section>
        {owner ? <SubmitButton label="Save deductions" /> : null}
      </form>

      <form action={savePayComponentsAction}>
        <Section title="How a salary is split">
          <p style={muted}>Each part is a share of the monthly salary. Leave one share empty: that part gets whatever is left. Untick &quot;Use&quot; to stop using a part.</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={cell}>Use</th><th style={cell}>Name</th><th style={cell}>Share (%)</th><th style={cell}>Counts for PF</th><th style={cell}>Counts for ESI</th></tr></thead>
            <tbody>
              {[...parts, ...blankRows].map((p) => (
                <tr key={String(p.code)}>
                  <td style={cell}><input type="hidden" name="code" value={String(p.code)} /><input type="checkbox" name="active" value={String(p.code)} defaultChecked={p.status === "ACTIVE"} disabled={!owner} aria-label="Use" /></td>
                  <td style={cell}><input name="name" defaultValue={String(p.name ?? "")} maxLength={60} disabled={!owner} style={field} aria-label="Name" /></td>
                  <td style={cell}><input name="percent" defaultValue={p.percent_bps === null ? "" : String(Number(p.percent_bps) / 100)} inputMode="decimal" disabled={!owner} style={{ ...field, width: 90 }} aria-label="Share" /></td>
                  <td style={cell}><input type="checkbox" name="pf_wage" value={String(p.code)} defaultChecked={Number(p.pf_wage) === 1} disabled={!owner} aria-label="Counts for PF" /></td>
                  <td style={cell}><input type="checkbox" name="esi_wage" value={String(p.code)} defaultChecked={Number(p.esi_wage) === 1} disabled={!owner} aria-label="Counts for ESI" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        {owner ? <SubmitButton label="Save salary parts" /> : null}
      </form>
    </main>
  );
}

export default function PayrollSettingsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
