import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr } from "@/lib/reports/money";
import { loadLoans, loadTaxDocuments, taxTablesReady } from "@/lib/tax/data";
import { parseTaxYear, taxYearLabel, taxYearOf } from "@/lib/tax/tax-year";
import { removeTaxPaperAction, saveLoanAction, saveLoanYearAction, uploadTaxPaperAction } from "@/lib/tax-actions";
import TaxPackNav from "@/components/accounting/TaxPackNav";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { box, cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ year?: string; edit?: string; saved?: string; error?: string }> };
const KIND_WORDS: Record<string, string> = { TERM: "Business loan", VEHICLE: "Vehicle loan", OVERDRAFT: "Overdraft / cash credit", GOLD: "Gold loan", OTHER: "Other loan" };
const money = (p: bigint | null | undefined) => (p === null || p === undefined ? "" : String(Number(p) / 100));

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const year = parseTaxYear(q.year, today);
  const ready = await taxTablesReady();
  const loans = await loadLoans(user.legal_business_id, year);
  const docs = (await loadTaxDocuments(user.legal_business_id, year)).filter((d) => d.loanId !== null);
  const editing = loans.find((l) => String(l.loan.id) === q.edit)?.loan ?? null;

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader title="Loans" intro={`Bank and vehicle loans, how much of the year's instalments was interest in ${taxYearLabel(year)}, and the lender's certificate to check it against.`} />
      <TaxPackNav current="/accounting/tax/loans" year={year} thisYear={taxYearOf(today)} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 089 in phpMyAdmin first.</Notice> : null}
      <p style={muted}>Money from investors and lenders who signed an agreement stays under <Link href="/funding">Investors and lenders</Link>. This list is for loans from banks and finance companies.</p>

      {loans.length === 0 ? <EmptyState>No loans entered yet.</EmptyState> : null}
      {loans.map(({ loan, ours, certified }) => {
        const diff = ours && certified?.interest != null ? certified.interest - ours.interest : null;
        return (
          <section key={loan.id} style={box}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{loan.lender} <span style={muted}>· {KIND_WORDS[loan.kind] ?? loan.kind} · {loan.code}{loan.status === "CLOSED" ? " · closed" : ""}</span></h2>
            <p style={{ ...muted, margin: "0 0 8px" }}>
              {inr(loan.principal)} taken on {loan.takenOn} at {loan.rateBps / 100}% a year{loan.months ? ` for ${loan.months} months` : ""}{loan.accountNo ? ` · account ${loan.accountNo}` : ""}. <Link href={`/accounting/tax/loans?year=${year}&edit=${loan.id}#loan-form`}>Change</Link>
            </p>
            {ours ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={cell}>{taxYearLabel(year)}</th><th style={{ ...cell, textAlign: "right" }}>Worked out here</th><th style={{ ...cell, textAlign: "right" }}>Lender&apos;s certificate</th></tr></thead>
                <tbody>
                  <tr><td style={cell}>Interest ({ours.instalments} instalments)</td><td style={{ ...cell, textAlign: "right" }}>{inr(ours.interest)}</td><td style={{ ...cell, textAlign: "right" }}>{certified?.interest != null ? inr(certified.interest) : "—"}</td></tr>
                  <tr><td style={cell}>Loan repaid</td><td style={{ ...cell, textAlign: "right" }}>{inr(ours.principal)}</td><td style={{ ...cell, textAlign: "right" }}>{certified?.principal != null ? inr(certified.principal) : "—"}</td></tr>
                  <tr><td style={cell}>Still owed at 31 March</td><td style={{ ...cell, textAlign: "right" }}>{inr(ours.closing)}</td><td style={{ ...cell, textAlign: "right" }}>{certified?.closing != null ? inr(certified.closing) : "—"}</td></tr>
                </tbody>
              </table>
            ) : (
              <p style={muted}>No fixed instalments: type the interest from the lender&apos;s statement below.</p>
            )}
            {diff !== null && diff !== 0n ? (
              <Notice tone={diff > 10000n || diff < -10000n ? "error" : "info"}>
                The certificate shows {inr(diff > 0n ? diff : -diff)} {diff > 0n ? "more" : "less"} interest than worked out here. Small differences come from day counts; a large one usually means a missed or extra payment, a rate change or charges. Use the certificate figure in the accounts.
              </Notice>
            ) : null}
            <form action={saveLoanYearAction} style={{ marginTop: 8 }}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="loan_id" value={loan.id} />
              <div style={formGrid}>
                <Field label="Interest on certificate (₹)"><input name="certified_interest" defaultValue={money(certified?.interest)} inputMode="decimal" style={fieldFull} /></Field>
                <Field label="Loan repaid on certificate (₹)"><input name="certified_principal" defaultValue={money(certified?.principal)} inputMode="decimal" style={fieldFull} /></Field>
                <Field label="Owed at 31 March on certificate (₹)"><input name="certified_closing" defaultValue={money(certified?.closing)} inputMode="decimal" style={fieldFull} /></Field>
              </div>
              <SubmitButton label="Save certificate figures" className="btn-link" />
            </form>
            <form action={uploadTaxPaperAction} style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="loan_id" value={loan.id} />
              <input type="hidden" name="back" value="loans" />
              <select name="kind" defaultValue="INTEREST_CERTIFICATE" style={{ padding: 10, fontSize: 16 }} aria-label="Kind of paper">
                <option value="INTEREST_CERTIFICATE">Interest certificate</option>
                <option value="LOAN_STATEMENT">Loan statement</option>
              </select>
              <input type="hidden" name="title" value={`${loan.lender} ${loan.code} ${taxYearLabel(year)}`} />
              <input type="file" name="paper" accept="application/pdf,image/jpeg,image/png" required aria-label="File" />
              <SubmitButton label="Keep paper" className="btn-link" />
            </form>
            {docs.filter((d) => d.loanId === loan.id).map((d) => (
              <form key={d.id} action={removeTaxPaperAction} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <a href={`/api/tax/document/${d.id}`}>{d.kind === "INTEREST_CERTIFICATE" ? "Interest certificate" : "Loan statement"} ({d.uploadedAt})</a>
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="back" value="loans" />
                <SubmitButton label="Remove" className="btn-link" question="Remove this paper?" />
              </form>
            ))}
          </section>
        );
      })}

      <form action={saveLoanAction} id="loan-form">
        <input type="hidden" name="year" value={year} />
        {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
        <Section title={editing ? `Change ${editing.lender} (${editing.code})` : "Add a loan"}>
          <div style={formGrid}>
            <Field label="Lender (bank or company)"><input name="lender_name" defaultValue={editing?.lender ?? ""} required maxLength={150} style={fieldFull} /></Field>
            <Field label="Kind">
              <select name="loan_kind" defaultValue={editing?.kind ?? "TERM"} style={fieldFull}>
                {Object.entries(KIND_WORDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Lender's loan account number (optional)"><input name="lender_account_no" defaultValue={editing?.accountNo ?? ""} maxLength={40} style={fieldFull} /></Field>
            <Field label="Date taken"><input type="date" name="taken_on" defaultValue={editing?.takenOn ?? today} required style={fieldFull} /></Field>
            <Field label="Loan amount (₹)"><input name="principal" defaultValue={money(editing?.principal)} inputMode="decimal" required style={fieldFull} /></Field>
            <Field label="Interest rate (% a year)"><input name="rate" defaultValue={editing ? String(editing.rateBps / 100) : ""} inputMode="decimal" required style={fieldFull} /></Field>
            <Field label="Number of monthly instalments" hint="Leave 0 for an overdraft."><input name="tenure_months" defaultValue={editing ? String(editing.months) : ""} inputMode="numeric" style={fieldFull} /></Field>
            <Field label="Month of the first instalment"><input type="month" name="first_emi_month" defaultValue={editing?.firstMonth ?? ""} style={fieldFull} /></Field>
            <Field label="Monthly instalment (₹, optional)" hint="Only if the lender's figure differs from the one worked out."><input name="emi" defaultValue={money(editing?.emi)} inputMode="decimal" style={fieldFull} /></Field>
            {editing ? (
              <Field label="Status">
                <select name="status" defaultValue={editing.status} style={fieldFull}>
                  <option value="OPEN">Running</option>
                  <option value="CLOSED">Closed (fully repaid)</option>
                </select>
              </Field>
            ) : null}
          </div>
          <Field label="Note (optional)"><input name="note" defaultValue={editing?.note ?? ""} maxLength={250} style={fieldFull} /></Field>
        </Section>
        <SubmitButton label={editing ? "Save changes" : "Add loan"} />
        {editing ? <Link className="btn-link" href={`/accounting/tax/loans?year=${year}`} style={{ marginLeft: 8 }}>Cancel</Link> : null}
      </form>
    </main>
  );
}

export default function TaxLoansPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
