import { Suspense } from "react";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { loadReconBanks, loadReconLines } from "@/lib/bank-reconcile-data";
import { reconView, type ReconLine } from "@/lib/bank-reconcile";
import { inr, isDate, todayInIndia } from "@/lib/reports/money";
import { fieldFull as field } from "@/lib/ui/styles";
import { Notice, PageHeader } from "@/components/ui";
import BankReconcileTable, { type ReconRow } from "@/components/BankReconcileTable";

type Props = { searchParams: Promise<{ bank?: string; from?: string; to?: string; bal?: string; saved?: string; error?: string }> };

const PAGE = "/accounting/bank-reconcile";
const dayAfter = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const asRow = (l: ReconLine & { running?: bigint }): ReconRow => ({
  id: l.id, date: l.date, text: l.text, moneyIn: String(l.moneyIn), moneyOut: String(l.moneyOut), running: l.running === undefined ? undefined : String(l.running), ticked: l.ticked,
});

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const q = await searchParams;
  const banks = await loadReconBanks(db, user.legal_business_id);
  const bank = banks.find((b) => b.id === Number(q.bank)) ?? (banks.length === 1 ? banks[0] : undefined);
  const today = todayInIndia();

  const header = (
    <PageHeader title="Match with bank statement"
      intro="Start from the opening balance and tick each entry as you find it on the bank statement, until the books match the bank." />
  );
  const picker = (
    <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", margin: "8px 0 4px" }}>
      <label style={{ display: "grid", gap: 4 }}><span style={{ fontWeight: 600 }}>Bank account</span>
        <select name="bank" defaultValue={bank?.id ?? ""} style={{ ...field, minWidth: 240 }}>
          <option value="">Choose…</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <button type="submit" className="btn-link btn-link-primary">Open</button>
    </form>
  );
  if (!bank) return <main style={{ padding: 16, maxWidth: 1100 }}>{header}{picker}{banks.length === 0 && <p>No bank account yet.</p>}</main>;

  const data = await loadReconLines(db, user.legal_business_id, bank);
  if (!data.ready) {
    return <main style={{ padding: 16, maxWidth: 1100 }}>{header}{picker}<Notice tone="warn">This page needs the new database step <strong>100_bank_reconcile</strong>. Paste it in the phpMyAdmin SQL tab, then reload.</Notice></main>;
  }

  // Start the day after the last match; the first time, from the first entry (the opening balance).
  const firstDate = data.lines[0]?.date ?? today;
  const from = isDate(q.from) ? q.from : data.lastCheck ? dayAfter(data.lastCheck.date) : firstDate;
  const to = isDate(q.to) && q.to >= from ? q.to : today < from ? from : today;
  const v = reconView(data.lines, from, to);
  const onScreenTicked = [...v.olderUnticked, ...v.lines].reduce((s, l) => (l.ticked ? s + l.moneyIn - l.moneyOut : s), 0n);

  return (
    <main style={{ padding: 16, maxWidth: 1100 }}>
      {header}
      <p><Link className="btn-link" href={`/accounting/account-balances?account=${encodeURIComponent(`BANK:${bank.id}`)}`}>← Money in bank and cash</Link></p>
      {q.saved && <Notice tone="ok">{q.saved.slice(0, 300)}</Notice>}
      {q.error && <Notice tone="error">{q.error.slice(0, 300)}</Notice>}
      {picker}
      {!bank.glAccountId && <Notice tone="warn">This bank account has no ledger account yet, so there is nothing to match.</Notice>}
      {data.lastCheck && (
        <p style={{ color: "#166534" }}>Last matched with the bank up to <strong>{data.lastCheck.date}</strong> at {inr(data.lastCheck.bankBalance)}.</p>
      )}

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", margin: "8px 0" }}>
        <input type="hidden" name="bank" value={bank.id} />
        <label style={{ display: "grid", gap: 4 }}><span style={{ fontWeight: 600 }}>From</span><input type="date" name="from" defaultValue={from} max={today} style={field} /></label>
        <label style={{ display: "grid", gap: 4 }}><span style={{ fontWeight: 600 }}>Statement date (to)</span><input type="date" name="to" defaultValue={to} max={today} style={field} /></label>
        <button type="submit" className="btn-link">Show</button>
        {from !== firstDate && <Link className="btn-link" href={`${PAGE}?bank=${bank.id}&from=${firstDate}&to=${to}`}>From the very start</Link>}
      </form>

      <BankReconcileTable
        key={`${bank.id}-${from}-${to}`}
        bankId={bank.id} from={from} to={to}
        opening={String(v.opening)} booksBalance={String(v.booksBalance)} tickedOffScreen={String(v.tickedBalance - onScreenTicked)}
        older={v.olderUnticked.map(asRow)} lines={v.lines.map(asRow)} bankBalance={q.bal ?? ""}
      />
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
