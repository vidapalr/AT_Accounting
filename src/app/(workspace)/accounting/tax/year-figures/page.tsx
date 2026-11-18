import { Suspense } from "react";
import Link from "next/link";

import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/format";
import { inr } from "@/lib/reports/money";
import { closingStock, creditorsAt, debtorsAt, taxTablesReady, turnoverByMonth, type PartyBalance } from "@/lib/tax/data";
import { parseTaxYear, taxYearLabel, taxYearOf, taxYearRange } from "@/lib/tax/tax-year";
import { monthName } from "@/lib/tax/year-figures";
import { savePartyPanAction } from "@/lib/tax-actions";
import TaxPackNav from "@/components/accounting/TaxPackNav";
import SubmitButton from "@/components/SubmitButton";
import { EmptyState, Notice, PageHeader, ResultNotice, Section } from "@/components/ui";
import { cellTopCompact as cell, field, muted } from "@/lib/ui/styles";

type Props = { searchParams: Promise<{ year?: string; saved?: string; error?: string }> };
const right = { ...cell, textAlign: "right" as const };

function PartyTable({ rows, party, year, ready }: { rows: PartyBalance[]; party: "customer" | "supplier"; year: number; ready: boolean }) {
  if (rows.length === 0) return <EmptyState>Nothing outstanding on this date.</EmptyState>;
  const total = rows.reduce((t, r) => t + r.amount, 0n);
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead><tr><th style={cell}>Name</th><th style={cell}>Phone</th><th style={cell}>GSTIN</th><th style={cell}>PAN</th><th style={right}>Amount</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={cell}>{r.name}</td>
              <td style={cell}>{r.phone || "—"}</td>
              <td style={cell}>{r.gstin || "—"}</td>
              <td style={cell}>
                {r.pan ? <>{r.pan}{r.panFromGstin ? <span style={{ ...muted, display: "block" }}>from GSTIN</span> : null}</> : ready ? (
                  <form action={savePartyPanAction} style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="year" value={year} />
                    <input type="hidden" name="party" value={party} />
                    <input type="hidden" name="id" value={r.id} />
                    <input name="pan" maxLength={10} placeholder="Add PAN" style={{ ...field, width: 130, textTransform: "uppercase" }} aria-label={`PAN of ${r.name}`} />
                    <SubmitButton label="Save" className="btn-link" />
                  </form>
                ) : "—"}
              </td>
              <td style={right}>{r.amount < 0n ? `${inr(-r.amount)} (advance)` : inr(r.amount)}</td>
            </tr>
          ))}
          <tr style={{ fontWeight: 700 }}><td style={cell} colSpan={4}>Total ({rows.length})</td><td style={right}>{inr(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("tax");
  const q = await searchParams;
  const today = todayInIndia();
  const year = parseTaxYear(q.year, today);
  const { to } = taxYearRange(year);
  const asAt = today < to ? today : to;
  const ready = await taxTablesReady();
  const biz = user.legal_business_id;
  const [turnover, stock, debtors, creditors] = await Promise.all([turnoverByMonth(biz, year), closingStock(biz, asAt), debtorsAt(biz, asAt), creditorsAt(biz, asAt)]);
  const turnoverTotal = turnover.reduce((t, m) => t + m.amount, 0n);
  const stockGap = stock.books - stock.total;

  return (
    <main style={{ maxWidth: 1000 }}>
      <PageHeader title="Year-end figures" intro={`Sales by month, stock in hand, who owes you and whom you owe, at ${asAt === to ? "31 March" : `today (${asAt})`} for ${taxYearLabel(year)}.`} />
      <TaxPackNav current="/accounting/tax/year-figures" year={year} thisYear={taxYearOf(today)} />
      <ResultNotice result={q.saved ? "saved" : q.error ? "error" : undefined} messages={{ saved: { tone: "ok", text: q.saved ?? "" }, error: { tone: "error", text: q.error ?? "" } }} />
      {asAt !== to ? <Notice tone="info">The year is not over yet, so these figures are as at today. After 31 March they show the closing position.</Notice> : null}

      <Section title="Sales (turnover) by month">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {turnover.map((m) => <tr key={m.month}><td style={cell}>{monthName(m.month)}</td><td style={right}>{inr(m.amount)}</td></tr>)}
            <tr style={{ fontWeight: 700 }}><td style={cell}>Year</td><td style={right}>{inr(turnoverTotal)}</td></tr>
          </tbody>
        </table>
        <p style={muted}>Net sales after discounts and returns, from the books.</p>
      </Section>

      <Section title={`Stock in hand at cost (${asAt})`}>
        <p>Counted from stock movements: <strong>{inr(stock.total)}</strong> · Stock account in the books: <strong>{inr(stock.books)}</strong></p>
        {stockGap !== 0n ? <Notice tone="error">The two differ by {inr(stockGap > 0n ? stockGap : -stockGap)}. Check <Link href="/accounting/reconciliation">Books check</Link> before the year is closed.</Notice> : null}
        {stock.belowCost.length ? <Notice tone="info">{stock.belowCost.length} item(s) sell for less than they cost. Stock is valued at cost or selling price, whichever is lower; ask your accountant whether to reduce their value.</Notice> : null}
        {stock.lines.length === 0 ? <EmptyState>No stock.</EmptyState> : (
          <div style={{ overflowX: "auto", maxHeight: 420 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead><tr><th style={cell}>Item</th><th style={cell}>Code</th><th style={right}>Quantity</th><th style={right}>Cost each</th><th style={right}>Value</th></tr></thead>
              <tbody>
                {stock.lines.map((l) => (
                  <tr key={l.sku}><td style={cell}>{l.name}</td><td style={cell}>{l.sku}</td><td style={right}>{l.qty}</td><td style={right}>{inr(l.unitCost)}</td><td style={right}>{inr(l.value)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Customers who owe you">
        <PartyTable rows={debtors} party="customer" year={year} ready={ready} />
      </Section>
      <Section title="Suppliers you owe">
        <PartyTable rows={creditors} party="supplier" year={year} ready={ready} />
      </Section>
      <p style={muted}>PAN is read from the GSTIN when there is one. Your accountant needs PANs for large balances in the tax audit report.</p>
    </main>
  );
}

export default function TaxYearFiguresPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
