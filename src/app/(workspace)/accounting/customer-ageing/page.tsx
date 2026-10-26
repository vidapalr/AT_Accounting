import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { loadLinkedPeople } from "@/lib/party-link";
import { todayInIndia } from "@/lib/reports/money";
import { normalizePhone } from "@/lib/customer-phone";
import UnpaidWalkIns from "@/components/accounting/UnpaidWalkIns";
import { ageDues } from "@/lib/supplier-statement";

type Row = RowDataPacket & Record<string, string | number | null>;
type Props = { searchParams: Promise<{ min?: string }> };

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };

async function AgeingContent({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const businessId = user.legal_business_id;
  const { min } = await searchParams;
  const minDays = [0, 30, 60, 90].includes(Number(min)) ? Number(min) : 0;
  const today = todayInIndia();

  const [sales] = await db.execute<Row[]>(
    `SELECT s.id, s.customer_id, s.invoice_no, DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS d,
            ROUND(s.grand_total * 100) AS total_paise,
            COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
                       WHERE p.legal_business_id = s.legal_business_id AND p.sale_id = s.id
                         AND p.status = 'RECORDED'), 0) AS paid_paise
       FROM acct_sales_headers s
      WHERE s.legal_business_id = ? AND s.status = 'POSTED' AND s.customer_id IS NOT NULL`,
    [businessId]
  );
  const [customers] = await db.execute<Row[]>(
    `SELECT id, full_name, phone FROM acct_customers WHERE legal_business_id = ?`,
    [businessId]
  );
  const byId = new Map(customers.map((c) => [Number(c.id), c]));

  // People who are also our suppliers: show what we owe them next to what they owe us.
  const alsoSupplier = new Map(
    (canAccess(user.role, "both_sides") ? await loadLinkedPeople(db, businessId) : []).map((p) => [p.customerId, p])
  );

  const grouped = new Map<number, { bills: { date: string; amount: bigint }[]; paid: bigint }>();
  for (const s of sales) {
    const g = grouped.get(Number(s.customer_id)) ?? { bills: [], paid: 0n };
    g.bills.push({ date: String(s.d), amount: BigInt(s.total_paise) });
    g.paid += BigInt(s.paid_paise);
    grouped.set(Number(s.customer_id), g);
  }

  const list = [...grouped]
    .map(([id, g]) => {
      const ageing = ageDues(g.bills, g.paid, today);
      // Oldest bill that still has something unpaid.
      let credit = g.paid;
      let oldest: string | null = null;
      for (const b of [...g.bills].sort((a, c) => a.date.localeCompare(c.date))) {
        const used = credit >= b.amount ? b.amount : credit;
        credit -= used;
        if (b.amount - used > 0n) { oldest = b.date; break; }
      }
      return { id, c: byId.get(id), ageing, oldest, days: oldest ? dayNumber(today) - dayNumber(oldest) : 0 };
    })
    .filter((x) => x.c && x.ageing.totalDue > 0n && x.days >= minDays)
    .sort((a, b) => b.days - a.days || Number(b.ageing.totalDue - a.ageing.totalDue));

  const sum = (pick: (a: (typeof list)[number]["ageing"]) => bigint) => list.reduce((s, x) => s + pick(x.ageing), 0n);

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Who owes us, and for how long</h1>
      <p style={{ color: "#64748b" }}>
        As on {prettyDate(today)}. Payments are counted against the oldest bill first.
        Tap &ldquo;Remind&rdquo; to send a friendly WhatsApp message.
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        {[[0, "All"], [30, "Over 30 days"], [60, "Over 60 days"], [90, "Over 90 days"]].map(([d, label]) => (
          <Link key={String(d)} className={`btn-link${minDays === d ? " btn-link-primary" : ""}`} href={`/accounting/customer-ageing?min=${d}`}>
            {label}
          </Link>
        ))}
      </div>

      <UnpaidWalkIns businessId={businessId} />

      <section style={box}>
        <h2>Total unpaid: {rupees(sum((a) => a.totalDue))}</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 480 }}>
            <thead><tr>{["Up to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days"].map((h) => <th key={h} style={right}>{h}</th>)}</tr></thead>
            <tbody><tr>
              <td style={right}>{rupees(sum((a) => a.upTo30))}</td>
              <td style={right}>{rupees(sum((a) => a.from31to60))}</td>
              <td style={right}>{rupees(sum((a) => a.from61to90))}</td>
              <td style={right}>{rupees(sum((a) => a.over90))}</td>
            </tr></tbody>
          </table>
        </div>
      </section>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              <th style={cell}>Customer</th><th style={right}>Unpaid</th><th style={right}>Oldest bill</th>
              <th style={right}>Days</th><th style={cell}>Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const phone = normalizePhone(String(x.c!.phone ?? ""));
              const message =
                `Hello ${x.c!.full_name}, this is Abhiram Textiles. A small reminder: ${rupees(x.ageing.totalDue)} ` +
                `is pending on your account` + (x.oldest ? ` (oldest bill dated ${prettyDate(x.oldest)})` : "") +
                `. Please pay when convenient. Thank you!`;
              return (
                <tr key={x.id}>
                  <td style={cell}>
                    <Link href={`/accounting/customers/${x.id}`}>{String(x.c!.full_name)}</Link>
                    {alsoSupplier.get(x.id) && (
                      <div style={{ color: "#1d4ed8", fontSize: 13 }}>
                        Also a supplier: we owe them {rupees(alsoSupplier.get(x.id)!.weOweThem)}{" "}
                        <Link href={`/accounting/both-sides/${alsoSupplier.get(x.id)!.supplierId}`}>Set off</Link>
                      </div>
                    )}
                    {phone ? <div style={{ color: "#64748b", fontSize: 13 }}>{phone}</div> : <div style={{ color: "#b45309", fontSize: 13 }}>No mobile number</div>}
                  </td>
                  <td style={right}><strong>{rupees(x.ageing.totalDue)}</strong></td>
                  <td style={right}>{x.oldest ? prettyDate(x.oldest) : "—"}</td>
                  <td style={{ ...right, color: x.days > 60 ? "#b91c1c" : x.days > 30 ? "#b45309" : undefined }}>{x.days}</td>
                  <td style={cell}>
                    {phone && (
                      <a className="btn-link btn-link-primary" target="_blank" rel="noreferrer"
                        href={`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`}>Remind</a>
                    )}{" "}
                    <Link className="btn-link" href={`/accounting/customers/${x.id}`}>Open</Link>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td style={cell} colSpan={5}>Nobody owes anything{minDays ? ` for more than ${minDays} days` : ""}.</td></tr>}
          </tbody>
        </table>
      </div>

      <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
        <Link className="btn-link" href="/accounting/customers">All customers</Link>
        <Link className="btn-link" href="/accounting/invoices">Invoices</Link>
      </nav>
    </main>
  );
}

export default function CustomerAgeingPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <AgeingContent {...props} />
    </Suspense>
  );
}
