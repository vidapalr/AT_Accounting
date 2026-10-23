import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import ShareComposer from "@/components/ShareComposer";

type Props = { searchParams: Promise<{ events?: string }> };

async function Share({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const divisionId = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;
  const { events } = await searchParams;

  const wanted = (events ?? "")
    .split(",")
    .map(Number)
    .filter(n => Number.isSafeInteger(n) && n > 0)
    .slice(0, 200);

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT e.id, p.product_name, p.fabric, v.size_label, v.color_name, v.sku
       FROM acct_stock_events e
       JOIN acct_products p ON p.legal_business_id = e.legal_business_id AND p.id = e.product_id
       JOIN acct_product_variants v ON v.legal_business_id = e.legal_business_id AND v.id = e.variant_id
      WHERE e.legal_business_id = ? AND e.division_id = ?
        AND ${wanted.length > 0 ? "e.id IN (?)" : "e.status = 'NEW'"}
      ORDER BY e.id`,
    wanted.length > 0 ? [businessId, divisionId, wanted] : [businessId, divisionId]
  );

  const names = [...new Set(rows.map(r => String(r.product_name)))];
  const defaultText =
    names.length === 0
      ? "New stock has arrived at Abhiram Textiles. Visit us or message us to order."
      : [
          "New stock has arrived at Abhiram Textiles:",
          ...names.map(n => `• ${n}`),
          "Visit us or message us to order.",
        ].join("\n");

  const ids = rows.map(r => Number(r.id));
  const batchKey = ids.length
    ? `NS:${Math.min(...ids)}-${Math.max(...ids)}:${ids.length}`
    : "NS:general";

  const [custRows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.full_name, c.phone,
            DATE_FORMAT((SELECT MAX(h.invoice_date) FROM acct_sales_headers h
                          WHERE h.legal_business_id = c.legal_business_id
                            AND h.customer_id = c.id AND h.status = 'POSTED'), '%Y-%m-%d') AS last_visit,
            EXISTS (SELECT 1 FROM acct_customer_messages m
                     WHERE m.legal_business_id = c.legal_business_id
                       AND m.customer_id = c.id AND m.batch_key = ?) AS already_sent
       FROM acct_customers c
      WHERE c.legal_business_id = ? AND c.status = 'ACTIVE'
        AND c.phone IS NOT NULL AND c.whatsapp_opt_in = 1
      ORDER BY last_visit IS NULL, last_visit DESC, c.id DESC
      LIMIT 500`,
    [batchKey, businessId]
  );

  const [totalRows] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, SUM(whatsapp_opt_in = 1) AS opted
       FROM acct_customers
      WHERE legal_business_id = ? AND status = 'ACTIVE' AND phone IS NOT NULL`,
    [businessId]
  );

  const totals = totalRows[0];

  const people = custRows.map(c => ({
    id: Number(c.id),
    name: String(c.full_name),
    phone: String(c.phone),
    lastVisit: c.last_visit ? String(c.last_visit) : null,
    sent: Boolean(Number(c.already_sent)),
  }));

  return (
    <div style={{ maxWidth: 900 }}>
      <nav className="no-print" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <Link href="/accounting/catalogue/new-stock">← New stock arrivals</Link>
      </nav>
      <h1>Tell customers about new stock</h1>
      <p style={{ color: "#475569" }}>
        WhatsApp opens for each customer with the message ready, and you tap send. This is free and keeps
        you within WhatsApp&apos;s rules: only customers who agreed to messages are listed.
      </p>

      {people.length === 0 ? (
        <p style={{ padding: 16, background: "#fffbeb", borderRadius: 10 }}>
          No customers have agreed to WhatsApp messages yet
          {totals ? ` (${Number(totals.total)} customers with a mobile number, ${Number(totals.opted ?? 0)} agreed)` : ""}.
          Tick &ldquo;Agreed to receive WhatsApp messages&rdquo; on a customer&apos;s page after they say yes.{" "}
          <Link href="/accounting/customers">Open customers</Link>
        </p>
      ) : (
        <ShareComposer customers={people} defaultText={defaultText} batchKey={batchKey} />
      )}
    </div>
  );
}

export default function SharePage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Share {...props} />
    </Suspense>
  );
}
