import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isAutoPostOn } from "@/lib/ledger/auto-post";
import { getSyncStatus } from "@/lib/ledger/sync-status";

type Row = RowDataPacket & Record<string, string | number | null>;
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "14px 0" };
const good = { color: "#166534" } as const;
const bad = { color: "#b91c1c" } as const;
const WORDS: Record<string, string> = {
  SALE: "Sales", PURCHASE: "Purchases", EXPENSE: "Expenses", OPENING_BALANCE: "Opening balance",
};
const nice = (t: string) => WORDS[t] ?? t.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

async function Content() {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;

  const [autoOn, sync] = await Promise.all([isAutoPostOn(db, businessId), getSyncStatus(db, businessId)]);
  const [last] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(CONVERT_TZ(MAX(created_at), '+00:00', '+05:30'), '%d %b %Y, %H:%i') AS at
       FROM acct_audit_events WHERE legal_business_id = ? AND action = 'LEDGER_AUTO_POSTED'`, [businessId]
  ).catch(() => [[] as Row[]]);
  const [batches] = await db.execute<Row[]>(
    `SELECT id, status, DATE_FORMAT(opening_date, '%d %b %Y') AS d FROM acct_opening_balance_batches
      WHERE legal_business_id = ? AND status NOT IN ('CANCELLED','REJECTED','VOID') ORDER BY id`, [businessId]
  );
  const [openPosted] = await db.execute<Row[]>(
    `SELECT COUNT(*) AS n FROM acct_journal_entries WHERE legal_business_id = ? AND status = 'POSTED' AND source_type = 'OPENING_BALANCE'`, [businessId]
  );
  const [trig] = await db.query<Row[]>(
    `SELECT COUNT(*) AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND event_object_table LIKE 'acct\\_%'`
  ).catch(() => [[] as Row[]]);

  const byType = new Map<string, string[]>();
  for (const d of sync.pending) byType.set(d.sourceType, [...(byType.get(d.sourceType) ?? []), d.description]);
  const review = sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length;
  const allGood = sync.pending.length === 0 && review === 0;
  const openingOk = batches.length > 0 && Number(openPosted[0]?.n ?? 0) > 0;

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Accounting health</h1>
      <p style={{ color: "#64748b" }}>
        One place to see whether the books can be trusted. Reports only count entries that are in the ledger, so anything waiting below is not in your profit and balance sheet yet.
      </p>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Overall: {allGood ? <span style={good}>All records are in the books</span> : <span style={bad}>Needs attention</span>}</h2>
        <p style={{ margin: 0 }}>
          Waiting to be posted: <strong>{sync.pending.length}</strong> · Need review: <strong>{review}</strong> · Warnings: <strong>{sync.warnings.length}</strong>
        </p>
        <p style={{ margin: "8px 0 0" }}>
          Automatic posting is <strong>{autoOn ? "ON" : "OFF"}</strong>. Last automatic posting: <strong>{last[0]?.at ? String(last[0].at) : "none yet"}</strong>.{" "}
          <Link href="/accounting/reports">Open Reports to post or change this</Link>
        </p>
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Waiting to be posted</h2>
        {byType.size === 0 ? <p style={good}>Nothing is waiting.</p> : [...byType].map(([type, items]) => (
          <details key={type} style={{ margin: "6px 0" }}>
            <summary><strong>{nice(type)}</strong>: {items.length}</summary>
            <ul>{items.slice(0, 15).map((t, i) => <li key={i}>{t}</li>)}{items.length > 15 && <li>…and {items.length - 15} more</li>}</ul>
          </details>
        ))}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Skipped or needing review, and why</h2>
        {review === 0 ? <p style={good}>Nothing needs review.</p> : (
          <ul style={bad}>
            {sync.problems.map((p) => <li key={p}>{p}</li>)}
            {sync.changedAfterPosting.map((p) => <li key={p}>Changed after posting: {p}. Needs a reversal and re-entry.</li>)}
            {sync.noLongerValid.map((p) => <li key={p}>Posted, but the record is no longer valid: {p}. Needs a reversal.</li>)}
          </ul>
        )}
        {sync.warnings.length > 0 && <ul>{sync.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Opening balances</h2>
        {batches.length === 0
          ? <p style={bad}>No opening balance has been entered. <Link href="/accounting/opening-balances">Open opening balances</Link></p>
          : <>
              <p style={openingOk ? good : bad}>{openingOk ? "Opening balance is posted to the ledger." : "Opening balance is entered but not posted yet, so cash and bank figures include it as a provisional amount."}</p>
              <ul>{batches.map((b) => <li key={String(b.id)}>Batch {String(b.id)} · {String(b.d)} · {String(b.status)}</li>)}</ul>
            </>}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Safety checks</h2>
        <p style={{ margin: 0 }}>
          Database safety rules (posted entries cannot be edited): {trig[0] ? <strong style={Number(trig[0].n) > 0 ? good : bad}>{Number(trig[0].n)} found</strong> : <strong>could not check</strong>}.{" "}
          <Link href="/accounting/backup">Backup</Link> · <Link href="/accounting/cutover-reconciliation">Cut-over reconciliation</Link> · <Link href="/accounting/audit">Change history</Link>
        </p>
      </section>
    </main>
  );
}

export default function HealthPage() {
  return <Suspense fallback={<p>Loading…</p>}><Content /></Suspense>;
}
