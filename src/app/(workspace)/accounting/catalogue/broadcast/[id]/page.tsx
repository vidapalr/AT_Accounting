import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import BroadcastRunner from "@/components/BroadcastRunner";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ go?: string }> };

function label(status: string, delivery: string | null, reason: string | null): { text: string; color: string } {
  if (status === "FAILED") return { text: `Not sent: ${reason ?? "refused"}`, color: "#b91c1c" };
  if (status === "SKIPPED") return { text: reason ?? "Skipped", color: "#64748b" };
  if (status === "QUEUED" || status === "SENDING") return { text: "Waiting", color: "#92400e" };
  if (delivery === "failed") return { text: `Not delivered: ${reason ?? "WhatsApp could not deliver it"}`, color: "#b91c1c" };
  if (delivery === "read") return { text: "Read", color: "#166534" };
  if (delivery === "delivered") return { text: "Delivered", color: "#166534" };
  return { text: "Sent, not confirmed yet", color: "#475569" };
}

async function Content({ params, searchParams }: Props) {
  const user = await requireGroupOwner();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const [bc] = await db.execute<RowDataPacket[]>(
    `SELECT id, product_label, status, DATE_FORMAT(created_at, '%d %b %Y %H:%i') AS at FROM acct_wa_broadcasts WHERE legal_business_id = ? AND id = ?`,
    [user.legal_business_id, Number(id)]);
  if (!bc[0]) notFound();
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT r.id, r.status, r.error_reason, c.full_name, r.phone, d.status AS delivery, d.error_reason AS delivery_reason
       FROM acct_wa_broadcast_recipients r
       JOIN acct_customers c ON c.legal_business_id = r.legal_business_id AND c.id = r.customer_id
       LEFT JOIN acct_wa_delivery d ON d.wa_message_id = r.wa_message_id
      WHERE r.broadcast_id = ? ORDER BY r.id LIMIT 600`, [Number(id)]);
  const count = (f: (r: RowDataPacket) => boolean) => rows.filter(f).length;
  const queued = count(r => r.status === "QUEUED" || r.status === "SENDING");
  const summary = {
    total: rows.length,
    waiting: queued,
    sent: count(r => r.status === "SENT"),
    delivered: count(r => r.status === "SENT" && (r.delivery === "delivered" || r.delivery === "read")),
    failed: count(r => r.status === "FAILED" || (r.status === "SENT" && r.delivery === "failed")),
  };
  const go = (await searchParams).go === "1";

  return (
    <div style={{ maxWidth: 820 }}>
      <nav style={{ marginBottom: 12 }}><Link href="/accounting/catalogue/broadcast">← Send on WhatsApp</Link></nav>
      <h1>{String(bc[0].product_label)}</h1>
      <p style={{ color: "#475569" }}>Started {String(bc[0].at)}</p>
      <BroadcastRunner broadcastId={Number(id)} waiting={queued} autostart={go} />
      <p style={{ fontSize: 17 }}>
        {summary.total} customers · <strong>{summary.sent}</strong> sent · <strong>{summary.delivered}</strong> delivered · <strong style={{ color: summary.failed ? "#b91c1c" : undefined }}>{summary.failed}</strong> not delivered · {summary.waiting} waiting
      </p>
      <p style={{ color: "#64748b", marginTop: -8 }}>&ldquo;Delivered&rdquo; and &ldquo;Not delivered&rdquo; come from WhatsApp a little later: reload this page in a few minutes.</p>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
        {rows.map(r => {
          const l = label(String(r.status), r.delivery ? String(r.delivery) : null, r.error_reason ? String(r.error_reason) : r.delivery_reason ? String(r.delivery_reason) : null);
          return (
            <div key={String(r.id)} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 14px", borderTop: "1px solid #f1f5f9" }}>
              <span>{String(r.full_name)} <span style={{ color: "#64748b" }}>{String(r.phone)}</span></span>
              <span style={{ color: l.color }}>{l.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Page(props: Props) {
  return <Suspense fallback={<p>Loading…</p>}><Content {...props} /></Suspense>;
}
