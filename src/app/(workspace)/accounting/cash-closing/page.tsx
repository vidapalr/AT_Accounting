import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canRedoCashClosing } from "@/lib/access";
import { closeCashDayAction } from "@/lib/cash-closing-actions";
import { dayBefore, loadCashMovements, previousClosing } from "@/lib/cash-closing";
import { drawerVsBooks, expectedCash, paiseText } from "@/lib/cash-math";
import { getAccountPositions } from "@/lib/reports/report-data";
import NoteCounter from "@/components/accounting/NoteCounter";

type Row = RowDataPacket & Record<string, string | number | null>;
type Props = { searchParams: Promise<{ account?: string; date?: string; saved?: string; error?: string }> };

const inr = (p: bigint) => `${p < 0n ? "-" : ""}₹${((p < 0n ? -p : p) / 100n).toLocaleString("en-IN")}.${String((p < 0n ? -p : p) % 100n).padStart(2, "0")}`;
const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };
const bigBtn: React.CSSProperties = { cursor: "pointer", fontSize: 16, padding: "12px 22px" };

function noteLine(json: unknown): string {
  if (!json) return "";
  try {
    const d = JSON.parse(String(json)) as { notes?: Record<string, number>; coins?: number };
    const parts = Object.entries(d.notes ?? {}).sort((a, b) => Number(b[0]) - Number(a[0])).map(([k, n]) => `${n} × ₹${k}`);
    if (d.coins) parts.push(`coins ₹${Math.round(d.coins / 100)}`);
    return parts.join(", ");
  } catch {
    return "";
  }
}

async function CashClosingContent({ searchParams }: Props) {
  const user = await requireAccess("cash_closing");
  const businessId = user.legal_business_id;
  const q = await searchParams;
  const redo = canRedoCashClosing(user.role);

  const [accounts] = await db.execute<Row[]>(
    `SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`,
    [businessId]
  );
  const accountId = Number(q.account) || Number(accounts[0]?.id ?? 0);
  const account = accounts.find((a) => Number(a.id) === accountId);
  const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) && q.date <= today() ? q.date : today();

  let body: React.ReactNode = <p>There is no cash drawer set up yet.</p>;
  if (account) {
    const prev = await previousClosing(db, businessId, accountId, date);
    const lines = await loadCashMovements(db, businessId, accountId, prev ? prev.date : dayBefore(date), date);
    const cashIn = lines.filter((l) => l.direction === "IN").reduce((s, l) => s + l.amount, 0n);
    const cashOut = lines.filter((l) => l.direction === "OUT").reduce((s, l) => s + l.amount, 0n);
    const opening = prev ? prev.counted : 0n;
    const expectedBeforeTaken = expectedCash({ opening, cashIn, cashOut, takenOut: 0n });

    const [done] = await db.execute<Row[]>(
      `SELECT ROUND(opening_amount*100) AS o, ROUND(cash_in*100) AS i, ROUND(cash_out*100) AS ou, ROUND(taken_out*100) AS t,
              ROUND(expected_amount*100) AS e, ROUND(counted_amount*100) AS c, ROUND(difference*100) AS df, note, denominations_json, u.full_name
         FROM acct_cash_closings k LEFT JOIN acct_app_users u ON u.id = k.closed_by
        WHERE k.legal_business_id = ? AND k.cash_account_id = ? AND k.closing_date = ?`,
      [businessId, accountId, date]
    );
    const closed = done[0];

    let booksCheck: { books: bigint; takenAway: bigint; booksAfterTaken: bigint; difference: bigint } | null = null;
    if (closed) {
      const positions = await getAccountPositions(db, businessId, date);
      const mine = positions.cash.find((c) => c.id === accountId);
      const [takenRows] = await db.execute<Row[]>(
        `SELECT ROUND(COALESCE(SUM(taken_out), 0) * 100) AS t FROM acct_cash_closings WHERE legal_business_id = ? AND cash_account_id = ? AND closing_date <= ?`,
        [businessId, accountId, date]
      );
      if (mine) {
        const takenAway = BigInt(Math.round(Number(takenRows[0]?.t ?? 0)));
        booksCheck = { books: mine.balance, takenAway, ...drawerVsBooks({ books: mine.balance, takenAway, counted: BigInt(closed.c) }) };
      }
    }

    body = (
      <>
        <section style={box}>
          <h2>{pretty(date)}: what the system expects</h2>
          <table style={{ borderCollapse: "collapse", minWidth: 340 }}>
            <tbody>
              <tr><td style={cell}>{prev ? `Cash counted on ${pretty(prev.date)}` : "Cash at the start"}</td><td style={right}>{inr(opening)}</td></tr>
              <tr><td style={cell}>+ Cash received</td><td style={right}>{inr(cashIn)}</td></tr>
              <tr><td style={cell}>− Cash paid out</td><td style={right}>{inr(cashOut)}</td></tr>
              <tr><td style={cell}><strong>Should be in the drawer</strong>{closed && Number(closed.t) > 0 ? " (before cash taken away)" : ""}</td><td style={right}><strong>{inr(expectedBeforeTaken)}</strong></td></tr>
            </tbody>
          </table>
          {lines.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Show the {lines.length} entries</summary>
              <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td style={cell}>{pretty(l.date)}</td>
                      <td style={cell}>{l.label}</td>
                      <td style={{ ...right, color: l.direction === "IN" ? "#166534" : "#b91c1c" }}>{l.direction === "IN" ? "+" : "−"}{inr(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>

        {closed && (
          <section style={{ ...box, borderColor: Number(closed.df) === 0 ? "#86efac" : "#fca5a5" }}>
            <h2>This day is closed{closed.full_name ? ` by ${closed.full_name}` : ""}</h2>
            <p>
              Counted <strong>{inr(BigInt(closed.c))}</strong>, expected {inr(BigInt(closed.e))}
              {Number(closed.t) > 0 ? `, cash taken away ${inr(BigInt(closed.t))}` : ""}.{" "}
              {Number(closed.df) === 0 ? "It matched exactly." : (
                <strong style={{ color: "#b91c1c" }}>{Number(closed.df) < 0 ? "Short" : "Extra"} by {inr(BigInt(Math.abs(Number(closed.df))))}.</strong>
              )}
              {closed.note ? ` Note: ${closed.note}` : ""}
            </p>
            {noteLine(closed.denominations_json) && <p style={{ color: "#64748b" }}>Notes counted: {noteLine(closed.denominations_json)}</p>}
          </section>
        )}

        {closed && (booksCheck ? (
          <section style={{ ...box, borderColor: booksCheck.difference === 0n ? "#86efac" : "#fcd34d" }}>
            <h2>Does the drawer match the books?</h2>
            <table style={{ borderCollapse: "collapse", minWidth: 340 }}>
              <tbody>
                <tr><td style={cell}>Cash in the books on {pretty(date)}</td><td style={right}>{inr(booksCheck.books)}</td></tr>
                <tr><td style={cell}>− Cash taken to bank or owner so far (not in the books yet)</td><td style={right}>{inr(booksCheck.takenAway)}</td></tr>
                <tr><td style={cell}><strong>Books say the drawer should hold</strong></td><td style={right}><strong>{inr(booksCheck.booksAfterTaken)}</strong></td></tr>
                <tr><td style={cell}>Counted in the drawer</td><td style={right}>{inr(BigInt(closed.c))}</td></tr>
                <tr><td style={cell}><strong>Difference</strong></td><td style={{ ...right, color: booksCheck.difference === 0n ? "#166534" : "#b91c1c" }}><strong>{booksCheck.difference === 0n ? "Matches" : `${booksCheck.difference < 0n ? "Short" : "Extra"} ${inr(booksCheck.difference < 0n ? -booksCheck.difference : booksCheck.difference)}`}</strong></td></tr>
              </tbody>
            </table>
            {booksCheck.difference !== 0n && (
              <p style={{ color: "#92400e" }}>
                A difference usually means sales or expenses are not in the books yet (see <Link href="/accounting/health">Accounting health</Link>), the opening balance is not posted, or cash taken to the bank was never entered in the bank account.
              </p>
            )}
          </section>
        ) : <p style={{ color: "#64748b" }}>The books figure is not available for this drawer yet.</p>)}

        {(!closed || redo) && (
          <section style={box}>
            <h2>{closed ? "Change this closing" : "Count the cash and close the day"}</h2>
            <form action={closeCashDayAction}>
              <input type="hidden" name="cash_account_id" value={String(accountId)} />
              <input type="hidden" name="closing_date" value={date} />
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
                {!prev && (
                  <label>Cash in the drawer at the start (₹)<br />
                    <input name="opening" inputMode="decimal" defaultValue="0" style={{ ...field, width: 170 }} />
                  </label>
                )}
                <NoteCounter />
                <label>Cash taken to bank or owner (₹)<br />
                  <input name="taken_out" inputMode="decimal" defaultValue="0" style={{ ...field, width: 170 }} />
                </label>
              </div>
              <p>
                <label>Note (needed only if the count does not match)<br />
                  <input name="note" maxLength={300} defaultValue={closed?.note ? String(closed.note) : ""} style={{ ...field, width: "100%", maxWidth: 560 }} />
                </label>
              </p>
              <p style={{ color: "#64748b" }}>
                Count what is in the drawer after taking out anything you deposited or handed to the owner, and enter that
                amount under &ldquo;taken to bank or owner&rdquo;.
              </p>
              <button type="submit" className="btn-link btn-link-primary" style={bigBtn}>{closed ? "Save the change" : "Close the day"}</button>
            </form>
          </section>
        )}
      </>
    );
  }

  const [history] = account
    ? await db.execute<Row[]>(
        `SELECT DATE_FORMAT(closing_date, '%Y-%m-%d') AS d, ROUND(expected_amount*100) AS e, ROUND(counted_amount*100) AS c,
                ROUND(difference*100) AS df, note
           FROM acct_cash_closings WHERE legal_business_id = ? AND cash_account_id = ?
          ORDER BY closing_date DESC LIMIT 30`,
        [businessId, accountId]
      )
    : [[] as Row[]];

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Close the day (cash count)</h1>
      <p style={{ color: "#64748b" }}>
        At the end of the day, count the cash in the drawer. The app shows what it should be, so a shortage is noticed the same day.
      </p>
      {q.saved && <p style={{ color: "#166534" }}>{q.saved.slice(0, 300)}</p>}
      {q.error && <p style={{ color: "#b91c1c" }}>{q.error.slice(0, 300)}</p>}

      <form method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <label>Cash drawer<br />
          <select name="account" defaultValue={String(accountId)} style={field}>
            {accounts.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.cash_name)}</option>)}
          </select>
        </label>
        <label>Day<br /><input type="date" name="date" defaultValue={date} max={today()} style={field} /></label>
        <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16 }}>Show</button>
      </form>

      {body}

      <section style={box}>
        <h2>Earlier closings</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead><tr><th style={cell}>Day</th><th style={right}>Expected</th><th style={right}>Counted</th><th style={right}>Difference</th><th style={cell}>Note</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={String(h.d)}>
                  <td style={cell}><Link href={`/accounting/cash-closing?account=${accountId}&date=${h.d}`}>{pretty(String(h.d))}</Link></td>
                  <td style={right}>{inr(BigInt(h.e))}</td>
                  <td style={right}>{inr(BigInt(h.c))}</td>
                  <td style={{ ...right, color: Number(h.df) === 0 ? "#166534" : "#b91c1c" }}>{Number(h.df) === 0 ? "Matched" : inr(BigInt(h.df))}</td>
                  <td style={cell}>{h.note ?? ""}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td style={cell} colSpan={5}>No day has been closed yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function CashClosingPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CashClosingContent {...props} />
    </Suspense>
  );
}
