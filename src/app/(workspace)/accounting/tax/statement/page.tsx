import { Suspense } from "react";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr } from "@/lib/reports/money";
import { DOC_KIND_LABELS, loadTaxDocuments, statementCheck, taxTablesReady } from "@/lib/tax/data";
import { formNames, parseTaxYear, taxYearLabel, taxYearOf } from "@/lib/tax/tax-year";
import { readStatementAction, removeTaxPaperAction, uploadTaxPaperAction } from "@/lib/tax-actions";
import TaxPackNav from "@/components/accounting/TaxPackNav";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ year?: string; saved?: string; error?: string }> };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const year = parseTaxYear(q.year, today);
  const names = formNames(year);
  const ready = await taxTablesReady();
  const check = await statementCheck(user.legal_business_id, year);
  const docs = await loadTaxDocuments(user.legal_business_id, year);
  const { statement, challanMatch, tdsRows } = check;
  const tdsTotal = statement.tds.reduce((t, x) => t + x.tds, 0n);
  const paidTotal = statement.tds.reduce((t, x) => t + x.amountPaid, 0n);

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader title="Tax statement and papers" intro={`Read ${names.statement} for ${taxYearLabel(year)}, check it against the books, and keep AIS, TIS and certificates in one place.`} />
      <TaxPackNav current="/accounting/tax/statement" year={year} thisYear={taxYearOf(today)} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 089 in phpMyAdmin first.</Notice> : null}

      <form action={readStatementAction}>
        <input type="hidden" name="year" value={year} />
        <Section title={`Read ${names.statementShort}`}>
          <p style={muted}>
            On the e-filing site: e-File → Income Tax Returns → View {names.statementShort} → choose the year → download as <strong>Text</strong>. Choose that file here (or paste its text). Reading again replaces the earlier lines for this year.
          </p>
          <div style={formGrid}>
            <Field label="Downloaded text file"><input type="file" name="statement_file" accept=".txt,text/plain" style={fieldFull} /></Field>
          </div>
          <Field label="Or paste the text"><textarea name="pasted" rows={4} style={fieldFull} /></Field>
        </Section>
        <SubmitButton label="Read the statement" />
        {statement.readAt ? <p style={muted}>Last read on {statement.readAt}.</p> : null}
      </form>

      <Section title="Tax paid: statement against your entries">
        {statement.readAt === null ? (
          <EmptyState>Read the statement to compare.</EmptyState>
        ) : (
          <>
            <p>{challanMatch.matched.length} payment(s) match. {challanMatch.onlyInBooks.length ? `${challanMatch.onlyInBooks.length} entered here are not in the statement yet (banks take a few days).` : ""} {challanMatch.onlyInStatement.length ? `${challanMatch.onlyInStatement.length} in the statement are not entered here.` : ""}</p>
            {challanMatch.onlyInStatement.length || challanMatch.onlyInBooks.length ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={cell}>Where</th><th style={cell}>Date</th><th style={{ ...cell, textAlign: "right" }}>Amount</th><th style={cell}>BSR / serial</th></tr></thead>
                <tbody>
                  {challanMatch.onlyInStatement.map((s, i) => (
                    <tr key={`s${i}`}><td style={cell}>Only in the statement{s.minorHead === "300" ? " (self-assessment)" : s.minorHead === "100" ? " (advance tax)" : ""}</td><td style={cell}>{s.date}</td><td style={{ ...cell, textAlign: "right" }}>{inr(s.amount)}</td><td style={cell}>{s.bsrCode} / {s.serial}</td></tr>
                  ))}
                  {challanMatch.onlyInBooks.map((c) => (
                    <tr key={`b${c.id}`}><td style={cell}>Only entered here</td><td style={cell}>{c.paidOn}</td><td style={{ ...cell, textAlign: "right" }}>{inr(c.amount)}</td><td style={cell}>{c.bsrCode ?? "—"} / {c.serial ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </Section>

      <Section title="TDS taken by customers">
        {statement.tds.length === 0 ? (
          <EmptyState>No TDS lines in the statement for this year.</EmptyState>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={cell}>Deducted by</th><th style={cell}>TAN</th><th style={{ ...cell, textAlign: "right" }}>Amount they paid you</th><th style={{ ...cell, textAlign: "right" }}>TDS</th><th style={cell}>In your books</th></tr></thead>
            <tbody>
              {tdsRows.map((t, i) => (
                <tr key={i}>
                  <td style={cell}>{t.deductor}</td>
                  <td style={cell}>{t.tan}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{inr(t.amountPaid)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{inr(t.tds)}</td>
                  <td style={cell}>{t.customer ? <>{t.customer}: sales {inr(t.salesInBooks ?? 0n)}{t.salesInBooks !== null && t.salesInBooks < t.amountPaid ? <span style={{ color: "#b91c1c", display: "block" }}>Less than the statement: check for missing bills</span> : null}</> : <span style={muted}>No customer with this name</span>}</td>
                </tr>
              ))}
              <tr><td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Total</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{inr(paidTotal)}</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{inr(tdsTotal)}</td><td style={cell}></td></tr>
            </tbody>
          </table>
        )}
        <p style={muted}>The TDS total reduces the advance tax to pay. If a customer took TDS but it is not here, ask them to file their TDS return or give a TDS certificate.</p>
      </Section>

      <form action={uploadTaxPaperAction}>
        <input type="hidden" name="year" value={year} />
        <Section title="Keep a tax paper">
          <p style={muted}>AIS and TIS: e-filing site → Services → Annual Information Statement → download the PDF. Also keep TDS certificates from customers, the {names.statementShort} PDF and the filed return.</p>
          <div style={formGrid}>
            <Field label="What it is">
              <select name="kind" defaultValue="AIS" style={fieldFull}>
                {Object.entries(DOC_KIND_LABELS).filter(([k]) => !["LOAN_STATEMENT", "INTEREST_CERTIFICATE", "CHALLAN"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Name (optional)"><input name="title" maxLength={150} style={fieldFull} /></Field>
            <Field label="File (PDF or photo, up to 5 MB)"><input type="file" name="paper" accept="application/pdf,image/jpeg,image/png" required style={fieldFull} /></Field>
          </div>
        </Section>
        <SubmitButton label="Save paper" />
      </form>

      <Section title={`Papers for ${taxYearLabel(year)}`}>
        {docs.length === 0 ? (
          <EmptyState>No papers kept for this year yet.</EmptyState>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={cell}>Kind</th><th style={cell}>Name</th><th style={cell}>Kept on</th><th style={cell}></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td style={cell}>{DOC_KIND_LABELS[d.kind] ?? d.kind}</td>
                  <td style={cell}><a href={`/api/tax/document/${d.id}`}>{d.title}</a></td>
                  <td style={cell}>{d.uploadedAt}</td>
                  <td style={cell}>
                    <form action={removeTaxPaperAction}>
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="id" value={d.id} />
                      <SubmitButton label="Remove" className="btn-link" question="Remove this paper from the list?" />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}

export default function TaxStatementPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
