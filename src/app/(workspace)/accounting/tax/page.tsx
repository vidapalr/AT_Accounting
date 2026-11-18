import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr, toNumber } from "@/lib/reports/money";
import { advanceTaxPlan, loadLoans, loadTaxDocuments, taxTablesReady } from "@/lib/tax/data";
import { daysUntil } from "@/lib/tax/advance-tax";
import { formNames, parseTaxYear, returnDueDate, taxYearLabel, taxYearOf } from "@/lib/tax/tax-year";
import { saveTaxSettingsAction } from "@/lib/tax-actions";
import TaxPackNav from "@/components/accounting/TaxPackNav";
import SubmitButton from "@/components/SubmitButton";
import { Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ year?: string; saved?: string; error?: string }> };

const dateText = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const FORM_WORDS: Record<string, string> = { PROPRIETORSHIP: "Proprietorship (taxed as the owner)", PARTNERSHIP: "Partnership firm", LLP: "LLP", COMPANY: "Company", OTHER: "Other" };
const STATUS_WORDS = { PAID: "Paid", SHORT: "Short", NEXT: "Pay next", LATER: "Later" } as const;

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const thisYear = taxYearOf(today);
  const year = parseTaxYear(q.year, today);
  const owner = user.role === "GROUP_OWNER";
  const ready = await taxTablesReady();
  const names = formNames(year);
  const data = await advanceTaxPlan(user.legal_business_id, year, today);
  const { settings, plan, tax } = data;
  const docs = await loadTaxDocuments(user.legal_business_id, year);
  const loans = await loadLoans(user.legal_business_id, year);
  const individual = settings.legalForm === "PROPRIETORSHIP";
  const due = returnDueDate(year, settings.audited);
  const next = plan.next;
  const daysLeft = next ? daysUntil(today, next.due) : null;
  const short = plan.rows.filter((r) => r.status === "SHORT");

  const checklist = [
    { done: data.challans.length > 0, text: "Every advance tax payment entered", href: "/accounting/tax/challans" },
    { done: data.statement.readAt !== null, text: `${names.statementShort} read and matched`, href: "/accounting/tax/statement" },
    { done: docs.some((d) => d.kind === "AIS") && docs.some((d) => d.kind === "TIS"), text: "AIS and TIS downloaded and kept", href: "/accounting/tax/statement" },
    { done: loans.every((l) => l.loan.status === "CLOSED" || l.certified?.interest != null), text: "Interest certificate figures typed for every loan", href: "/accounting/tax/loans" },
    { done: settings.opening !== null, text: "Opening tax values of assets given (from the last return)", href: "/accounting/tax/depreciation" },
    { done: today > `${year + 1}-03-31`, text: "Closing stock and lists of who owes and whom you owe at 31 March", href: "/accounting/tax/year-figures" },
    ...(individual && settings.regime === "OLD" ? [{ done: settings.optOutAck !== "", text: "Opt-out of the new tax regime filed (acknowledgement number saved)", href: "#answers" }] : []),
  ];

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader
        title="Income tax and year-end pack"
        intro={`Tax year ${taxYearLabel(year)} (${names.act}). Plan advance tax from the profit in the books, keep every tax paper, and download everything for your accountant in one file.`}
        actions={<a className="btn-link btn-link-primary" href={`/api/tax/pack?year=${year}`}>Download for your accountant (ZIP)</a>}
      />
      <TaxPackNav current="/accounting/tax" year={year} thisYear={thisYear} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 089 in phpMyAdmin to switch on tax payments, the tax statement, loans and papers. The estimate below works already.</Notice> : null}

      {plan.notRequired ? (
        <Notice tone="ok">On these figures the year&apos;s tax after TDS is under ₹10,000, so no advance tax is needed. Check again after each quarter.</Notice>
      ) : next ? (
        <Notice tone={daysLeft !== null && daysLeft <= 10 ? "error" : "info"}>
          Next advance tax: <strong>{inr(next.amount)}</strong> by <strong>{dateText(next.due)}</strong>
          {daysLeft !== null ? ` (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : ""}. Pay on the e-filing site (e-Pay Tax), then enter the challan under <Link href={`/accounting/tax/challans?year=${year}`}>Tax paid</Link>.
        </Notice>
      ) : (
        <Notice tone="ok">Every advance tax instalment for {taxYearLabel(year)} is covered by the payments entered.</Notice>
      )}
      {short.length ? (
        <Notice tone="error">
          {short.length} instalment{short.length === 1 ? " was" : "s were"} short. Interest of about {inr(plan.interestTotal)} may be charged ({names.interestSections}, 1% a month). Paying the balance soon keeps it from growing.
        </Notice>
      ) : null}

      <Section title="This year's tax (estimate)">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={cell}>Net profit in the books so far</td><td style={{ ...cell, textAlign: "right" }}>{inr(data.profitSoFar)}</td></tr>
            <tr><td style={cell}>Whole year at the same pace ({Math.round(data.projection.share * 100)}% of the year gone)</td><td style={{ ...cell, textAlign: "right" }}>{inr(data.projection.projected)}</td></tr>
            {settings.estimate !== null ? <tr><td style={cell}>Your own estimate (used instead)</td><td style={{ ...cell, textAlign: "right" }}>{inr(settings.estimate)}</td></tr> : null}
            <tr><td style={cell}>Income tax on {inr(data.income)}<span style={{ ...muted, display: "block" }}>{tax.basis}</span></td><td style={{ ...cell, textAlign: "right" }}>{inr(tax.total)}</td></tr>
            <tr><td style={cell}>Less TDS already taken by customers ({names.statementShort})</td><td style={{ ...cell, textAlign: "right" }}>− {inr(data.tdsCredit)}</td></tr>
            <tr><td style={{ ...cell, fontWeight: 700 }}>Tax to pay as advance tax</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{inr(plan.netTax)}</td></tr>
          </tbody>
        </table>
        <p style={muted}>
          An estimate to plan cash, not a tax return: it does not include other income, deductions or set-off of losses. {tax.approximate ? "Surcharge is shown without marginal relief, so the figure may be slightly high. " : ""}Your accountant confirms the final figure.
        </p>
      </Section>

      <Section title="Instalments">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={cell}>Due by</th><th style={cell}>Share of the year</th><th style={{ ...cell, textAlign: "right" }}>Should be paid</th><th style={{ ...cell, textAlign: "right" }}>Paid by then</th><th style={{ ...cell, textAlign: "right" }}>Short</th><th style={cell}>Status</th></tr></thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={r.due}>
                <td style={cell}>{dateText(r.due)}</td>
                <td style={cell}>{r.cumulativePct}%</td>
                <td style={{ ...cell, textAlign: "right" }}>{inr(r.cumulativeDue)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{inr(r.paidByDue)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{r.shortfall ? inr(r.shortfall) : "—"}</td>
                <td style={cell}>{STATUS_WORDS[r.status]}{r.interest ? <span style={{ ...muted, display: "block" }}>interest about {inr(r.interest)}</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={muted}>{settings.presumptive ? "Presumptive income: the whole advance tax is due in one go by 15 March." : `Rules: ${names.advanceTaxSection}. 15% by 15 June, 45% by 15 September, 75% by 15 December, 100% by 15 March.`} Paid so far this year: {inr(plan.paidTotal)}.</p>
      </Section>

      <form action={saveTaxSettingsAction} id="answers">
        <input type="hidden" name="year" value={year} />
        <Section title="Your answers">
          <p style={muted}>Kind of business: <strong>{FORM_WORDS[settings.legalForm] ?? settings.legalForm}</strong> (change it on <Link href="/group">Business details</Link>).</p>
          <div style={formGrid}>
            {individual ? (
              <Field label="Tax regime" hint="The new regime is the default. The old regime allows deductions but needs an opt-out form every time you switch.">
                <select name="tax_regime" defaultValue={settings.regime} disabled={!owner} style={fieldFull}>
                  <option value="NEW">New regime (default)</option>
                  <option value="OLD">Old regime</option>
                </select>
              </Field>
            ) : <input type="hidden" name="tax_regime" value={settings.regime} />}
            {settings.legalForm === "COMPANY" ? (
              <Field label="Company tax rate" hint="Ask your accountant which option the company has chosen.">
                <select name="tax_company_scheme" defaultValue={settings.companyScheme} disabled={!owner} style={fieldFull}>
                  <option value="22">22% scheme (about 25.17% with surcharge and cess)</option>
                  <option value="25">25% (smaller companies)</option>
                  <option value="30">30%</option>
                </select>
              </Field>
            ) : <input type="hidden" name="tax_company_scheme" value={settings.companyScheme} />}
            <Field label={`Expected profit for ${taxYearLabel(year)} (optional)`} hint="Leave empty to use the projection from the books.">
              <input name="estimate" defaultValue={settings.estimate === null ? "" : String(toNumber(settings.estimate))} inputMode="decimal" disabled={!owner} style={fieldFull} />
            </Field>
          </div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="tax_presumptive" value="1" defaultChecked={settings.presumptive} disabled={!owner} /> Income is declared on a presumptive basis (small business, fixed share of turnover)</label>
            <label style={{ display: "flex", gap: 8 }}><input type="checkbox" name="tax_audited" value="1" defaultChecked={settings.audited} disabled={!owner} /> Accounts must be audited (return due 31 October instead of 31 July)</label>
          </div>
          {individual ? (
            <div style={{ marginTop: 12 }}>
              <Notice tone="info">
                Return due by <strong>{dateText(due)}</strong>. To be taxed under the old regime with business income, file {names.optOut} before that date and put its acknowledgement number in the return. Staying in the new regime needs nothing.
              </Notice>
              <Field label="Opt-out acknowledgement number (if filed)">
                <input name="optout_ack" defaultValue={settings.optOutAck} maxLength={40} disabled={!owner} style={fieldFull} />
              </Field>
            </div>
          ) : <p style={muted}>Return due by {dateText(due)}.</p>}
        </Section>
        {owner ? <SubmitButton label="Save answers" /> : <p style={muted}>Only the owner can change these answers.</p>}
      </form>

      <Section title="Before you send the year to your accountant">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {checklist.map((c) => (
            <li key={c.text}>
              <span aria-hidden style={{ display: "inline-block", width: 24 }}>{c.done ? "✓" : "○"}</span>
              <Link href={c.href.startsWith("#") ? c.href : `${c.href}?year=${year}`}>{c.text}</Link>
              {c.done ? null : <span style={muted}> — to do</span>}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 16 }}><a className="btn-link btn-link-primary" href={`/api/tax/pack?year=${year}`}>Download for your accountant (ZIP)</a></p>
        <p style={muted}>The download has one Excel file (profit and loss, balance sheet, trial balance, sales by month, who owes, whom you owe, closing stock, fixed assets with tax depreciation, loans, tax paid, {names.statementShort}, salaries and TDS) and every tax paper kept here.</p>
      </Section>
    </main>
  );
}

export default function TaxPackPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
