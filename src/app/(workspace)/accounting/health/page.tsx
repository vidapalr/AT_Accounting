import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isAutoPostOn } from "@/lib/ledger/auto-post";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import { retryPostingAction } from "@/lib/posting-retry-actions";
import { getStockTieOut } from "@/lib/ledger/stock-tieout";
import { missingMigrations } from "@/lib/migration-check";
import { getCashTieOut } from "@/lib/reports/cash-tieout";

type Row = RowDataPacket & Record<string, string | number | null>;
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "14px 0" };
const good = { color: "#166534" } as const;
const bad = { color: "#b91c1c" } as const;
const WORDS: Record<string, string> = {
  SALE: "Sales", PURCHASE: "Purchases", EXPENSE: "Expenses", OPENING_BALANCE: "Opening balance",
};
const nice = (t: string) => WORDS[t] ?? t.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

async function Content({ searchParams }: { searchParams: Promise<{ retry?: string }> }) {
  const { retry } = await searchParams;
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

  const [failures] = await db.execute<Row[]>(
    `SELECT source_type, source_id, reason, attempts,
            DATE_FORMAT(CONVERT_TZ(last_failed_at, '+00:00', '+05:30'), '%d %b %Y, %H:%i') AS at
       FROM acct_posting_failures
      WHERE legal_business_id = ? AND resolved_at IS NULL
      ORDER BY last_failed_at DESC LIMIT 50`, [businessId]
  ).catch(() => [[] as Row[]]);
  const retryText = retry === "busy" ? "Posting is already running. Wait a minute and look again."
    : retry === "error" ? "Could not run. Nothing was changed."
    : /^posted-(\d+)-failed-(\d+)$/.test(retry ?? "") ? (() => { const m = /^posted-(\d+)-failed-(\d+)$/.exec(retry ?? "")!; return `Done: ${m[1]} posted, ${m[2]} could not be posted.`; })()
    : "";

  const tie = await getStockTieOut(db, businessId).catch(() => null);
  const missingFiles = await missingMigrations(db).catch(() => null);
  const cashTie = await getCashTieOut(db, businessId).catch(() => null);
  const [divRows] = await db.execute<Row[]>(`SELECT id, name FROM acct_divisions WHERE legal_business_id = ?`, [businessId]);
  const divName = new Map(divRows.map((d) => [Number(d.id), String(d.name)]));
  const rupees = (p: bigint) => `${p < 0n ? "-" : ""}₹${(Number((p < 0n ? -p : p) / 100n)).toLocaleString("en-IN")}.${String((p < 0n ? -p : p) % 100n).padStart(2, "0")}`;
  const reasonText = { NOT_POSTED: "stock moved, not in the books yet", AMOUNT_DIFFERS: "books and stock show different amounts", BOOKS_ONLY: "in the books with no stock record (for example opening stock)" } as const;
  const linkFor = (kind: string, id: number) =>
    kind === "SALES_INVOICE" ? `/accounting/sales/${id}` : kind === "PURCHASE_RECEIPT" ? `/accounting/purchases/${id}` : null;

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
        <h2 style={{ marginTop: 0 }}>Stock against the books</h2>
        {!tie ? <p style={bad}>Could not compare stock with the books just now.</p> : (
          <>
            <p style={{ margin: "0 0 8px" }}>
              {tie.differencePaise === 0n && tie.differences.length === 0
                ? <span style={good}>Stock records and the Inventory account agree: {rupees(tie.stockPaise)}.</span>
                : <span style={bad}>Stock records {rupees(tie.stockPaise)} · Books (Inventory) {rupees(tie.booksPaise)} · Difference {rupees(tie.differencePaise)}</span>}
            </p>
            {tie.byDivision.length > 1 && (
              <ul>{tie.byDivision.map((d) => (
                <li key={d.divisionId}>{divName.get(d.divisionId) ?? `Division ${d.divisionId}`}: stock {rupees(d.stockPaise)}, books {rupees(d.booksPaise)}{d.stockPaise === d.booksPaise ? "" : <strong style={bad}> (differs by {rupees(d.booksPaise - d.stockPaise)})</strong>}</li>
              ))}</ul>
            )}
            {tie.differences.length > 0 && (
              <details open>
                <summary><strong>{tie.differences.length} record{tie.differences.length === 1 ? "" : "s"} explain the difference</strong></summary>
                <ul>{tie.differences.slice(0, 30).map((d) => {
                  const href = linkFor(d.kind, d.id);
                  const name = `${nice(d.kind)} #${d.id}`;
                  return <li key={`${d.kind}-${d.id}`}>{href ? <Link href={href}>{name}</Link> : name}: stock {rupees(d.stockPaise)}, books {rupees(d.booksPaise)}, {reasonText[d.reason]}.</li>;
                })}{tie.differences.length > 30 && <li>…and {tie.differences.length - 30} more</li>}</ul>
                <p style={{ color: "#64748b" }}>Records marked "not in the books yet" fix themselves once they are posted (see Waiting to be posted).</p>
              </details>
            )}
          </>
        )}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Cash and bank: records against the books</h2>
        {cashTie === null ? <p>Could not check this just now.</p> : (() => {
          const off = cashTie.filter((r) => r.difference !== 0n);
          return (
            <>
              {off.length === 0
                ? <p style={good}>Every bank and cash account shows the same money movement in the records and in the books.</p>
                : <p style={{ color: "#b45309" }}><strong>{off.length} account(s) differ.</strong> A difference is normal while records are still waiting to be posted (see above); otherwise it needs a look.</p>}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Account", "Records (Account Balances page)", "Books (ledger)", "Difference"].map((h) => <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {cashTie.map((r) => (
                      <tr key={r.key}>
                        <td style={{ padding: 8 }}>{r.name}{r.why.length > 0 && <div style={{ color: "#64748b", fontSize: 12 }}>The books also have: {r.why.map((w) => `${w.label} ${rupees(w.amount)}`).join(", ")}</div>}</td>
                        <td style={{ padding: 8 }}>{rupees(r.recordsNet)}</td>
                        <td style={{ padding: 8 }}>{rupees(r.booksNet)}</td>
                        <td style={{ padding: 8, color: r.difference === 0n ? "#166534" : "#b45309", fontWeight: 600 }}>{r.difference === 0n ? "Agree" : rupees(r.difference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Database files</h2>
        {missingFiles === null ? <p>Could not check the database files just now.</p>
          : missingFiles.length === 0 ? <p style={good}>Every database file has been run on this database.</p>
          : (
            <>
              <p style={{ color: "#b45309" }}><strong>{missingFiles.length} database file(s) have not been run on this database yet:</strong></p>
              <ul>{missingFiles.map((f) => <li key={f}><code>{f}.sql</code></li>)}</ul>
              <p style={{ color: "#64748b" }}>Open each file from the migrations folder, paste it in the phpMyAdmin SQL tab and run it. It is safe to run twice.</p>
            </>
          )}
      </section>

      <section style={box}>
        <h2 style={{ marginTop: 0 }}>Could not be posted</h2>
        {retryText && <p><strong>{retryText}</strong></p>}
        {failures.length === 0 ? <p style={good}>Nothing has failed to post.</p> : (
          <ul style={bad}>
            {failures.map((f) => (
              <li key={`${f.source_type}-${f.source_id}`}>
                {nice(String(f.source_type))} #{String(f.source_id)}: {String(f.reason)} (tried {String(f.attempts)} time{Number(f.attempts) === 1 ? "" : "s"}, last {String(f.at)})
              </li>
            ))}
          </ul>
        )}
        {user.role === "GROUP_OWNER" && (
          <form action={retryPostingAction}>
            <button type="submit" style={{ padding: "10px 16px", fontSize: 15 }}>Try posting again now</button>
            <span style={{ color: "#64748b", marginLeft: 10 }}>Fix the reason first (for example open the month), then press this.</span>
          </form>
        )}
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

export default function HealthPage({ searchParams }: { searchParams: Promise<{ retry?: string }> }) {
  return <Suspense fallback={<p>Loading…</p>}><Content searchParams={searchParams} /></Suspense>;
}
