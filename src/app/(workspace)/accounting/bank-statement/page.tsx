import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { loadBookLines } from "@/lib/bank-statement-data";
import { importStatementAction, ignoreLineAction, rematchAction, unmatchLineAction } from "@/lib/bank-statement-actions";

type Props = { searchParams: Promise<{ bank?: string; saved?: string; error?: string }> };

const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const p = (v: unknown) => Math.round(Number(v ?? 0) * 100);

async function Content({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const q = await searchParams;

  const [banks] = await db.execute<RowDataPacket[]>(
    `SELECT id, bank_name, account_number_last4, gl_account_id FROM acct_bank_accounts
      WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY bank_name, id`, [businessId]);
  const bankId = Number(q.bank) || 0;
  const bank = banks.find((b) => Number(b.id) === bankId);

  let ready = true;
  let unmatched: RowDataPacket[] = [], ignored: RowDataPacket[] = [];
  let matchedCount = 0;
  let booksOnly: Awaited<ReturnType<typeof loadBookLines>> = [];
  let compare: { bank: number; books: number; date: string } | null = null;

  if (bank) {
    try {
      const [u] = await db.execute<RowDataPacket[]>(
        `SELECT id, DATE_FORMAT(line_date, '%d-%m-%Y') AS d, description, money_out, money_in FROM acct_bank_statement_lines
          WHERE legal_business_id = ? AND bank_account_id = ? AND status = 'UNMATCHED' ORDER BY line_date, id LIMIT 300`, [businessId, bankId]);
      unmatched = u;
      const [ig] = await db.execute<RowDataPacket[]>(
        `SELECT id, DATE_FORMAT(line_date, '%d-%m-%Y') AS d, description, money_out, money_in, note FROM acct_bank_statement_lines
          WHERE legal_business_id = ? AND bank_account_id = ? AND status = 'IGNORED' ORDER BY line_date DESC, id DESC LIMIT 100`, [businessId, bankId]);
      ignored = ig;
      const [m] = await db.execute<RowDataPacket[]>(
        `SELECT COUNT(*) c, DATE_FORMAT(MIN(line_date), '%Y-%m-%d') mn, DATE_FORMAT(MAX(line_date), '%Y-%m-%d') mx
           FROM acct_bank_statement_lines WHERE legal_business_id = ? AND bank_account_id = ?`, [businessId, bankId]);
      const [mc] = await db.execute<RowDataPacket[]>(
        `SELECT COUNT(*) c FROM acct_bank_statement_lines WHERE legal_business_id = ? AND bank_account_id = ? AND status = 'MATCHED'`, [businessId, bankId]);
      matchedCount = Number(mc[0].c);
      const gl = Number(bank.gl_account_id ?? 0);
      if (Number(m[0].c) > 0 && gl) {
        const mn = String(m[0].mn), mx = String(m[0].mx);
        booksOnly = (await loadBookLines(db, businessId, gl, mn, mx, bankId)).filter((b) => b.date >= mn && b.date <= mx);
        const [last] = await db.execute<RowDataPacket[]>(
          `SELECT balance FROM acct_bank_statement_lines WHERE legal_business_id = ? AND bank_account_id = ? AND balance IS NOT NULL
            ORDER BY line_date DESC, id DESC LIMIT 1`, [businessId, bankId]);
        if (last[0]) {
          const [bk] = await db.execute<RowDataPacket[]>(
            `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS net FROM acct_journal_lines jl
               JOIN acct_journal_entries je ON je.id = jl.journal_entry_id
              WHERE jl.legal_business_id = ? AND jl.account_id = ? AND je.status IN ('POSTED','REVERSED') AND je.entry_date <= ?`, [businessId, gl, mx]);
          compare = { bank: p(last[0].balance), books: p(bk[0].net), date: mx };
        }
      }
    } catch {
      ready = false;
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Bank statement check</h1>
      <p style={{ color: "#64748b" }}>
        Upload the CSV file from your bank. Each line is matched with your books (same amount, same direction, within 3 days).
        What does not match is listed so you can find the missing or wrong entry. Nothing here changes your books.
      </p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved.slice(0, 250)}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error.slice(0, 250)}</p>}

      <section style={box}>
        <h2>1. Choose the bank account</h2>
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {banks.map((b) => (
            <a key={String(b.id)} className="btn-link" href={`/accounting/bank-statement?bank=${b.id}`}
              style={{ fontWeight: Number(b.id) === bankId ? 700 : 400 }}>
              {String(b.bank_name)} ••••{String(b.account_number_last4)}
            </a>
          ))}
        </p>
      </section>

      {bank && !ready && <p role="alert">Not set up yet. Ask Claude for the database file named 061_bank_statements.</p>}

      {bank && ready && (
        <>
          <section style={box}>
            <h2>2. Upload the statement</h2>
            <form action={importStatementAction}>
              <input type="hidden" name="bank_account_id" value={bankId} />
              <p><input type="file" name="file" accept=".csv,.txt" /></p>
              <p style={{ color: "#64748b" }}>
                Only a PDF? Open it, copy the lines (with the heading row: Date, Narration, Withdrawal, Deposit, Balance) and paste them here:
              </p>
              <p><textarea name="pasted" rows={4} style={{ width: "100%" }} placeholder="Date, Narration, Withdrawal, Deposit, Balance" /></p>
              <button type="submit" className="btn-link btn-link-primary" style={{ fontSize: 16, padding: "12px 22px" }}>Upload and match</button>
            </form>
            <p style={{ color: "#64748b", fontSize: 13 }}>Uploading the same lines again is safe: they are not added twice.</p>
          </section>

          {compare && (
            <section style={{ ...box, background: compare.bank === compare.books ? "#f0fdf4" : "#fef2f2" }}>
              <strong style={{ color: compare.bank === compare.books ? "#166534" : "#b91c1c" }}>
                On {compare.date}: bank says {inr(compare.bank)}, your books say {inr(compare.books)}
                {compare.bank === compare.books ? " (agree)." : `, difference ${inr(compare.bank - compare.books)}.`}
              </strong>
            </section>
          )}

          <section style={box}>
            <h2>3. Result</h2>
            <p>{matchedCount} line(s) matched. {unmatched.length} in the bank but not in your books. {booksOnly.length} in your books but not in the bank.</p>
            <form action={rematchAction}>
              <input type="hidden" name="bank_account_id" value={bankId} />
              <button type="submit" className="btn-link btn-link-small">Match again</button>
            </form>
          </section>

          <section style={box}>
            <h2>In the bank, not in your books</h2>
            <p style={{ color: "#64748b" }}>Money moved at the bank but nothing in your books matches: a missing entry, a wrong amount or a wrong account. Find it, fix it, then press Match again.</p>
            {unmatched.length === 0 ? <p style={{ color: "#166534" }}>Nothing. Every bank line is in your books.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Date", "Bank says", "Out", "In", "Ignore"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                  <tbody>
                    {unmatched.map((r) => (
                      <tr key={String(r.id)}>
                        <td style={cell}>{String(r.d)}</td>
                        <td style={cell}>{String(r.description)}</td>
                        <td style={cell}>{p(r.money_out) ? inr(p(r.money_out)) : ""}</td>
                        <td style={cell}>{p(r.money_in) ? inr(p(r.money_in)) : ""}</td>
                        <td style={cell}>
                          <form action={ignoreLineAction} style={{ display: "flex", gap: 6 }}>
                            <input type="hidden" name="bank_account_id" value={bankId} />
                            <input type="hidden" name="line_id" value={String(r.id)} />
                            <input name="note" placeholder="Reason" size={14} />
                            <button type="submit" className="btn-link btn-link-small">Ignore</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={box}>
            <h2>In your books, not in the bank</h2>
            <p style={{ color: "#64748b" }}>Recorded by you but the bank shows nothing like it in this statement: a cheque not cashed yet, a wrong date, or a wrong amount.</p>
            {booksOnly.length === 0 ? <p style={{ color: "#166534" }}>Nothing. Every book entry is on the statement.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Date", "Your books say", "Out", "In"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
                  <tbody>
                    {booksOnly.slice(0, 300).map((b) => (
                      <tr key={b.id}>
                        <td style={cell}>{b.date.split("-").reverse().join("-")}</td>
                        <td style={cell}>{b.description}</td>
                        <td style={cell}>{b.credit ? inr(b.credit) : ""}</td>
                        <td style={cell}>{b.debit ? inr(b.debit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {ignored.length > 0 && (
            <section style={box}>
              <h2>Ignored lines</h2>
              <ul>
                {ignored.map((r) => (
                  <li key={String(r.id)}>
                    {String(r.d)} {String(r.description)} {p(r.money_out) ? `out ${inr(p(r.money_out))}` : `in ${inr(p(r.money_in))}`}: {String(r.note ?? "")}{" "}
                    <form action={ignoreLineAction} style={{ display: "inline" }}>
                      <input type="hidden" name="bank_account_id" value={bankId} />
                      <input type="hidden" name="line_id" value={String(r.id)} />
                      <input type="hidden" name="undo" value="1" />
                      <button type="submit" className="btn-link btn-link-small">Put back</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

export default function BankStatementPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
