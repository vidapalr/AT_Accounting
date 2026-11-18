import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr } from "@/lib/reports/money";
import { loadItDepreciation } from "@/lib/tax/data";
import { ASSET_BLOCKS, BLOCK_LABELS } from "@/lib/tax/it-depreciation";
import { parseTaxYear, taxYearLabel, taxYearOf } from "@/lib/tax/tax-year";
import { saveItDepreciationAction } from "@/lib/tax-actions";
import TaxPackNav from "@/components/accounting/TaxPackNav";
import SubmitButton from "@/components/SubmitButton";
import { Field, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, field, fieldFull, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ year?: string; saved?: string; error?: string }> };
const right = { ...cell, textAlign: "right" as const };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const year = parseTaxYear(q.year, today);
  const owner = user.role === "GROUP_OWNER";
  const { rows, settings, firstYear, assetCount } = await loadItDepreciation(user.legal_business_id, year);
  const shown = rows.filter((r) => r.opening || r.additionsFull || r.additionsHalf || r.sales || r.closing);
  const total = (k: "opening" | "additionsFull" | "additionsHalf" | "sales" | "depreciation" | "closing") => shown.reduce((t, r) => t + r[k], 0n);
  const gains = rows.filter((r) => r.capitalGain > 0n);

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader title="Tax depreciation" intro={`Depreciation by income-tax rules for ${taxYearLabel(year)}: fixed rates on the written-down value of each group of assets. The books keep their own monthly wear; this is the figure for the tax return.`} />
      <TaxPackNav current="/accounting/tax/depreciation" year={year} thisYear={taxYearOf(today)} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {settings.opening === null ? (
        <Notice tone="info">No opening values given, so the roll starts from the first asset entered ({taxYearLabel(firstYear)}). If the business had assets before using this app, type the closing tax values from the last return below.</Notice>
      ) : null}

      <Section title={`Groups of assets, ${taxYearLabel(year)}`}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr><th style={cell}>Group</th><th style={right}>Rate</th><th style={right}>Value at 1 April</th><th style={right}>Bought, used 180+ days</th><th style={right}>Bought, used under 180 days</th><th style={right}>Sold for</th><th style={right}>Depreciation</th><th style={right}>Value at 31 March</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 ? <tr><td style={cell} colSpan={8}>No assets yet. Add them under <Link href="/accounting/fixed-assets">Fixed assets</Link>.</td></tr> : null}
              {shown.map((r) => (
                <tr key={r.block}>
                  <td style={cell}>{BLOCK_LABELS[r.block]}</td>
                  <td style={right}>{r.ratePct}%</td>
                  <td style={right}>{inr(r.opening)}</td>
                  <td style={right}>{inr(r.additionsFull)}</td>
                  <td style={right}>{inr(r.additionsHalf)}</td>
                  <td style={right}>{inr(r.sales)}</td>
                  <td style={right}>{inr(r.depreciation)}</td>
                  <td style={right}>{inr(r.closing)}</td>
                </tr>
              ))}
              {shown.length ? (
                <tr style={{ fontWeight: 700 }}>
                  <td style={cell}>Total</td><td style={right}></td><td style={right}>{inr(total("opening"))}</td><td style={right}>{inr(total("additionsFull"))}</td><td style={right}>{inr(total("additionsHalf"))}</td><td style={right}>{inr(total("sales"))}</td><td style={right}>{inr(total("depreciation"))}</td><td style={right}>{inr(total("closing"))}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p style={muted}>Assets put to use for less than 180 days in the year get half the rate. {assetCount} asset(s) counted from <Link href="/accounting/fixed-assets">Fixed assets</Link>.</p>
        {gains.map((g) => (
          <Notice key={g.block} tone="error">{BLOCK_LABELS[g.block]}: sale money is {inr(g.capitalGain)} more than the group&apos;s value. That is taxed as a short-term capital gain; tell your accountant.</Notice>
        ))}
      </Section>

      <form action={saveItDepreciationAction}>
        <input type="hidden" name="year" value={year} />
        <Section title="Rates and opening values">
          <p style={muted}>Rates are the usual income-tax rates. Change one only if your accountant says so. Opening values come from the depreciation schedule of the last filed return.</p>
          <Field label="Opening values are at 1 April of tax year">
            <select name="it_wdv_year" defaultValue={settings.opening ? String(settings.opening.taxYear) : ""} disabled={!owner} style={fieldFull}>
              <option value="">No opening values</option>
              {[year - 2, year - 1, year].map((y) => <option key={y} value={y}>{taxYearLabel(y)}</option>)}
            </select>
          </Field>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <thead><tr><th style={cell}>Group</th><th style={cell}>Rate (%)</th><th style={cell}>Opening value (₹)</th></tr></thead>
            <tbody>
              {ASSET_BLOCKS.map((b) => (
                <tr key={b}>
                  <td style={cell}>{BLOCK_LABELS[b]}</td>
                  <td style={cell}><input name={`rate_${b}`} defaultValue={String(settings.rates[b])} inputMode="decimal" disabled={!owner} style={{ ...field, width: 90 }} aria-label={`${BLOCK_LABELS[b]} rate`} /></td>
                  <td style={cell}><input name={`wdv_${b}`} defaultValue={settings.opening?.wdv[b] !== undefined ? String(Number(settings.opening.wdv[b]) / 100) : ""} inputMode="decimal" disabled={!owner} style={field} aria-label={`${BLOCK_LABELS[b]} opening value`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        {owner ? <SubmitButton label="Save rates and opening values" /> : <p style={muted}>Only the owner can change these.</p>}
      </form>
    </main>
  );
}

export default function TaxDepreciationPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
