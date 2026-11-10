import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/reports/money";
import { updateTicketAction } from "@/lib/ticket-actions";
import { KIND_LABEL, STATUS_LABEL, allowedNext, isOpenStatus, type TicketKind, type TicketStatus } from "@/lib/ticket-math";
import SubmitButton from "@/components/SubmitButton";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ result?: string }> };
const MSG: Record<string, { ok: boolean; text: string }> = {
  created: { ok: true, text: "Ticket opened." },
  saved: { ok: true, text: "Saved." },
  "bad-day": { ok: false, text: "The follow-up day does not look right." },
  "bad-move": { ok: false, text: "That change is not allowed from the current state." },
  nothing: { ok: false, text: "Nothing to save: change the state, write a note or set a day." },
  "need-resolution": { ok: false, text: "Write what was done before resolving or closing." },
  failed: { ok: false, text: "It could not be saved. Nothing was changed." },
};
const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const field: React.CSSProperties = { display: "block", width: "100%", padding: 12, fontSize: 16, marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 6 };

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("customers");
  const biz = user.legal_business_id;
  const { id } = await params;
  const q = await searchParams;
  if (!/^[1-9]\d*$/.test(id)) notFound();

  const [t] = await db.execute<RowDataPacket[]>(
    `SELECT t.*, DATE_FORMAT(t.created_at, '%d %b %Y') AS made, DATE_FORMAT(t.follow_up_on, '%Y-%m-%d') AS follow, s.invoice_no
       FROM acct_service_tickets t LEFT JOIN acct_sales_headers s ON s.id = t.sale_id AND s.legal_business_id = t.legal_business_id
      WHERE t.legal_business_id = ? AND t.id = ?`, [biz, Number(id)]);
  if (!t[0]) notFound();
  const tk = t[0];
  const [log] = await db.execute<RowDataPacket[]>(
    `SELECT l.status_after, l.note, DATE_FORMAT(DATE_ADD(l.created_at, INTERVAL 330 MINUTE), '%d %b %H:%i') AS at, u.full_name
       FROM acct_service_ticket_log l LEFT JOIN acct_app_users u ON u.id = l.created_by
      WHERE l.legal_business_id = ? AND l.ticket_id = ? ORDER BY l.id DESC`, [biz, Number(id)]);

  const status = String(tk.status) as TicketStatus;
  const next = allowedNext(status);
  const open = isOpenStatus(status);
  const digits = tk.contact_phone ? String(tk.contact_phone) : "";
  const msg = q.result ? MSG[q.result] : null;
  const today = todayInIndia();

  return (
    <main style={{ padding: 16, maxWidth: 800 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/tickets">← All tickets</Link></nav>
      <h1>{String(tk.ticket_no)}: {String(tk.summary)}</h1>
      {msg && <p role="status" style={{ fontSize: 17, color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>}
      <p style={{ fontSize: 17 }}>
        <strong>{KIND_LABEL[String(tk.kind) as TicketKind] ?? String(tk.kind)}</strong> · {STATUS_LABEL[status]} · opened {String(tk.made)}
        {tk.follow ? <> · follow up {String(tk.follow)}</> : null}
      </p>
      <p>
        {tk.customer_id ? <Link href={`/accounting/customers/${tk.customer_id}`}>{String(tk.contact_name)}</Link> : String(tk.contact_name)}
        {digits ? <> · {digits}</> : null}
        {tk.sale_id ? <> · Bill <Link href={`/accounting/sales/${tk.sale_id}`}>{String(tk.invoice_no)}</Link></> : null}
      </p>
      {tk.details && <p style={{ whiteSpace: "pre-wrap", color: "#334155" }}>{String(tk.details)}</p>}
      {tk.resolution && <p style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 10 }}><strong>What was done:</strong> {String(tk.resolution)}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {digits.length === 10 && <a className="btn-link" style={{ padding: "10px 16px" }} href={`tel:+91${digits}`}>Call</a>}
        {digits.length === 10 && <a className="btn-link" style={{ padding: "10px 16px" }} href={`https://wa.me/91${digits}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        {String(tk.kind) === "EXCHANGE" && open && <Link className="btn-link btn-link-primary" style={{ padding: "10px 16px" }} href="/accounting/returns">Start the exchange</Link>}
      </div>

      {status !== "CLOSED" && (
        <section style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" }}>
          <h2 style={{ marginTop: 0 }}>Update</h2>
          <form action={updateTicketAction} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <input type="hidden" name="id" value={String(tk.id)} />
            <label>State
              <select name="status" defaultValue="" style={field}>
                <option value="">Keep as {STATUS_LABEL[status]}</option>
                {next.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label>What happened (note)<input name="note" maxLength={500} style={field} /></label>
            <label>What was done to sort it (needed to resolve or close)<input name="resolution" maxLength={500} style={field} /></label>
            <label>Next follow-up day (for open tickets)<input type="date" name="follow_up_on" min={today} defaultValue={tk.follow ? String(tk.follow) : ""} style={field} /></label>
            <div><SubmitButton label="Save" /></div>
          </form>
        </section>
      )}

      <h2>History</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={cell}>When</th><th style={cell}>State</th><th style={cell}>Note</th><th style={cell}>By</th></tr></thead>
        <tbody>
          {log.map((l, i) => (
            <tr key={i}>
              <td style={cell}>{String(l.at)}</td>
              <td style={cell}>{STATUS_LABEL[String(l.status_after) as TicketStatus] ?? String(l.status_after)}</td>
              <td style={cell}>{l.note ? String(l.note) : ""}</td>
              <td style={cell}>{l.full_name ? String(l.full_name) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
