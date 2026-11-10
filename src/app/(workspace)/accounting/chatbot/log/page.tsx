import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { explainWhatsAppError, maskPhone, stuckHint } from "@/lib/bot/wa-errors";

type Row = RowDataPacket & Record<string, string | number | null>;
type Entry = {
  at: string; ms: number; what: string; to: string; waId: string | null; failedToSend: string | null;
};

const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const IST_MIN = 330; // the database keeps UTC; show Indian time

async function Content() {
  const user = await requireAccess("online_orders");
  const biz = user.legal_business_id;
  const entries: Entry[] = [];

  try {
    const [bills] = await db.execute<Row[]>(
      `SELECT DATE_FORMAT(DATE_ADD(e.occurred_at, INTERVAL ${IST_MIN} MINUTE), '%d %b %H:%i') AS at, UNIX_TIMESTAMP(e.occurred_at) * 1000 AS ms,
              s.invoice_no, JSON_UNQUOTE(JSON_EXTRACT(e.details_json, '$.waId')) AS wa_id, JSON_UNQUOTE(JSON_EXTRACT(e.details_json, '$.to')) AS sent_to,
              JSON_UNQUOTE(JSON_EXTRACT(e.details_json, '$.template')) AS tpl, JSON_EXTRACT(e.details_json, '$.ok') AS ok,
              JSON_UNQUOTE(JSON_EXTRACT(e.details_json, '$.reason')) AS reason, JSON_UNQUOTE(JSON_EXTRACT(e.details_json, '$.code')) AS code
         FROM acct_audit_events e LEFT JOIN acct_sales_headers s ON s.id = e.subject_id AND s.legal_business_id = e.legal_business_id
        WHERE e.legal_business_id = ? AND e.action = 'BILL_AUTO_SEND' ORDER BY e.id DESC LIMIT 60`, [biz]);
    for (const b of bills) {
      const waId = b.wa_id && b.wa_id !== "null" ? String(b.wa_id) : null;
      entries.push({
        at: String(b.at), ms: Number(b.ms), what: `Bill ${b.invoice_no ?? ""}${b.tpl && b.tpl !== "null" ? ` (template ${b.tpl})` : ""}`,
        to: b.sent_to && b.sent_to !== "null" ? String(b.sent_to) : "number on the bill", waId,
        failedToSend: waId ? null : `Not accepted by WhatsApp${b.reason && b.reason !== "null" ? `: ${b.reason}` : ""}${b.code && b.code !== "null" ? ` (code ${b.code})` : ""}`,
      });
    }
  } catch { /* audit table columns differ or empty */ }

  try {
    const [recs] = await db.execute<Row[]>(
      `SELECT DATE_FORMAT(DATE_ADD(r.sent_at, INTERVAL ${IST_MIN} MINUTE), '%d %b %H:%i') AS at, UNIX_TIMESTAMP(r.sent_at) * 1000 AS ms,
              b.product_label, r.phone, r.wa_message_id, r.status, r.error_reason
         FROM acct_wa_broadcast_recipients r JOIN acct_wa_broadcasts b ON b.id = r.broadcast_id
        WHERE r.legal_business_id = ? AND r.sent_at IS NOT NULL ORDER BY r.id DESC LIMIT 60`, [biz]);
    for (const r of recs) {
      entries.push({
        at: String(r.at), ms: Number(r.ms), what: `New stock: ${r.product_label}`, to: maskPhone(String(r.phone)),
        waId: r.wa_message_id ? String(r.wa_message_id) : null,
        failedToSend: r.status === "FAILED" ? `Not accepted by WhatsApp${r.error_reason ? `: ${r.error_reason}` : ""}` : null,
      });
    }
  } catch { /* before migration 074 */ }

  entries.sort((a, b) => b.ms - a.ms);
  const shown = entries.slice(0, 80);

  const ids = shown.map((e) => e.waId).filter((x): x is string => !!x);
  const steps = new Map<string, { status: string; at: string; code: number | null; reason: string | null }[]>();
  let logReady = true;
  let anyStatusEver = false;
  if (ids.length > 0) {
    try {
      const [log] = await db.execute<Row[]>(
        `SELECT wa_message_id, status, error_code, error_reason, DATE_FORMAT(DATE_ADD(created_at, INTERVAL ${IST_MIN} MINUTE), '%H:%i') AS at
           FROM acct_wa_status_log WHERE wa_message_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids);
      for (const l of log) {
        const list = steps.get(String(l.wa_message_id)) ?? [];
        list.push({ status: String(l.status), at: String(l.at), code: l.error_code ? Number(l.error_code) : null, reason: l.error_reason ? String(l.error_reason) : null });
        steps.set(String(l.wa_message_id), list);
      }
    } catch { logReady = false; }
  }
  try {
    const [any] = await db.execute<Row[]>(`SELECT COUNT(*) AS n FROM acct_wa_delivery`);
    anyStatusEver = Number(any[0]?.n ?? 0) > 0;
  } catch { /* before migration 074 */ }
  const now = Date.now();

  return (
    <main style={{ padding: 16, maxWidth: 1000 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/chatbot">← WhatsApp chatbot</Link></nav>
      <h1>WhatsApp message log</h1>
      <p style={{ color: "#64748b" }}>
        Every bill and new-stock message the app sent by itself, and each step WhatsApp reported: handed over, delivered, read, or failed.
        Times are Indian time. Reload to see new steps.
      </p>
      {!logReady && <p style={{ color: "#92400e" }}>Step-by-step times need the new database step (077_wa_status_log). Until then only the latest result is shown.</p>}
      {shown.length === 0 ? <p>Nothing has been sent automatically yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead><tr><th style={cell}>Sent</th><th style={cell}>What</th><th style={cell}>To</th><th style={cell}>Where it is now</th></tr></thead>
            <tbody>
              {shown.map((e, i) => {
                const list = e.waId ? steps.get(e.waId) ?? [] : [];
                const last = list.length > 0 ? list[list.length - 1] : null;
                const furthest = ["read", "delivered", "failed", "sent"].find((s) => list.some((x) => x.status === s)) ?? "";
                const failed = list.find((x) => x.status === "failed");
                const minutes = Math.floor((now - e.ms) / 60000);
                const hint = e.failedToSend ? "" : stuckHint(furthest, minutes, anyStatusEver);
                return (
                  <tr key={i}>
                    <td style={cell}>{e.at}</td>
                    <td style={cell}>{e.what}</td>
                    <td style={cell}>{e.to}</td>
                    <td style={cell}>
                      {e.failedToSend ? <span style={{ color: "#b91c1c" }}>{e.failedToSend}</span> : (
                        <>
                          <div>
                            Handed to WhatsApp
                            {list.map((x, k) => <span key={k}> → <strong style={{ color: x.status === "failed" ? "#b91c1c" : x.status === "sent" ? undefined : "#166534" }}>{x.status}</strong> {x.at}</span>)}
                          </div>
                          {failed && <div style={{ color: "#b91c1c" }}>Code {failed.code ?? "?"}: {failed.reason} {explainWhatsAppError(failed.code)}</div>}
                          {hint && <div style={{ color: "#92400e" }}>{hint}</div>}
                          {!last && !hint && <div style={{ color: "#64748b" }}>No report yet.</div>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return <Suspense fallback={<p>Loading…</p>}><Content /></Suspense>;
}
