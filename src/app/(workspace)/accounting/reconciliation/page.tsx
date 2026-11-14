import { Suspense } from "react";
import Link from "next/link";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getReconciliation } from "@/lib/ledger/reconcile";

const rupees = (p: bigint) => `${p < 0n ? "-" : ""}₹${((p < 0n ? -p : p) / 100n).toLocaleString("en-IN")}.${String((p < 0n ? -p : p) % 100n).padStart(2, "0")}`;
const cell: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const left: React.CSSProperties = { ...cell, textAlign: "left", whiteSpace: "normal" };
const good = { color: "#166534" } as const;
const bad = { color: "#b91c1c" } as const;

async function Content() {
  const user = await requireAccess("reports");
  const result = await getReconciliation(db, user.legal_business_id).catch(() => null);

  if (!result) {
    return <p style={bad}>Could not run the check just now. Nothing was changed. Try again in a minute.</p>;
  }
  const { rows, trial, problems } = result;
  const off = rows.filter((r) => r.difference !== 0n);

  return (
    <>
      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "14px 0" }}>
        <strong>1. Do the books balance?</strong>
        <p style={{ margin: "6px 0 0" }}>
          {trial.balanced
            ? <span style={good}>Yes. Total debits and total credits are both {rupees(trial.totalDebit)}.</span>
            : <span style={bad}>No. Debits {rupees(trial.totalDebit)} · Credits {rupees(trial.totalCredit)} · Difference {rupees(trial.difference)}. Tell your developer.</span>}
        </p>
      </div>

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "14px 0" }}>
        <strong>2. Do the books match your records (sales, purchases, payments, expenses...)?</strong>
        <p style={{ margin: "6px 0 0" }}>
          {off.length === 0
            ? <span style={good}>Yes. Every account agrees with the records.</span>
            : <span style={bad}>{off.length} account{off.length === 1 ? "" : "s"} differ. A record is waiting to be posted, was changed after posting, or is no longer valid. <Link href="/accounting/health">Open Accounting health</Link> to see which records and retry.</span>}
        </p>
        {problems.length > 0 && <p style={bad}>{problems.length} record{problems.length === 1 ? "" : "s"} the books cannot understand yet. See Accounting health.</p>}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={left}>Account</th>
              <th style={cell}>Records say</th>
              <th style={cell}>Books hold (from records)</th>
              <th style={cell}>Difference</th>
              <th style={cell}>Typed by hand*</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td style={left}>{r.code} · {r.name}</td>
                <td style={cell}>{rupees(r.expected)}</td>
                <td style={cell}>{rupees(r.booked)}</td>
                <td style={{ ...cell, ...(r.difference === 0n ? good : bad) }}>{r.difference === 0n ? "Agrees" : rupees(r.difference)}</td>
                <td style={cell}>{r.other === 0n ? "-" : rupees(r.other)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td style={left} colSpan={5}>Nothing is posted yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Amounts are debit minus credit: a plus is a debit balance, a minus is a credit balance. *Typed by hand: opening balances, auditor adjustments and other journals. They are not made from a record, so they are shown separately and never count as a difference.
        Stock and cash are also compared record by record on <Link href="/accounting/health">Accounting health</Link>.
      </p>
    </>
  );
}

export default function ReconciliationPage() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1>Books check</h1>
      <p>A read-only check that your books agree with your records. It changes nothing.</p>
      <Suspense fallback={<p>Checking...</p>}>
        <Content />
      </Suspense>
    </main>
  );
}
