import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { createAuditorAdjustmentAction } from "@/lib/auditor-adjustment-actions";
import ConfirmButton from "@/components/ConfirmButton";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const inr = (v: string | number | null) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SLOTS = 6;

async function AdjustmentsContent({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const [accounts] = await db.execute<Row[]>(
    `SELECT account_code, account_name FROM acct_chart_of_accounts
     WHERE legal_business_id = ? AND is_posting_account = 1 AND status = 'ACTIVE' ORDER BY account_code`,
    [businessId]
  );
  const [divisions] = await db.execute<Row[]>(
    `SELECT id, name FROM acct_divisions WHERE legal_business_id = ? ORDER BY name`, [businessId]
  );
  const [branches] = await db.execute<Row[]>(
    `SELECT id, branch_name FROM acct_branches WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY branch_name`, [businessId]
  );
  const [recent] = await db.execute<Row[]>(
    `SELECT a.id, a.adjustment_no, DATE_FORMAT(a.entry_date, '%d %b %Y') AS d, a.reason,
            j.id AS journal_id, j.journal_no,
            (SELECT SUM(l.debit) FROM acct_journal_lines l WHERE l.journal_entry_id = j.id) AS amount,
            EXISTS (SELECT 1 FROM acct_journal_reversals r WHERE r.original_journal_id = j.id) AS reversed
       FROM acct_auditor_adjustments a
       LEFT JOIN acct_journal_entries j ON j.legal_business_id = a.legal_business_id
            AND j.source_type = 'AUDITOR_ADJUSTMENT' AND j.source_id = a.id AND j.status = 'POSTED'
      WHERE a.legal_business_id = ? ORDER BY a.id DESC LIMIT 30`,
    [businessId]
  );

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Auditor adjustments</h1>
      <p style={{ color: "#64748b" }}>
        Record a change your auditor asked for. It goes into the books as its own dated entry, on top of what is already there. Nothing earlier is edited.
        To undo one, open it from the list below and reverse it.
      </p>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <form action={createAuditorAdjustmentAction} style={box}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label>Date of the entry<input type="date" name="entry_date" defaultValue={today} required style={field} /></label>
          <label>Division (if an account asks for it)
            <select name="adj_division" style={field} defaultValue="">
              <option value="">None</option>
              {divisions.map((d) => <option key={String(d.id)} value={String(d.id)}>{d.name}</option>)}
            </select>
          </label>
          <label>Branch (if an account asks for it)
            <select name="adj_branch" style={field} defaultValue="">
              <option value="">None</option>
              {branches.map((b) => <option key={String(b.id)} value={String(b.id)}>{b.branch_name}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          What the auditor asked for, in a sentence
          <input name="reason" required minLength={5} maxLength={300} placeholder="e.g. Move rent wrongly booked as miscellaneous" style={field} />
        </label>

        <h2 style={{ marginTop: 16 }}>Lines</h2>
        <p style={{ color: "#64748b" }}>Fill what you need, leave the rest empty. Total debit must equal total credit.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead><tr><th style={cell}>Account</th><th style={cell}>Debit (₹)</th><th style={cell}>Credit (₹)</th><th style={cell}>Note (optional)</th></tr></thead>
            <tbody>
              {Array.from({ length: SLOTS }, (_, k) => k + 1).map((i) => (
                <tr key={i}>
                  <td style={cell}>
                    <select name={`account_${i}`} style={field} defaultValue="" aria-label={`Account for line ${i}`}>
                      <option value="">—</option>
                      {accounts.map((a) => <option key={String(a.account_code)} value={String(a.account_code)}>{a.account_code} {a.account_name}</option>)}
                    </select>
                  </td>
                  <td style={cell}><input name={`debit_${i}`} inputMode="decimal" style={field} aria-label={`Debit for line ${i}`} /></td>
                  <td style={cell}><input name={`credit_${i}`} inputMode="decimal" style={field} aria-label={`Credit for line ${i}`} /></td>
                  <td style={cell}><input name={`memo_${i}`} maxLength={300} style={field} aria-label={`Note for line ${i}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 14 }}>
          <ConfirmButton
            label="Post this adjustment"
            question="Post this adjustment to the books now? You can undo it later only by reversing it."
            className="btn-link btn-link-primary"
          />
        </div>
      </form>

      <section style={box}>
        <h2>Earlier adjustments</h2>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={cell}>No</th><th style={cell}>Date</th><th style={cell}>Reason</th><th style={cell}>Amount</th><th style={cell}>Ledger entry</th></tr></thead>
          <tbody>
            {recent.map((r) => (
              <tr key={String(r.id)}>
                <td style={cell}>{r.adjustment_no}</td>
                <td style={cell}>{r.d}</td>
                <td style={cell}>{r.reason}</td>
                <td style={cell}>{inr(r.amount)}</td>
                <td style={cell}>
                  {r.journal_id ? <Link href={`/accounting/journals/${r.journal_id}`}>{r.journal_no}{Number(r.reversed) ? " (reversed)" : ""}</Link> : "Reversed"}
                </td>
              </tr>
            ))}
            {recent.length === 0 && <tr><td style={cell} colSpan={5}>None yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}

export default function AuditorAdjustmentsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AdjustmentsContent {...props} />
    </Suspense>
  );
}
