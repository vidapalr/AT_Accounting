import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { addLeadAction, updateLeadAction } from "@/lib/lead-actions";
import { SOURCES, SOURCE_LABEL, STATUS_LABEL, isDue, type Source, type Status } from "@/lib/leads-math";
import { prettyPhone } from "@/lib/customer-phone";
import { whatsappLink } from "@/lib/whatsapp/core";
import TableSearch from "@/components/TableSearch";
import styles from "../accounting.module.css";

type Props = { searchParams: Promise<{ tab?: string; saved?: string; error?: string }> };
type Tab = "open" | "won" | "lost";

const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const input: React.CSSProperties = { padding: "10px 12px", fontSize: 16, borderRadius: 8, border: "1px solid #cbd5e1" };

export default function LeadsPage(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}

async function Content({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const q = await searchParams;
  const tab: Tab = q.tab === "won" ? "won" : q.tab === "lost" ? "lost" : "open";
  const b = user.legal_business_id;
  const today = todayIst();

  let leads: RowDataPacket[] = [];
  let counts = { open: 0, won: 0, lost: 0 };
  let notReady = false;
  try {
    const [c] = await db.execute<RowDataPacket[]>(
      `SELECT SUM(status IN ('NEW','FOLLOW_UP')) AS o, SUM(status = 'WON') AS w, SUM(status = 'LOST') AS l FROM acct_leads WHERE legal_business_id = ?`, [b]);
    counts = { open: Number(c[0]?.o ?? 0), won: Number(c[0]?.w ?? 0), lost: Number(c[0]?.l ?? 0) };
    const where = tab === "open" ? "status IN ('NEW','FOLLOW_UP')" : tab === "won" ? "status = 'WON'" : "status = 'LOST'";
    [leads] = await db.execute<RowDataPacket[]>(
      `SELECT id, full_name, phone, source, interest, status, note, customer_id,
              DATE_FORMAT(follow_up_on, '%Y-%m-%d') AS follow, DATE_FORMAT(created_at, '%d %b %Y') AS added
         FROM acct_leads WHERE legal_business_id = ? AND ${where}
        ORDER BY (follow_up_on IS NULL), follow_up_on, id DESC LIMIT 300`, [b]);
  } catch { notReady = true; }

  // People who wrote to us on WhatsApp but are not customers and not already leads.
  let askers: RowDataPacket[] = [];
  if (!notReady && tab === "open") {
    try {
      [askers] = await db.execute<RowDataPacket[]>(
        `SELECT RIGHT(c.wa_number, 10) AS ph, MAX(c.contact_name) AS nm, MAX(c.last_text) AS txt
           FROM acct_bot_conversations c
          WHERE c.legal_business_id = ? AND c.last_inbound_at IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM acct_customers x WHERE x.legal_business_id = c.legal_business_id AND x.phone = RIGHT(c.wa_number, 10))
            AND NOT EXISTS (SELECT 1 FROM acct_leads l WHERE l.legal_business_id = c.legal_business_id AND l.phone = RIGHT(c.wa_number, 10))
          GROUP BY RIGHT(c.wa_number, 10) ORDER BY MAX(c.last_inbound_at) DESC LIMIT 8`, [b]);
    } catch { askers = []; }
  }

  const tabLink = (t: Tab, label: string, n: number) => (
    <Link role="tab" aria-selected={tab === t} href={`/accounting/leads?tab=${t}`}
      style={{ padding: "12px 20px", fontSize: 16, fontWeight: 600, textDecoration: "none", borderRadius: "10px 10px 0 0", border: "1px solid #cbd5e1",
        borderBottom: tab === t ? "3px solid #4f46e5" : "1px solid #cbd5e1", background: tab === t ? "#eef2ff" : "#fff", color: tab === t ? "#3730a3" : "#334155" }}>
      {label} ({n})
    </Link>
  );

  return (
    <main className={styles.page}>
      <h1>Leads</h1>
      <p>People who asked about your cloth but have not bought yet. Note where they came from, set a day to follow up, and turn them into a customer when they buy.</p>
      {q.saved && <p role="status" style={{ color: "#166534" }}>{q.saved}</p>}
      {q.error && <p role="alert" style={{ color: "#b91c1c" }}>{q.error}</p>}
      {notReady && <p role="alert" style={{ color: "#b91c1c" }}>Not set up yet: run the database file 068_leads.</p>}

      {!notReady && (
        <>
          <details open={counts.open === 0} style={{ margin: "12px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 16 }}>+ Add a lead</summary>
            <form action={addLeadAction} style={{ display: "grid", gap: 10, maxWidth: 520, marginTop: 10 }}>
              <input name="full_name" required minLength={2} maxLength={160} placeholder="Name" style={input} />
              <input name="phone" inputMode="tel" maxLength={20} placeholder="Mobile number" style={input} />
              <select name="source" defaultValue="WALK_IN" style={input} aria-label="Where did they come from?">
                {SOURCES.map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
              <input name="interest" maxLength={300} placeholder="What are they looking for? (bridal silk, 10 sarees…)" style={input} />
              <label>Follow up on (optional)<input type="date" name="follow_up_on" style={{ ...input, display: "block", marginTop: 4 }} /></label>
              <input name="note" maxLength={500} placeholder="Note (optional)" style={input} />
              <button type="submit" style={{ ...input, background: "#4f46e5", color: "#fff", fontWeight: 700 }}>Save lead</button>
            </form>
          </details>

          {askers.length > 0 && (
            <section style={{ border: "1px solid #fcd34d", background: "#fffbeb", borderRadius: 10, padding: 12, margin: "12px 0" }}>
              <strong>Wrote to you on WhatsApp but never bought</strong>
              {askers.map(a => (
                <form key={String(a.ph)} action={addLeadAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  <input type="hidden" name="full_name" value={String(a.nm || `WhatsApp ${a.ph}`)} />
                  <input type="hidden" name="phone" value={String(a.ph)} />
                  <input type="hidden" name="source" value="WHATSAPP" />
                  <input type="hidden" name="interest" value={String(a.txt ?? "").slice(0, 200)} />
                  <span style={{ flex: "1 1 260px" }}>{String(a.nm || "Unknown")} · {prettyPhone(String(a.ph))}<br /><small style={{ color: "#64748b" }}>{String(a.txt ?? "").slice(0, 100)}</small></span>
                  <button type="submit" style={{ padding: "8px 14px" }}>Add as lead</button>
                </form>
              ))}
            </section>
          )}

          <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
            {tabLink("open", "Open", counts.open)}
            {tabLink("won", "Bought", counts.won)}
            {tabLink("lost", "Not interested", counts.lost)}
          </div>
          <TableSearch placeholder="Search leads: name, mobile, interest…" />
          <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead><tr>{["Who", "Looking for", "Follow up", "Actions"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {leads.length === 0 && <tr><td style={cell} colSpan={4}>{tab === "open" ? "No open leads. Add one above." : "Nothing here yet."}</td></tr>}
                {leads.map(l => {
                  const due = isDue(String(l.status), l.follow ? String(l.follow) : null, today);
                  const phone = l.phone ? String(l.phone) : null;
                  return (
                    <tr key={String(l.id)} style={due ? { background: "#fef2f2" } : undefined}>
                      <td style={cell}>
                        <strong>{String(l.full_name)}</strong><br />
                        {phone ? prettyPhone(phone) : "No mobile"}<br />
                        <small style={{ color: "#64748b" }}>{SOURCE_LABEL[String(l.source) as Source] ?? "Other"} · added {String(l.added)} · {STATUS_LABEL[String(l.status) as Status]}</small>
                      </td>
                      <td style={cell}>{l.interest ? String(l.interest) : "—"}{l.note ? <><br /><small style={{ color: "#64748b" }}>{String(l.note)}</small></> : null}</td>
                      <td style={{ ...cell, whiteSpace: "nowrap", color: due ? "#b91c1c" : undefined, fontWeight: due ? 700 : undefined }}>
                        {l.follow ? `${String(l.follow)}${due ? " (due)" : ""}` : "—"}
                      </td>
                      <td style={cell}>
                        {tab === "open" && (
                          <form action={updateLeadAction} style={{ display: "grid", gap: 6, minWidth: 230 }}>
                            <input type="hidden" name="lead_id" value={String(l.id)} />
                            <input type="date" name="follow_up_on" defaultValue={l.follow ? String(l.follow) : ""} style={{ ...input, padding: 8 }} aria-label="Follow up on" />
                            <input name="note" defaultValue={l.note ? String(l.note) : ""} maxLength={500} placeholder="Note" style={{ ...input, padding: 8 }} />
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button type="submit" name="action" value="save" style={{ padding: "8px 12px" }}>Save</button>
                              <button type="submit" name="action" value="customer" style={{ padding: "8px 12px", background: "#166534", color: "#fff" }}>They bought: make customer</button>
                              <button type="submit" name="action" value="lost" style={{ padding: "8px 12px" }}>Not interested</button>
                            </div>
                            {phone && <a className="btn-link" href={whatsappLink(`91${phone}`, `Hello ${l.full_name}, this is Abhiram Textiles. Thank you for asking about our cloth. Can we help you choose?`)} target="_blank" rel="noreferrer">WhatsApp them</a>}
                          </form>
                        )}
                        {tab === "won" && l.customer_id && <Link href={`/accounting/customers/${l.customer_id}`}>Open customer</Link>}
                        {tab === "lost" && (
                          <form action={updateLeadAction}>
                            <input type="hidden" name="lead_id" value={String(l.id)} />
                            <button type="submit" name="action" value="reopen" style={{ padding: "8px 12px" }}>Open again</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
