import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { todayInIndia } from "@/lib/reports/money";
import { loadCustomerBills, loadSupplierBills } from "@/lib/party-link";
import { maxSetoff, netSentence, totalDue } from "@/lib/setoff-math";
import { setOffAction } from "@/lib/party-actions";
import SubmitButton from "@/components/SubmitButton";

type Props = {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};
type Row = RowDataPacket & Record<string, string | number | null>;

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const plain = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };

async function Content({ params, searchParams }: Props) {
  const user = await requireAccess("both_sides");
  const businessId = user.legal_business_id;
  const supplierId = Number((await params).supplierId);
  const query = await searchParams;
  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) notFound();

  const [rows] = await db.execute<Row[]>(
    `SELECT s.supplier_name, c.id AS customer_id, c.full_name
       FROM acct_suppliers s
       JOIN acct_customers c ON c.legal_business_id = s.legal_business_id AND c.id = s.linked_customer_id
      WHERE s.legal_business_id = ? AND s.id = ? AND c.linked_supplier_id = s.id`,
    [businessId, supplierId]
  );
  const person = rows[0];
  if (!person) notFound();
  const customerId = Number(person.customer_id);

  const [sales, purchases] = await Promise.all([
    loadCustomerBills(db, businessId, customerId),
    loadSupplierBills(db, businessId, supplierId),
  ]);
  const theyOweUs = totalDue(sales);
  const weOweThem = totalDue(purchases);
  const most = maxSetoff(theyOweUs, weOweThem);

  const [past] = await db.execute<Row[]>(
    `SELECT setoff_no, DATE_FORMAT(setoff_date, '%Y-%m-%d') AS d, amount, note
       FROM acct_party_setoffs WHERE legal_business_id = ? AND supplier_id = ? ORDER BY id DESC LIMIT 20`,
    [businessId, supplierId]
  );

  const box2 = (title: string, bills: typeof sales, name: string) => (
    <section style={box}>
      <h2>{title}</h2>
      {bills.length === 0 ? <p>Nothing unpaid.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead><tr><th style={cell}>Use</th><th style={cell}>Bill</th><th style={cell}>Date</th><th style={right}>Unpaid</th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td style={cell}><input type="checkbox" name={name} value={String(b.id)} defaultChecked style={{ width: 22, height: 22 }} aria-label={`Use ${b.ref}`} /></td>
                  <td style={cell}>{b.ref}</td>
                  <td style={cell}>{pretty(b.date)}</td>
                  <td style={right}>{rupees(b.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <p><Link href="/accounting/both-sides">← Both sides</Link></p>
      <h1>{String(person.supplier_name)}</h1>
      <p style={{ fontSize: 18 }}>{netSentence(theyOweUs, weOweThem, rupees)}</p>
      {query.saved && <p style={{ color: "#166534", fontSize: 17 }}>Set-off {query.saved.slice(0, 40)} recorded. It joins the books when pending entries are posted.</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      {most <= 0n ? (
        <p style={box}>Nothing to set off: one side has nothing unpaid.</p>
      ) : (
        <form action={setOffAction}>
          <input type="hidden" name="supplier_id" value={String(supplierId)} />
          {box2("What they owe us (our invoices to them)", sales, "sale_id")}
          {box2("What we owe them (their bills to us)", purchases, "purchase_id")}
          <section style={box}>
            <h2>Cancel one against the other</h2>
            <p style={{ color: "#64748b" }}>
              No cash or bank is involved. The amount is taken off the oldest ticked bills on both sides.
              The most you can cancel with everything ticked is {rupees(most)}.
            </p>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}>
              <label>Amount (₹)<input name="amount" inputMode="decimal" defaultValue={plain(most)} required style={field} /></label>
              <label>Date<input type="date" name="setoff_date" defaultValue={todayInIndia()} required style={field} /></label>
              <label>Note (optional)<input name="note" maxLength={250} style={field} /></label>
              <SubmitButton label="Set off" question={`Cancel this amount on both sides for ${person.supplier_name}? It cannot be undone; mistakes are fixed with a correcting entry.`} />
            </div>
          </section>
        </form>
      )}

      {past.length > 0 && (
        <section style={box}>
          <h2>Earlier set-offs</h2>
          {past.map((o) => (
            <p key={String(o.setoff_no)} style={{ margin: "6px 0" }}>
              {String(o.setoff_no)} · {pretty(String(o.d))} · <strong>{rupees(BigInt(Math.round(Number(o.amount) * 100)))}</strong>{o.note ? ` · ${o.note}` : ""}
            </p>
          ))}
        </section>
      )}
    </main>
  );
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
