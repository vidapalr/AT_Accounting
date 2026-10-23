import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { updateCustomerAction } from "@/lib/customer-actions";
import { prettyPhone } from "@/lib/customer-phone";
import { whatsappLink } from "@/lib/whatsapp/core";
import PrintHeader from "@/components/PrintHeader";
import PrintButton from "@/components/PrintButton";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
};

const inr = (paise: number) =>
  (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  created: { ok: true, text: "Customer saved." },
  updated: { ok: true, text: "Changes saved." },
  exists: { ok: true, text: "This mobile number already belongs to this customer." },
  invalid: { ok: false, text: "Please check the name, mobile number, GSTIN and credit limit." },
  "phone-used": { ok: false, text: "Another customer already has this mobile number." },
  failed: { ok: false, text: "Could not save. Please try again." },
};

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
};

const card: React.CSSProperties = {
  padding: "14px 18px",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  minWidth: 160,
};

async function CustomerPage({ params, searchParams }: Props) {
  const user = await requireAccess("customers");
  const { id } = await params;
  const { result } = await searchParams;
  const customerId = Number(id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) notFound();
  const businessId = user.legal_business_id;

  const [found] = await db.execute<RowDataPacket[]>(
    `SELECT id, customer_code, full_name, phone, customer_type, address, city, gstin,
            ROUND(credit_limit * 100) AS limit_paise, credit_limit, whatsapp_opt_in, notes
       FROM acct_customers WHERE legal_business_id = ? AND id = ?`,
    [businessId, customerId]
  );
  const c = found[0];
  if (!c) notFound();

  const [bills] = await db.execute<RowDataPacket[]>(
    `SELECT h.id, h.invoice_no, DATE_FORMAT(h.invoice_date, '%Y-%m-%d') AS invoice_date,
            ROUND(h.grand_total * 100) AS total_paise,
            COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
                       WHERE p.legal_business_id = h.legal_business_id
                         AND p.sale_id = h.id AND p.status = 'RECORDED'), 0) AS paid_paise
       FROM acct_sales_headers h
      WHERE h.legal_business_id = ? AND h.customer_id = ? AND h.status = 'POSTED'
      ORDER BY h.invoice_date DESC, h.id DESC
      LIMIT 300`,
    [businessId, customerId]
  );

  const list = bills.map(b => ({
    id: Number(b.id),
    invoice_no: String(b.invoice_no),
    date: String(b.invoice_date),
    total: Number(b.total_paise),
    paid: Number(b.paid_paise),
    due: Number(b.total_paise) - Number(b.paid_paise),
  }));
  const billed = list.reduce((s, b) => s + b.total, 0);
  const paid = list.reduce((s, b) => s + b.paid, 0);
  const dues = billed - paid;
  const average = list.length ? Math.round(billed / list.length) : 0;
  const isOwner = user.role === "GROUP_OWNER";

  const reminder =
    c.phone && dues > 0
      ? whatsappLink(
          `91${c.phone}`,
          `Hello ${c.full_name}, this is a gentle reminder from Abhiram Textiles. ₹${inr(dues)} is pending on your bills. Thank you!`
        )
      : null;

  const msg = result ? MESSAGES[result] : undefined;

  return (
    <div style={{ maxWidth: 1100 }}>
      <PrintHeader title={`Customer statement: ${c.full_name}`} />
      <nav className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, justifyContent: "space-between" }}>
        <Link href="/accounting/customers">← All customers</Link>
        <PrintButton label="Print statement" />
      </nav>

      <h1 style={{ marginBottom: 4 }}>{c.full_name}</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        {c.customer_code} · {c.phone ? prettyPhone(c.phone) : "No mobile number yet"}
        {c.customer_type === "WHOLESALE" ? " · Wholesale" : ""}
        {c.city ? ` · ${c.city}` : ""}
      </p>

      {msg && (
        <p role="status" className="no-print" style={{ color: msg.ok ? "#166534" : "#b91c1c" }}>{msg.text}</p>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "16px 0" }}>
        <div style={card}><small>Visits (bills)</small><br /><strong style={{ fontSize: 22 }}>{list.length}</strong></div>
        <div style={card}><small>Total bought</small><br /><strong style={{ fontSize: 22 }}>₹{inr(billed)}</strong></div>
        <div style={card}><small>Average bill</small><br /><strong style={{ fontSize: 22 }}>₹{inr(average)}</strong></div>
        <div style={{ ...card, borderColor: dues > 0 ? "#fcd34d" : "#bbf7d0" }}>
          <small>Owes you</small><br />
          <strong style={{ fontSize: 22, color: dues > 0 ? "#b45309" : "#166534" }}>{dues > 0 ? `₹${inr(dues)}` : "Nothing"}</strong>
        </div>
        {Number(c.limit_paise) > 0 && (
          <div style={card}><small>Credit limit</small><br /><strong style={{ fontSize: 22 }}>₹{inr(Number(c.limit_paise))}</strong></div>
        )}
      </div>

      <div className="no-print" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <Link className="btn-link btn-link-primary" href="/accounting/sales">New sale</Link>
        {reminder && (
          <a className="btn-link" href={reminder} target="_blank" rel="noreferrer">
            Send dues reminder on WhatsApp
          </a>
        )}
      </div>
      {reminder && (
        <p className="no-print" style={{ color: "#64748b", marginTop: 4 }}>
          Opens WhatsApp with the message ready; you tap send.
          {c.whatsapp_opt_in ? "" : " This customer has not been marked as agreeing to WhatsApp messages."}
        </p>
      )}

      <h2>Bills and payments</h2>
      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
          <thead>
            <tr>{["Date", "Invoice", "Bill", "Paid", "Still due", ""].map(h => <th key={h} style={cell}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td style={cell} colSpan={6}>No bills yet.</td></tr>}
            {list.map(b => (
              <tr key={b.id}>
                <td style={cell}>{b.date}</td>
                <td style={cell}>{b.invoice_no}</td>
                <td style={cell}>₹{inr(b.total)}</td>
                <td style={cell}>₹{inr(b.paid)}</td>
                <td style={{ ...cell, color: b.due > 0 ? "#b45309" : "#166534", fontWeight: 600 }}>
                  {b.due > 0 ? `₹${inr(b.due)}` : "Paid"}
                </td>
                <td style={cell} className="no-print">
                  <Link className={`btn-link btn-link-small${b.due > 0 ? " btn-link-primary" : ""}`} href={`/accounting/sales/${b.id}`}>
                    {b.due > 0 ? "Take payment" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {list.length > 0 && (
            <tfoot>
              <tr>
                <td style={cell} colSpan={2}><strong>Total</strong></td>
                <td style={cell}><strong>₹{inr(billed)}</strong></td>
                <td style={cell}><strong>₹{inr(paid)}</strong></td>
                <td style={cell}><strong>₹{inr(dues)}</strong></td>
                <td style={cell} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <section className="no-print" style={{ marginTop: 28, padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>Customer details</h2>
        <form
          action={updateCustomerAction}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}
        >
          <input type="hidden" name="customer_id" value={c.id} />
          <label>Name<input name="full_name" required defaultValue={c.full_name} maxLength={150} style={{ width: "100%" }} /></label>
          <label>
            Mobile number
            <input name="phone" defaultValue={c.phone ?? ""} inputMode="numeric" maxLength={20} placeholder="10 digits" style={{ width: "100%" }} />
          </label>
          <label>
            Type
            <select name="customer_type" defaultValue={c.customer_type} style={{ width: "100%" }}>
              <option value="RETAIL">Retail</option>
              <option value="WHOLESALE">Wholesale</option>
            </select>
          </label>
          <label>City<input name="city" defaultValue={c.city ?? ""} maxLength={100} style={{ width: "100%" }} /></label>
          <label>Address<input name="address" defaultValue={c.address ?? ""} maxLength={300} style={{ width: "100%" }} /></label>
          <label>
            GSTIN (only for wholesale, optional)
            <input name="gstin" defaultValue={c.gstin ?? ""} maxLength={15} style={{ width: "100%" }} />
          </label>
          <label>
            Credit limit ₹ (0 = no limit){!isOwner && " — owner only"}
            <input
              name="credit_limit"
              defaultValue={String(Number(c.credit_limit))}
              readOnly={!isOwner}
              inputMode="decimal"
              style={{ width: "100%", background: isOwner ? undefined : "#f1f5f9" }}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="whatsapp_opt_in" value="yes" defaultChecked={Boolean(c.whatsapp_opt_in)} />
            Agreed to receive WhatsApp messages
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Notes<input name="notes" defaultValue={c.notes ?? ""} maxLength={500} style={{ width: "100%" }} />
          </label>
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", justifyContent: "center", maxWidth: 260 }}>
            Save changes
          </button>
        </form>
      </section>
    </div>
  );
}

export default function CustomerDetailPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading customer…</p>}>
      <CustomerPage {...props} />
    </Suspense>
  );
}
