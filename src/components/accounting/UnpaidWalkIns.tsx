import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

/**
 * Bills with money still unpaid but no customer attached (no mobile number was
 * entered). They cannot appear in a customer's dues, so they are listed here.
 */
export default async function UnpaidWalkIns({ businessId }: { businessId: number }) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT s.id, s.invoice_no, DATE_FORMAT(s.invoice_date, '%d %b %Y') AS d, s.customer_name,
            ROUND(s.grand_total * 100) - COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
               WHERE p.legal_business_id = s.legal_business_id AND p.sale_id = s.id AND p.status = 'RECORDED'), 0) AS due_paise
       FROM acct_sales_headers s
      WHERE s.legal_business_id = ? AND s.status = 'POSTED' AND s.customer_id IS NULL
      HAVING due_paise > 0
      ORDER BY s.invoice_date, s.id`,
    [businessId]
  );
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + BigInt(r.due_paise), 0n);
  const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;

  return (
    <section style={{ padding: "12px 14px", background: "#fffbeb", borderRadius: 8, margin: "16px 0" }}>
      <strong>
        {rows.length} unpaid bill{rows.length === 1 ? "" : "s"} ({rupees(total)}) {rows.length === 1 ? "has" : "have"} no customer, so
        {rows.length === 1 ? " it is" : " they are"} not in the list below.
      </strong>
      <div style={{ color: "#64748b", margin: "4px 0 8px" }}>
        Open the bill and add the customer&apos;s mobile number. Then it shows here and can be reminded.
      </div>
      {rows.map((r) => (
        <div key={String(r.id)} style={{ padding: "4px 0" }}>
          <Link href={`/accounting/sales/${r.id}`}>{String(r.invoice_no)}</Link> · {String(r.d)}
          {r.customer_name ? ` · ${r.customer_name}` : " · Walk-in"} · owes {rupees(BigInt(r.due_paise))}
        </div>
      ))}
    </section>
  );
}
