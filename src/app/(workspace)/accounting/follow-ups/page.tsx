import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/reports/money";
import { bucketOf, addDays, type Bucket } from "@/lib/follow-up-math";
import { followUpAction } from "@/lib/follow-up-actions";

type Props = { searchParams: Promise<{ result?: string }> };
type Item = { type: "LEAD" | "NOTE" | "TICKET"; id: number; day: string; name: string; what: string; phone: string | null; href: string };

const MSG: Record<string, string> = {
  done: "Marked done.", moved: "Moved to the new day.", "bad-day": "Pick a valid day.", invalid: "That follow-up was not found.",
  failed: "It could not be saved. Nothing was changed.",
};
const HEADINGS: { key: Bucket; title: string; color: string }[] = [
  { key: "overdue", title: "Overdue", color: "#b91c1c" },
  { key: "today", title: "Today", color: "#166534" },
  { key: "week", title: "Next 7 days", color: "#0f172a" },
  { key: "later", title: "Later", color: "#64748b" },
];
const input: React.CSSProperties = { padding: 10, fontSize: 16, borderRadius: 8, border: "1px solid #cbd5e1" };
const btn: React.CSSProperties = { padding: "10px 16px", fontSize: 16, borderRadius: 8, cursor: "pointer" };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const biz = user.legal_business_id;
  const query = await searchParams;
  const today = todayInIndia();
  const items: Item[] = [];

  try {
    const [leads] = await db.execute<RowDataPacket[]>(
      `SELECT id, full_name, phone, interest, note, DATE_FORMAT(follow_up_on, '%Y-%m-%d') AS d FROM acct_leads
        WHERE legal_business_id = ? AND status IN ('NEW','FOLLOW_UP') AND follow_up_on IS NOT NULL ORDER BY follow_up_on LIMIT 300`, [biz]);
    for (const l of leads) items.push({ type: "LEAD", id: Number(l.id), day: String(l.d), name: String(l.full_name), what: `Lead: ${l.interest ?? l.note ?? "asked about our cloth"}`, phone: l.phone ? String(l.phone) : null, href: "/accounting/leads" });
  } catch { /* before migration 068 */ }
  let notesReady = true;
  try {
    const [notes] = await db.execute<RowDataPacket[]>(
      `SELECT n.id, n.customer_id, n.note, n.kind, c.full_name, c.phone, DATE_FORMAT(n.follow_up_on, '%Y-%m-%d') AS d
         FROM acct_customer_notes n JOIN acct_customers c ON c.legal_business_id = n.legal_business_id AND c.id = n.customer_id
        WHERE n.legal_business_id = ? AND n.follow_up_on IS NOT NULL AND n.follow_done_at IS NULL ORDER BY n.follow_up_on LIMIT 300`, [biz]);
    for (const n of notes) items.push({ type: "NOTE", id: Number(n.id), day: String(n.d), name: String(n.full_name), what: String(n.note), phone: n.phone ? String(n.phone) : null, href: `/accounting/customers/${n.customer_id}#history` });
  } catch { notesReady = false; }

  try {
    const [tickets] = await db.execute<RowDataPacket[]>(
      `SELECT id, ticket_no, summary, contact_name, contact_phone, DATE_FORMAT(follow_up_on, '%Y-%m-%d') AS d FROM acct_service_tickets
        WHERE legal_business_id = ? AND status IN ('OPEN','WORKING') AND follow_up_on IS NOT NULL ORDER BY follow_up_on LIMIT 300`, [biz]);
    for (const t of tickets) items.push({ type: "TICKET", id: Number(t.id), day: String(t.d), name: String(t.contact_name), what: `Ticket ${t.ticket_no}: ${t.summary}`, phone: t.contact_phone ? String(t.contact_phone) : null, href: `/accounting/tickets/${t.id}` });
  } catch { /* before migration 079 */ }

  items.sort((a, b) => a.day.localeCompare(b.day));
  const groups = new Map<Bucket, Item[]>();
  for (const i of items) { const b = bucketOf(i.day, today); groups.set(b, [...(groups.get(b) ?? []), i]); }
  const tomorrow = addDays(today, 1);

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Follow-ups</h1>
      <p style={{ color: "#64748b" }}>Everyone you promised to call or message: leads with a follow-up day, and customers where you set a follow-up day on a note. Do it, tap Done, and set the next day if there is one.</p>
      {query.result && MSG[query.result] && <p role="status" style={{ fontSize: 17, color: query.result === "done" || query.result === "moved" ? "#166534" : "#b91c1c" }}>{MSG[query.result]}</p>}
      {!notesReady && <p style={{ color: "#92400e" }}>Customer follow-ups need the database file 078_follow_ups. Leads still show below.</p>}
      {items.length === 0 && <p style={{ fontSize: 18 }}>Nothing to follow up. Add a follow-up day on a lead, or on a note on a customer&rsquo;s page.</p>}
      {HEADINGS.map(({ key, title, color }) => {
        const list = groups.get(key) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={key} style={{ margin: "20px 0" }}>
            <h2 style={{ color }}>{title} ({list.length})</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {list.map((i) => {
                const digits = i.phone?.replace(/\D/g, "").slice(-10) ?? "";
                return (
                  <div key={`${i.type}${i.id}`} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <strong><Link href={i.href}>{i.name}</Link></strong>
                      <span style={{ color }}>{i.day}</span>
                    </div>
                    <div style={{ color: "#475569", margin: "4px 0 10px" }}>{i.what}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {digits.length === 10 && <a className="btn-link" style={btn} href={`tel:+91${digits}`}>Call</a>}
                      {digits.length === 10 && <a className="btn-link" style={btn} href={`https://wa.me/91${digits}`} target="_blank" rel="noreferrer">WhatsApp</a>}
                    </div>
                    <form action={followUpAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <input type="hidden" name="type" value={i.type} /><input type="hidden" name="id" value={i.id} />
                      <input name="result" maxLength={400} placeholder="What happened (optional)" style={{ ...input, flex: "1 1 220px" }} />
                      <input type="date" name="next_day" min={tomorrow} aria-label="Next follow-up day (optional)" style={input} />
                      <button type="submit" name="mode" value="done" className="btn-link btn-link-primary" style={btn}>Done</button>
                      <button type="submit" name="mode" value="move" className="btn-link" style={btn}>Move to that day</button>
                    </form>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
