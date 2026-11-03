import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { last10, mergeTimeline, type TimelineEvent, type TimelineKind } from "@/lib/customer-timeline";

type Q = Pool | PoolConnection;
const inr = (p: unknown) => `₹${(Number(p) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Everything that has happened with this customer in one list. Each source is read on its own, so a missing table only hides that source. */
export async function loadCustomerTimeline(q: Q, businessId: number, customerId: number, phone: string | null): Promise<TimelineEvent[]> {
  const out: TimelineEvent[] = [];
  const add = async (sql: string, params: unknown[], map: (r: RowDataPacket) => TimelineEvent) => {
    try {
      const [rows] = await q.execute<RowDataPacket[]>(sql, params as never[]);
      for (const r of rows) out.push(map(r));
    } catch { /* that source is not set up yet */ }
  };
  const ev = (kind: TimelineKind, at: unknown, title: string, detail: string, href?: string): TimelineEvent =>
    ({ kind, at: String(at), title, detail, href });
  const ten = last10(phone);

  await add(`SELECT id, invoice_no, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS d, ROUND(grand_total * 100) AS t
               FROM acct_sales_headers WHERE legal_business_id = ? AND customer_id = ? AND status = 'POSTED' AND is_estimate = 0
              ORDER BY invoice_date DESC, id DESC LIMIT 100`, [businessId, customerId],
    (r) => ev("BILL", r.d, `Bill ${r.invoice_no}`, inr(r.t), `/accounting/sales/${r.id}`));

  await add(`SELECT p.sale_id, p.payment_method, ROUND(p.amount * 100) AS a, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, h.invoice_no
               FROM acct_sales_payments p JOIN acct_sales_headers h ON h.id = p.sale_id AND h.legal_business_id = p.legal_business_id
              WHERE p.legal_business_id = ? AND h.customer_id = ? AND p.status = 'RECORDED' AND h.status = 'POSTED'
              ORDER BY p.payment_date DESC, p.id DESC LIMIT 100`, [businessId, customerId],
    (r) => ev("PAYMENT", r.d, `Paid ${inr(r.a)}`, `${String(r.payment_method).replace(/_/g, " ").toLowerCase()} on bill ${r.invoice_no}`, `/accounting/sales/${r.sale_id}`));

  await add(`SELECT r.return_no, ROUND(r.refund_value * 100) AS v, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS d, h.invoice_no, h.id AS sid
               FROM acct_sales_returns r JOIN acct_sales_headers h ON h.id = r.sale_id AND h.legal_business_id = r.legal_business_id
              WHERE r.legal_business_id = ? AND h.customer_id = ? AND r.status = 'POSTED'
              ORDER BY r.return_date DESC LIMIT 50`, [businessId, customerId],
    (r) => ev("RETURN", r.d, `Return ${r.return_no}`, `${inr(r.v)} back on bill ${r.invoice_no}`, `/accounting/sales/${r.sid}`));

  if (ten) {
    await add(`SELECT order_no, status, ROUND((items_total + shipping_charge) * 100) AS t, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS at
                 FROM acct_online_orders WHERE legal_business_id = ? AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?
                ORDER BY id DESC LIMIT 30`, [businessId, ten],
      (r) => ev("ONLINE_ORDER", r.at, `Website order ${r.order_no}`, `${inr(r.t)} · ${String(r.status).toLowerCase()}`, "/accounting/online-orders"));

    await add(`SELECT m.direction, m.body, DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i:%s') AS at
                 FROM acct_bot_messages m JOIN acct_bot_conversations c ON c.id = m.conversation_id
                WHERE m.legal_business_id = ? AND RIGHT(c.wa_number, 10) = ?
                ORDER BY m.id DESC LIMIT 15`, [businessId, ten],
      (r) => ev("CHAT", r.at, String(r.direction).toUpperCase().startsWith("IN") ? "They wrote" : "We replied", String(r.body ?? "").slice(0, 140), "/accounting/chatbot"));
  }

  await add(`SELECT handout_no, DATE_FORMAT(handed_date, '%Y-%m-%d') AS d, expected_back FROM acct_approval_handouts
              WHERE legal_business_id = ? AND customer_id = ? ORDER BY id DESC LIMIT 20`, [businessId, customerId],
    (r) => ev("APPROVAL", r.d, `Items taken on approval ${r.handout_no}`, "", "/accounting/approval-items"));

  await add(`SELECT message_type, DATE_FORMAT(sent_at, '%Y-%m-%d %H:%i:%s') AS at FROM acct_customer_messages
              WHERE legal_business_id = ? AND customer_id = ? ORDER BY id DESC LIMIT 20`, [businessId, customerId],
    (r) => ev("MESSAGE", r.at, "WhatsApp message sent", String(r.message_type).replace(/_/g, " ").toLowerCase()));

  await add(`SELECT n.note, DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i:%s') AS at, u.full_name FROM acct_customer_notes n
               LEFT JOIN acct_app_users u ON u.id = n.created_by
              WHERE n.legal_business_id = ? AND n.customer_id = ? ORDER BY n.id DESC LIMIT 50`, [businessId, customerId],
    (r) => ev("NOTE", r.at, String(r.note), r.full_name ? `by ${r.full_name}` : ""));

  return mergeTimeline(out);
}
