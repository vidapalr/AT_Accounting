import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr } from "@/lib/reports/money";
import { loadChallans, loadTaxDocuments, taxTablesReady } from "@/lib/tax/data";
import { parseTaxYear, taxYearLabel, taxYearOf } from "@/lib/tax/tax-year";
import { addChallanAction, cancelChallanAction } from "@/lib/tax-actions";
import TaxPackNav from "@/components/accounting/TaxPackNav";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ year?: string; saved?: string; error?: string }> };
const KIND_WORDS: Record<string, string> = { ADVANCE: "Advance tax", SELF_ASSESSMENT: "Self-assessment tax", OTHER: "Other tax" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const year = parseTaxYear(q.year, today);
  const ready = await taxTablesReady();
  const challans = await loadChallans(user.legal_business_id, year);
  const docs = await loadTaxDocuments(user.legal_business_id, year);
  const receiptFor = new Map(docs.filter((d) => d.challanId !== null).map((d) => [d.challanId, d.id]));
  const total = challans.reduce((t, c) => t + c.amount, 0n);

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader title="Tax paid" intro={`Advance tax and self-assessment tax paid for ${taxYearLabel(year)}. Enter each challan after paying on the e-filing site.`} />
      <TaxPackNav current="/accounting/tax/challans" year={year} thisYear={taxYearOf(today)} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 089 in phpMyAdmin first.</Notice> : null}
      <Notice tone="info">
        This is the tax record. The money leaving the bank is entered as usual: for a proprietor as owner money taken out (<Link href="/accounting/owner-money">Owner money in and out</Link>), for a firm or company as your accountant advises.
      </Notice>

      <form action={addChallanAction}>
        <input type="hidden" name="year" value={year} />
        <Section title="Enter a tax payment">
          <div style={formGrid}>
            <Field label="Kind">
              <select name="kind" defaultValue="ADVANCE" style={fieldFull}>
                <option value="ADVANCE">Advance tax (during the year)</option>
                <option value="SELF_ASSESSMENT">Self-assessment tax (after the year, before the return)</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Date paid"><input type="date" name="paid_on" defaultValue={today} required style={fieldFull} /></Field>
            <Field label="Amount (₹)"><input name="amount" inputMode="decimal" required style={fieldFull} /></Field>
            <Field label="BSR code" hint="7 numbers on the challan receipt."><input name="bsr_code" inputMode="numeric" maxLength={7} style={fieldFull} /></Field>
            <Field label="Challan serial number"><input name="challan_serial" inputMode="numeric" maxLength={10} style={fieldFull} /></Field>
            <Field label="Challan receipt (PDF or photo, optional)"><input type="file" name="receipt" accept="application/pdf,image/jpeg,image/png" style={fieldFull} /></Field>
          </div>
          <Field label="Note (optional)"><input name="note" maxLength={250} style={fieldFull} /></Field>
        </Section>
        <SubmitButton label="Save tax payment" />
      </form>

      <Section title={`Payments for ${taxYearLabel(year)}`}>
        {challans.length === 0 ? (
          <EmptyState>No tax payments entered for this year yet.</EmptyState>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={cell}>Date</th><th style={cell}>Kind</th><th style={{ ...cell, textAlign: "right" }}>Amount</th><th style={cell}>BSR / serial</th><th style={cell}>Receipt</th><th style={cell}></th></tr></thead>
            <tbody>
              {challans.map((c) => {
                const receipt = receiptFor.get(c.id);
                return (
                  <tr key={c.id}>
                    <td style={cell}>{c.paidOn}</td>
                    <td style={cell}>{KIND_WORDS[c.kind] ?? c.kind}{c.note ? <span style={{ ...muted, display: "block" }}>{c.note}</span> : null}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{inr(c.amount)}</td>
                    <td style={cell}>{c.bsrCode ?? "—"} / {c.serial ?? "—"}</td>
                    <td style={cell}>{receipt ? <a href={`/api/tax/document/${receipt}`}>Open</a> : "—"}</td>
                    <td style={cell}>
                      <form action={cancelChallanAction}>
                        <input type="hidden" name="year" value={year} />
                        <input type="hidden" name="id" value={c.id} />
                        <SubmitButton label="Remove" className="btn-link" question="Remove this tax payment from the list?" />
                      </form>
                    </td>
                  </tr>
                );
              })}
              <tr><td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Total</td><td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{inr(total)}</td><td style={cell} colSpan={3}></td></tr>
            </tbody>
          </table>
        )}
      </Section>
    </main>
  );
}

export default function TaxChallansPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
