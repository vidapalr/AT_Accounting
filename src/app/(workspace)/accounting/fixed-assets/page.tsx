import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { todayInIndia } from "@/lib/reports/money";
import { monthFromIndex, monthIndex, monthsToRun } from "@/lib/asset-math";
import { addAssetAction, disposeAssetAction, runDepreciationAction } from "@/lib/asset-actions";
import SubmitButton from "@/components/SubmitButton";

type Props = { searchParams: Promise<{ saved?: string; error?: string; show?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const paise = (v: unknown) => BigInt(Math.round(Number(v ?? 0) * 100));
const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const pretty = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };
const KINDS: Record<string, string> = { FURNITURE_FITTINGS: "Furniture and fittings", MACHINERY: "Machinery", COMPUTERS: "Computers and phones", VEHICLE: "Vehicle", OTHER: "Other" };
const HOW: Record<string, string> = { SOLD: "Sold", SCRAPPED: "Scrapped", GIVEN_AWAY: "Given away" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const query = await searchParams;
  const all = query.show === "all";
  const today = todayInIndia();
  const thisMonth = today.slice(0, 7);
  const lastFinished = monthFromIndex(monthIndex(thisMonth) - 1);

  const [assets] = await db.execute<Row[]>(
    `SELECT a.*, DATE_FORMAT(a.purchase_date, '%Y-%m-%d') AS pd, DATE_FORMAT(a.disposed_on, '%Y-%m-%d') AS dd,
            COALESCE((SELECT SUM(x.amount) FROM acct_asset_depreciation x WHERE x.asset_id = a.id), 0) AS charged
       FROM acct_fixed_assets a WHERE a.legal_business_id = ? AND a.division_id = ?${all ? "" : " AND a.status = 'ACTIVE'"}
      ORDER BY a.status, a.purchase_date DESC, a.id DESC`,
    [businessId, divisionId]
  );
  const [lastRun] = await db.execute<Row[]>(`SELECT MAX(period) AS p FROM acct_asset_dep_runs WHERE legal_business_id = ? AND division_id = ?`, [businessId, divisionId]);
  const [firstRow] = await db.execute<Row[]>(`SELECT MIN(DATE_FORMAT(purchase_date, '%Y-%m')) AS m FROM acct_fixed_assets WHERE legal_business_id = ? AND division_id = ?`, [businessId, divisionId]);
  const lastPeriod = lastRun[0]?.p ? String(lastRun[0].p) : null;
  const pending = firstRow[0]?.m ? monthsToRun(String(firstRow[0].m), lastPeriod, lastFinished) : [];

  const [cash] = await db.execute<Row[]>(`SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`, [businessId]);
  const [banks] = await db.execute<Row[]>(
    `SELECT id, bank_name, account_number_last4, can_send, can_receive FROM acct_bank_accounts
      WHERE legal_business_id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE' AND verification_status = 'VERIFIED' ORDER BY bank_name`, [businessId]);
  const bankLabel = (b: Row) => `Bank: ${b.bank_name}${b.account_number_last4 ? ` ••${b.account_number_last4}` : ""}`;

  const active = assets.filter((a) => a.status === "ACTIVE");
  const totalCost = active.reduce((s, a) => s + paise(a.cost), 0n);
  const totalCharged = active.reduce((s, a) => s + paise(a.charged), 0n);

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <h1>Fixed assets</h1>
      <p style={{ color: "#64748b" }}>
        Things the business owns for years: shop fittings, machines, computers. Their cost is not an expense on the day you buy them.
        Instead a little wear is charged every month, so profit and the value of what you own both stay honest.
      </p>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <p style={{ fontSize: 18, margin: 0 }}>
          Cost <strong>{rupees(totalCost)}</strong> · wear so far <strong>{rupees(totalCharged)}</strong> · worth now <strong>{rupees(totalCost - totalCharged)}</strong>
        </p>
      </section>

      {firstRow[0]?.m && (
        <section style={box}>
          <h2>Monthly depreciation</h2>
          <p>{lastPeriod ? `Worked out up to ${monthName(lastPeriod)}.` : "Not worked out yet."}{" "}
            {pending.length === 0 ? "Nothing is due." : `${pending.length} month${pending.length === 1 ? " is" : "s are"} due, up to ${monthName(lastFinished)}.`}</p>
          {pending.length > 0 && (
            <form action={runDepreciationAction}>
              <input type="hidden" name="up_to" value={lastFinished} />
              <SubmitButton label={`Work out depreciation up to ${monthName(lastFinished)}`} question="Work out the wear for every month still due? It joins the books when pending entries are posted." />
            </form>
          )}
          <p style={{ color: "#64748b" }}>Same amount every month, from the month of purchase until the asset has lost its whole cost (less any value left at the end).</p>
        </section>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <a className={`btn-link${all ? "" : " btn-link-primary"}`} href="/accounting/fixed-assets">Assets we have</a>
        <a className={`btn-link${all ? " btn-link-primary" : ""}`} href="/accounting/fixed-assets?show=all">Including sold or scrapped</a>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead><tr><th style={cell}>Asset</th><th style={cell}>Bought</th><th style={right}>Cost</th><th style={right}>Wear so far</th><th style={right}>Worth now</th><th style={cell}></th></tr></thead>
          <tbody>
            {assets.map((a) => {
              const charged = paise(a.charged);
              const gone = a.status === "DISPOSED";
              return (
                <tr key={String(a.id)} style={gone ? { color: "#94a3b8" } : undefined}>
                  <td style={cell}><strong>{String(a.asset_name)}</strong><br /><span style={{ fontSize: 13 }}>{String(a.asset_no)} · {KINDS[String(a.category)]} · lasts {Number(a.life_months) / 12} years</span></td>
                  <td style={cell}>{pretty(String(a.pd))}<br /><span style={{ fontSize: 13 }}>{a.paid_from === "EARLIER" ? "paid earlier" : a.paid_from === "BANK" ? "paid by bank" : "paid in cash"}</span></td>
                  <td style={right}>{rupees(paise(a.cost))}</td>
                  <td style={right}>{rupees(charged)}</td>
                  <td style={right}>{gone ? "—" : rupees(paise(a.cost) - charged)}</td>
                  <td style={cell}>
                    {gone ? <span style={{ fontSize: 13 }}>{HOW[String(a.disposal_kind)]} on {pretty(String(a.dd))}{Number(a.proceeds) > 0 ? ` for ${rupees(paise(a.proceeds))}` : ""}</span> : (
                      <details>
                        <summary style={{ cursor: "pointer", color: "#475569" }}>Sold or scrapped?</summary>
                        <form action={disposeAssetAction} style={{ display: "grid", gap: 8, margin: "8px 0", minWidth: 220 }}>
                          <input type="hidden" name="asset_id" value={String(a.id)} />
                          <select name="kind" defaultValue="SCRAPPED" style={field}>{Object.entries(HOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                          <label>Date<input type="date" name="disposed_on" defaultValue={today} required style={field} /></label>
                          <label>Money received (₹, only if sold)<input name="proceeds" inputMode="decimal" style={field} /></label>
                          <label>Received into
                            <select name="into" defaultValue="" style={field}>
                              <option value="">—</option>
                              {cash.map((c) => <option key={`c${c.id}`} value={`CASH:${c.id}`}>Cash: {String(c.cash_name)}</option>)}
                              {banks.filter((b) => Number(b.can_receive) === 1).map((b) => <option key={`b${b.id}`} value={`BANK:${b.id}`}>{bankLabel(b)}</option>)}
                            </select>
                          </label>
                          <input name="note" placeholder="Note (optional)" maxLength={250} style={field} />
                          <SubmitButton label="Remove from the list" question={`Remove ${a.asset_name} from the list? This cannot be undone; mistakes are fixed with a correcting entry.`} />
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
            {assets.length === 0 && <tr><td style={cell} colSpan={6}>No assets yet. Add the first one below.</td></tr>}
          </tbody>
        </table>
      </div>

      <section style={box}>
        <h2>Add an asset</h2>
        <form action={addAssetAction} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
          <label>Name<input name="asset_name" required maxLength={160} placeholder="Display racks, billing computer…" style={field} /></label>
          <label>Kind
            <select name="category" defaultValue="FURNITURE_FITTINGS" style={field}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label>Date bought<input type="date" name="purchase_date" required max={today} defaultValue={today} style={field} /></label>
          <label>Cost (₹)<input name="cost" inputMode="decimal" required style={field} /></label>
          <label>Lasts (years)<input name="life_years" inputMode="numeric" required defaultValue="5" style={field} /></label>
          <label>Value left at the end (₹, optional)<input name="salvage_value" inputMode="decimal" style={field} /></label>
          <label>How it was paid
            <select name="paid_from" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {cash.map((c) => <option key={`c${c.id}`} value={`CASH:${c.id}`}>Cash: {String(c.cash_name)}</option>)}
              {banks.filter((b) => Number(b.can_send) === 1).map((b) => <option key={`b${b.id}`} value={`BANK:${b.id}`}>{bankLabel(b)}</option>)}
              <option value="EARLIER">Already in my books (bought and entered earlier)</option>
            </select>
          </label>
          <label>Note (optional)<input name="remarks" maxLength={500} style={field} /></label>
          <div><SubmitButton label="Add asset" /></div>
        </form>
        <p style={{ color: "#64748b" }}>
          &ldquo;Already in my books&rdquo; is for something you owned before using this app: its cost must already be in your opening balances, and only the wear will be charged from here.
          Everything else is saved here and does not need to be entered again as an expense.
        </p>
      </section>
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
