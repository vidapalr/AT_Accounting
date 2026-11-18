import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr } from "@/lib/reports/money";
import { GST_STATES } from "@/lib/gst";
import { db } from "@/lib/db";
import { loadGstConfig } from "@/lib/gst/data";
import { gstPeriod, gstReady, paymentFigures } from "@/lib/gst/period";
import { periodRange } from "@/lib/gst/returns";
import { paymentAccounts } from "@/lib/payment-accounts";
import { cancelGstPaymentAction, recordGstPaymentAction } from "@/lib/gst-actions";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, fieldFull, formGrid, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ ym?: string; saved?: string; error?: string }> };
const right = { ...cell, textAlign: "right" as const };
const stateName = (code: string) => GST_STATES.find((s) => s.code === code)?.name ?? code;

function TaxCells({ t }: { t: { taxable?: bigint; cgst: bigint; sgst: bigint; igst: bigint } }) {
  return (
    <>
      {t.taxable !== undefined ? <td style={right}>{inr(t.taxable)}</td> : null}
      <td style={right}>{inr(t.cgst)}</td>
      <td style={right}>{inr(t.sgst)}</td>
      <td style={right}>{inr(t.igst)}</td>
    </>
  );
}
const TaxHead = ({ value = true }: { value?: boolean }) => (
  <>
    {value ? <th style={right}>Value before GST</th> : null}
    <th style={right}>CGST</th>
    <th style={right}>SGST</th>
    <th style={right}>IGST</th>
  </>
);

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const lastMonth = (() => {
    const [y, m] = today.split("-").map(Number);
    const i = y * 12 + m - 2;
    return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  })();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.ym ?? "") ? q.ym! : lastMonth;
  const ready = await gstReady();
  const accounts = await paymentAccounts(user.legal_business_id);
  // The scheme decides the period: a month for regular GST, a quarter for composition.
  const composition = (await loadGstConfig(db, user.legal_business_id)).scheme === "COMPOSITION";
  const range = periodRange(composition ? "QUARTER" : "MONTH", ym);
  const p = await gstPeriod(user.legal_business_id, range.from, range.to);
  const g1 = p.gstr1;
  const g3 = p.gstr3b;
  const f = paymentFigures(p);

  return (
    <main style={{ maxWidth: 1100 }}>
      <PageHeader
        title="GST returns and payments"
        intro={`Figures for ${range.label}, from the bills, purchases, expenses and returns in the app. Your accountant files them on the GST portal; record the payment here so the books match.`}
        actions={<a className="btn-link btn-link-primary" href={`/api/gst/export?ym=${ym}`}>Download for the accountant (Excel)</a>}
      />
      <form method="get" style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 12 }}>
        <Field label={composition ? "A month in the quarter" : "Month"}>
          <input type="month" name="ym" defaultValue={ym} style={fieldFull} />
        </Field>
        <button type="submit" className="btn-link" style={{ cursor: "pointer" }}>Show</button>
      </form>
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {!ready ? <Notice tone="error">Run migration 090 in phpMyAdmin to switch on GST.</Notice> : null}
      {p.cfg.scheme === "NOT_REGISTERED" ? (
        <Notice tone="info">GST is not switched on. When you register, fill in <Link href="/accounting/gst-settings">GST settings</Link>; this page then shows each month&apos;s returns.</Notice>
      ) : null}
      {p.missingRates > 0 ? (
        <Notice tone="error">{p.missingRates} bill line(s) in this period have no GST rate, so they show 0%. Fill the rates on <Link href="/accounting/products/gst">Product HSN codes and GST rates</Link>; bills made after that use them.</Notice>
      ) : null}

      {composition ? (
        <Section title={`Composition statement (CMP-08), ${range.label}`}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={cell}>Turnover (bills of supply less goods taken back)</td><td style={right}>{inr(p.composition.turnover)}</td></tr>
              <tr><td style={cell}>Tax at {p.cfg.compositionRate}%: central (CGST)</td><td style={right}>{inr(p.composition.tax.cgst)}</td></tr>
              <tr><td style={cell}>Tax at {p.cfg.compositionRate}%: state (SGST)</td><td style={right}>{inr(p.composition.tax.sgst)}</td></tr>
              <tr><td style={cell}>Reverse-charge GST on purchases and expenses</td><td style={right}>{inr(g3.rcmCash)}</td></tr>
              <tr style={{ fontWeight: 700 }}><td style={cell}>To pay</td><td style={right}>{inr(p.composition.tax.cgst + p.composition.tax.sgst + g3.rcmCash)}</td></tr>
            </tbody>
          </table>
          <p style={muted}>Due by the 18th after the quarter. The yearly return (GSTR-4) adds up the four quarters with purchases: from registered suppliers {inr(p.composition.inwardFromRegistered)}, from unregistered {inr(p.composition.inwardFromUnregistered)} this quarter.</p>
        </Section>
      ) : (
        <>
          <Section title="Sales return (GSTR-1)">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={cell}>Table</th><th style={right}>Count</th><TaxHead /></tr></thead>
              <tbody>
                {[
                  ["4A · B2B: bills to customers with a GSTIN", g1.b2b.length, g1.b2b.flatMap((b) => b.rates)],
                  ["5 · B2C Large: other-state bills above ₹1 lakh", g1.b2cl.length, g1.b2cl.flatMap((b) => b.rates)],
                  ["7 · B2C Small: all other customers", g1.b2cs.length, g1.b2cs],
                  ["9B · Credit notes to registered customers", g1.cdnr.length, g1.cdnr.flatMap((b) => b.rates)],
                  ["9B · Credit notes, unregistered (large)", g1.cdnur.length, g1.cdnur.flatMap((b) => b.rates)],
                ].map(([label, count, list]) => {
                  const rows = list as Array<{ taxable: bigint; cgst: bigint; sgst: bigint; igst: bigint }>;
                  const t = rows.reduce((a, r) => ({ taxable: a.taxable + r.taxable, cgst: a.cgst + r.cgst, sgst: a.sgst + r.sgst, igst: a.igst + r.igst }), { taxable: 0n, cgst: 0n, sgst: 0n, igst: 0n });
                  return <tr key={String(label)}><td style={cell}>{String(label)}</td><td style={right}>{Number(count)}</td><TaxCells t={t} /></tr>;
                })}
                <tr><td style={cell}>8 · Nil-rated sales (0%)</td><td style={right}>—</td><td style={right}>{inr(g1.nil)}</td><td style={right} colSpan={3}></td></tr>
              </tbody>
            </table>
            <p style={muted}>
              Bills {g1.docs.invoices.from || "—"} to {g1.docs.invoices.to || "—"} ({g1.docs.invoices.count}); credit notes {g1.docs.creditNotes.count}. The Excel file has every table invoice by invoice, the HSN summary (B2B and B2C separately) and the document list.
            </p>
            {g1.b2cs.length ? (
              <details>
                <summary>B2C Small by state and rate</summary>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={cell}>Place of supply</th><th style={right}>Rate</th><TaxHead /></tr></thead>
                  <tbody>{g1.b2cs.map((r) => <tr key={`${r.pos}-${r.rate}`}><td style={cell}>{stateName(r.pos)} ({r.pos})</td><td style={right}>{r.rate}%</td><TaxCells t={r} /></tr>)}</tbody>
                </table>
              </details>
            ) : null}
          </Section>

          <Section title="Monthly summary and payment (GSTR-3B)">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={cell}>Table</th><TaxHead /></tr></thead>
              <tbody>
                <tr><td style={cell}>3.1(a) Sales with GST (less credit notes)</td><TaxCells t={g3.outward} /></tr>
                <tr><td style={cell}>3.1(c) Nil-rated sales</td><td style={right}>{inr(g3.nilRated)}</td><td style={right} colSpan={3}></td></tr>
                <tr><td style={cell}>3.1(d) Purchases on reverse charge</td><TaxCells t={g3.rcmInward} /></tr>
                <tr><td style={cell}>4(A)(3) Input credit on reverse charge</td><td style={right}></td><TaxCells t={g3.itcRcm} /></tr>
                <tr><td style={cell}>4(A)(5) All other input credit (less supplier returns)</td><td style={right}></td><TaxCells t={g3.itcOther} /></tr>
                <tr><td style={cell}>Input credit left from earlier months</td><td style={right}></td><TaxCells t={p.broughtForward} /></tr>
                <tr><td style={cell}>5 · Purchases from composition suppliers</td><td style={right}>{inr(g3.inwardComposition)}</td><td style={right} colSpan={3}></td></tr>
                <tr><td style={cell}>Purchases from suppliers without GST (no credit)</td><td style={right}>{inr(g3.inwardUnregistered)}</td><td style={right} colSpan={3}></td></tr>
              </tbody>
            </table>
            {g3.interStateUnregistered.length ? (
              <p style={muted}>3.2 Sales to other states (unregistered): {g3.interStateUnregistered.map((r) => `${stateName(r.pos)} ${inr(r.taxable)} (IGST ${inr(r.igst)})`).join("; ")}.</p>
            ) : null}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
              <thead><tr><th style={cell}>Payment</th><th style={right}>CGST</th><th style={right}>SGST</th><th style={right}>IGST</th></tr></thead>
              <tbody>
                <tr><td style={cell}>GST owed on sales</td><td style={right}>{inr(f.settled.cgst)}</td><td style={right}>{inr(f.settled.sgst)}</td><td style={right}>{inr(f.settled.igst)}</td></tr>
                <tr><td style={cell}>Input credit used, by kind of credit (IGST credit first; CGST and SGST never cross)</td><td style={right}>{inr(f.used.cgst)}</td><td style={right}>{inr(f.used.sgst)}</td><td style={right}>{inr(f.used.igst)}</td></tr>
                <tr><td style={cell}>Paid in cash</td><td style={right}>{inr(f.cash.cgst)}</td><td style={right}>{inr(f.cash.sgst)}</td><td style={right}>{inr(f.cash.igst)}</td></tr>
                <tr><td style={cell}>Credit left for next month</td><td style={right}>{inr(f.creditLeft.cgst)}</td><td style={right}>{inr(f.creditLeft.sgst)}</td><td style={right}>{inr(f.creditLeft.igst)}</td></tr>
                <tr style={{ fontWeight: 700 }}><td style={cell}>Cash to pay (with reverse charge {inr(f.rcm)})</td><td style={right} colSpan={3}>{inr(f.cash.cgst + f.cash.sgst + f.cash.igst + f.rcm)}</td></tr>
              </tbody>
            </table>
            <p style={muted}>GSTR-1 by the 11th and GSTR-3B by the 20th of the next month (quarterly filers: as your accountant arranged).</p>
          </Section>
        </>
      )}

      {p.cfg.scheme !== "NOT_REGISTERED" && ready ? (
        p.alreadyPaid ? (
          <Notice tone="ok">GST for {range.label} is recorded as paid.</Notice>
        ) : (
          <form action={recordGstPaymentAction}>
            <input type="hidden" name="ym" value={ym} />
            <Section title={`Record the GST paid for ${range.label}`}>
              <p style={muted}>The amounts above are used as they are. Type only what happened at the bank.</p>
              <div style={formGrid}>
                <Field label="Date paid"><input type="date" name="paid_on" defaultValue={today} required style={fieldFull} /></Field>
                <Field label="Paid from">
                  <select name="account" required defaultValue="" style={fieldFull}>
                    <option value="" disabled>Choose…</option>
                    {accounts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </Field>
                <Field label="Challan reference (CPIN or CIN)"><input name="challan_ref" maxLength={40} style={fieldFull} /></Field>
                <Field label="Interest and late fee (₹, if any)"><input name="interest_fee" inputMode="decimal" style={fieldFull} /></Field>
              </div>
              <Field label="Note (optional)"><input name="note" maxLength={250} style={fieldFull} /></Field>
            </Section>
            <SubmitButton label="Record GST payment" question="Record this GST payment? It goes into the books." />
          </form>
        )
      ) : null}

      <Section title="GST payments recorded">
        {p.payments.length === 0 ? <EmptyState>No GST payments recorded yet.</EmptyState> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={cell}>No.</th><th style={cell}>Period</th><th style={cell}>Paid on</th><th style={right}>Cash paid</th><th style={cell}>Challan</th><th style={cell}></th></tr></thead>
            <tbody>
              {p.payments.map((x) => (
                <tr key={x.id}>
                  <td style={cell}>{x.no}</td>
                  <td style={cell}>{x.from} to {x.to}</td>
                  <td style={cell}>{x.paidOn}</td>
                  <td style={right}>{inr(x.cash)}</td>
                  <td style={cell}>{x.ref || "—"}</td>
                  <td style={cell}>
                    <form action={cancelGstPaymentAction}>
                      <input type="hidden" name="id" value={x.id} />
                      <input type="hidden" name="ym" value={ym} />
                      <SubmitButton label="Remove" className="btn-link" question="Remove this GST payment? Its entry is taken out of the books." />
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

export default function GstReturnsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
