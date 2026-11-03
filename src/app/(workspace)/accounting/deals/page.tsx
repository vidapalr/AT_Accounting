import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { addDealAction, moveDealAction, editDealAction } from "@/lib/deal-actions";
import { OPEN_STAGES, STAGE_LABEL, neighbour, stageTotals, winRate, type Stage } from "@/lib/deals-math";
import { prettyPhone } from "@/lib/customer-phone";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };

const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}`;
const input: React.CSSProperties = { padding: "10px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #cbd5e1" };
const small: React.CSSProperties = { padding: "10px 14px", fontSize: 15 };

export default function DealsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const q = await searchParams;
  const today = todayIst();
  let deals: RowDataPacket[] = [];
  let notReady = false;
  try {
    [deals] = await db.execute<RowDataPacket[]>(
      `SELECT id, party_name, phone, customer_id, title, stage, note, lost_reason,
              ROUND(expected_value * 100) AS vp, DATE_FORMAT(expected_close, '%Y-%m-%d') AS close_on, expected_value,
              DATE_FORMAT(closed_on, '%d %b %Y') AS closed
         FROM acct_deals
        WHERE legal_business_id = ? AND (stage IN ('ENQUIRY','QUOTED','NEGOTIATING') OR closed_on >= (CURDATE() - INTERVAL 90 DAY))
        ORDER BY (expected_close IS NULL), expected_close, id DESC LIMIT 400`, [user.legal_business_id]);
  } catch { notReady = true; }

  const totals = stageTotals(deals.map(d => ({ stage: String(d.stage), valuePaise: BigInt(Math.round(Number(d.vp))) })));
  const open = deals.filter(d => (OPEN_STAGES as readonly string[]).includes(String(d.stage)));
  const closed = deals.filter(d => !(OPEN_STAGES as readonly string[]).includes(String(d.stage)));
  const openValue = OPEN_STAGES.reduce((s, st) => s + totals[st].valuePaise, 0n);
  const rate = winRate(totals.WON.count, totals.LOST.count);

  return (
    <main className={styles.page}>
      <h1>Sales pipeline</h1>
      <p>For bigger or wholesale deals that take more than one visit. Move each deal along as it goes from enquiry to quote to bargaining, then won or lost. Everyday retail sales do not need this.</p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error}</p>}
      {notReady && <p role="alert" style={{ color: "#b91c1c" }}>Not set up yet: run the database file 069_deals.</p>}

      {!notReady && (
        <>
          <p style={{ fontSize: 16 }}>
            <strong>{open.length}</strong> open deals worth about <strong>{rupees(openValue)}</strong>.
            {rate !== null && <> Of deals closed in the last 90 days, <strong>{rate}%</strong> were won.</>}
          </p>

          <details open={deals.length === 0} style={{ margin: "12px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>+ Add a deal</summary>
            <form action={addDealAction} style={{ display: "grid", gap: 10, maxWidth: 520, marginTop: 10 }}>
              <input name="party_name" required minLength={2} maxLength={160} placeholder="Who is it with? (shop or person)" style={input} />
              <input name="phone" inputMode="tel" maxLength={20} placeholder="Mobile number" style={input} />
              <input name="title" required minLength={2} maxLength={200} placeholder="What is it for? (50 sarees for a wedding)" style={input} />
              <input name="expected_value" inputMode="decimal" maxLength={14} placeholder="Expected amount ₹" style={input} />
              <label>Expected to close by (optional)<input type="date" name="expected_close" style={{ ...input, display: "block", marginTop: 4 }} /></label>
              <input name="note" maxLength={500} placeholder="Note (optional)" style={input} />
              <button type="submit" style={{ ...input, background: "#4f46e5", color: "#fff", fontWeight: 700 }}>Save deal</button>
            </form>
          </details>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14, alignItems: "start" }}>
            {OPEN_STAGES.map(stage => (
              <section key={stage} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 10 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>
                  {STAGE_LABEL[stage]} <small style={{ color: "#64748b", fontWeight: 400 }}>({totals[stage].count}) {rupees(totals[stage].valuePaise)}</small>
                </h2>
                {open.filter(d => d.stage === stage).length === 0 && <p style={{ color: "#94a3b8", margin: 4 }}>Nothing here.</p>}
                {open.filter(d => d.stage === stage).map(d => {
                  const late = d.close_on && String(d.close_on) < today;
                  const back = neighbour(stage, -1), next = neighbour(stage, 1);
                  return (
                    <article key={String(d.id)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                      <strong>{String(d.party_name)}</strong>{d.phone ? <> · {prettyPhone(String(d.phone))}</> : null}
                      <div>{String(d.title)}</div>
                      <div style={{ marginTop: 4 }}>
                        <strong>{rupees(BigInt(Math.round(Number(d.vp))))}</strong>
                        {d.close_on ? <span style={{ color: late ? "#b91c1c" : "#64748b", fontWeight: late ? 700 : 400 }}> · close by {String(d.close_on)}{late ? " (late)" : ""}</span> : null}
                      </div>
                      {d.note ? <small style={{ color: "#64748b" }}>{String(d.note)}</small> : null}
                      <form action={moveDealAction} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        <input type="hidden" name="deal_id" value={String(d.id)} />
                        {back && <button type="submit" name="to" value="back" style={small}>← {STAGE_LABEL[back]}</button>}
                        {next && <button type="submit" name="to" value="next" style={{ ...small, background: "#4f46e5", color: "#fff" }}>{STAGE_LABEL[next]} →</button>}
                        <button type="submit" name="to" value="WON" style={{ ...small, background: "#166534", color: "#fff" }}>Won</button>
                      </form>
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: "pointer" }}>More</summary>
                        <form action={editDealAction} style={{ display: "grid", gap: 6, marginTop: 6 }}>
                          <input type="hidden" name="deal_id" value={String(d.id)} />
                          <input name="expected_value" defaultValue={String(d.expected_value)} inputMode="decimal" aria-label="Expected amount" style={input} />
                          <input type="date" name="expected_close" defaultValue={d.close_on ? String(d.close_on) : ""} aria-label="Close by" style={input} />
                          <input name="note" defaultValue={d.note ? String(d.note) : ""} maxLength={500} placeholder="Note" style={input} />
                          <button type="submit" style={small}>Save changes</button>
                        </form>
                        <form action={moveDealAction} style={{ display: "grid", gap: 6, marginTop: 8 }}>
                          <input type="hidden" name="deal_id" value={String(d.id)} />
                          <input type="hidden" name="to" value="LOST" />
                          <input name="lost_reason" maxLength={200} placeholder="Why was it lost? (price, went elsewhere…)" style={input} />
                          <button type="submit" style={small}>Mark as lost</button>
                        </form>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                          <Link className="btn-link" href="/accounting/sales?estimate=1">Make an estimate</Link>
                          <Link className="btn-link" href="/accounting/sales">New sale</Link>
                          {d.customer_id ? <Link className="btn-link" href={`/accounting/customers/${d.customer_id}`}>Open customer</Link> : null}
                        </div>
                      </details>
                    </article>
                  );
                })}
              </section>
            ))}
          </div>

          <h2 style={{ marginTop: 28 }}>Closed in the last 90 days</h2>
          <p style={{ color: "#64748b", marginTop: 0 }}>Won {totals.WON.count} ({rupees(totals.WON.valuePaise)}) · Lost {totals.LOST.count} ({rupees(totals.LOST.valuePaise)})</p>
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <tbody>
                {closed.length === 0 && <tr><td style={{ padding: 10 }} colSpan={4}>Nothing closed yet.</td></tr>}
                {closed.map(d => (
                  <tr key={String(d.id)}>
                    <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0", fontWeight: 700, color: d.stage === "WON" ? "#166534" : "#b91c1c" }}>{STAGE_LABEL[String(d.stage) as Stage]}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{String(d.party_name)} · {String(d.title)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>{rupees(BigInt(Math.round(Number(d.vp))))}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0", color: "#64748b" }}>{String(d.closed ?? "")}{d.lost_reason ? ` · ${String(d.lost_reason)}` : ""}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #e2e8f0" }}>
                      <form action={moveDealAction}>
                        <input type="hidden" name="deal_id" value={String(d.id)} />
                        <button type="submit" name="to" value="ENQUIRY" style={{ padding: "6px 10px" }}>Open again</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
