import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/reports/money";
import { createTicketAction } from "@/lib/ticket-actions";
import { KIND_LABEL, STATUS_LABEL, TICKET_KINDS, daysOpen, isOpenStatus, type TicketKind, type TicketStatus } from "@/lib/ticket-math";
import SubmitButton from "@/components/SubmitButton";

type Props = { searchParams: Promise<{ result?: string; show?: string; customer?: string }> };
const MSG: Record<string, string> = {
  invalid: "Give a name (and a 10-digit phone if you have one) and a short summary.",
  "bad-day": "The follow-up day does not look right.",
  "no-bill": "No bill with that number was found. Check it, or leave it empty.",
  failed: "The ticket could not be saved. Nothing was changed.",
  "not-ready": "Tickets need the database file 079_service_tickets. Run it, then try again.",
};
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const field: React.CSSProperties = { display: "block", width: "100%", padding: 12, fontSize: 16, marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 6 };

async function Content({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const biz = user.legal_business_id;
  const q = await searchParams;
  const showAll = q.show === "all";
  const today = todayInIndia();

  let ready = true;
  let rows: RowDataPacket[] = [];
  try {
    [rows] = await db.execute<RowDataPacket[]>(
      `SELECT id, ticket_no, kind, status, contact_name, summary, DATE_FORMAT(created_at, '%Y-%m-%d') AS made,
              DATE_FORMAT(follow_up_on, '%Y-%m-%d') AS follow
         FROM acct_service_tickets WHERE legal_business_id = ? ${showAll ? "" : "AND status IN ('OPEN','WORKING')"}
        ORDER BY (status IN ('OPEN','WORKING')) DESC, id DESC LIMIT 200`, [biz]);
  } catch { ready = false; }

  let prefill = { name: "", phone: "" };
  if (/^[1-9]\d*$/.test(q.customer ?? "")) {
    try {
      const [c] = await db.execute<RowDataPacket[]>(`SELECT full_name, phone FROM acct_customers WHERE legal_business_id = ? AND id = ?`, [biz, Number(q.customer)]);
      if (c[0]) prefill = { name: String(c[0].full_name), phone: c[0].phone ? String(c[0].phone) : "" };
    } catch { /* ignore */ }
  }

  return (
    <main style={{ padding: 16, maxWidth: 960 }}>
      <h1>Customer tickets</h1>
      <p style={{ color: "#64748b" }}>A ticket keeps one customer problem in one place: a complaint, an exchange request or an alteration. Note what was done, set a follow-up day, and close it when it is sorted.</p>
      {q.result && MSG[q.result] && <p role="alert" style={{ color: "#b91c1c", fontSize: 17 }}>{MSG[q.result]}</p>}
      {!ready ? <p style={{ color: "#b91c1c" }}>This page needs the database file 079_service_tickets. Run it, then reload.</p> : (
        <>
          <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" }}>
            <h2 style={{ marginTop: 0 }}>Open a ticket</h2>
            <form action={createTicketAction} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
              <label>What kind
                <select name="kind" defaultValue="COMPLAINT" style={field}>
                  {TICKET_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label>Customer name<input name="contact_name" required minLength={2} maxLength={160} defaultValue={prefill.name} style={field} /></label>
              <label>Phone (10 digits, so we can link the customer)<input name="contact_phone" inputMode="numeric" maxLength={14} defaultValue={prefill.phone} style={field} /></label>
              <label>Bill number (optional)<input name="invoice_no" maxLength={60} style={field} /></label>
              <label>In a few words<input name="summary" required minLength={3} maxLength={200} placeholder="Colour ran after first wash" style={field} /></label>
              <label>More detail (optional)<textarea name="details" maxLength={1000} rows={3} style={field} /></label>
              <label>Follow up on (optional)<input type="date" name="follow_up_on" min={today} style={field} /></label>
              <div><SubmitButton label="Open ticket" /></div>
            </form>
          </section>

          <p>
            <Link className="btn-link" href={showAll ? "/accounting/tickets" : "/accounting/tickets?show=all"}>{showAll ? "Show only open tickets" : "Show closed tickets too"}</Link>
          </p>
          {rows.length === 0 ? <p style={{ fontSize: 18 }}>{showAll ? "No tickets yet." : "No open tickets."}</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead><tr><th style={cell}>Ticket</th><th style={cell}>Customer</th><th style={cell}>What</th><th style={cell}>State</th><th style={cell}>Follow up</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const open = isOpenStatus(String(r.status));
                    const late = open && r.follow && String(r.follow) < today;
                    return (
                      <tr key={String(r.id)}>
                        <td style={cell}><Link href={`/accounting/tickets/${r.id}`}>{String(r.ticket_no)}</Link><div style={{ color: "#64748b" }}>{KIND_LABEL[String(r.kind) as TicketKind] ?? String(r.kind)}</div></td>
                        <td style={cell}>{String(r.contact_name)}</td>
                        <td style={cell}>{String(r.summary)}</td>
                        <td style={cell}>{STATUS_LABEL[String(r.status) as TicketStatus] ?? String(r.status)}{open && <div style={{ color: "#64748b" }}>{daysOpen(String(r.made), today)} days</div>}</td>
                        <td style={{ ...cell, color: late ? "#b91c1c" : undefined }}>{r.follow ? String(r.follow) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
