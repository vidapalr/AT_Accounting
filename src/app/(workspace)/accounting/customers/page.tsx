import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { createCustomerAction } from "@/lib/customer-actions";
import { prettyPhone } from "@/lib/customer-phone";

type Props = {
  searchParams: Promise<{ q?: string; view?: string; result?: string }>;
};

const inr = (paise: number | string) =>
  (Number(paise) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const MESSAGES: Record<string, string> = {
  invalid: "Please check the name and the 10 digit mobile number.",
  failed: "Could not save the customer. Please try again.",
};

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

const card: React.CSSProperties = {
  padding: "14px 18px",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  minWidth: 170,
};

async function CustomerList({ searchParams }: Props) {
  const user = await requireAccess("customers");
  const { q = "", view = "all", result } = await searchParams;
  const businessId = user.legal_business_id;
  const search = q.trim().slice(0, 60);
  const like = `%${search.replace(/[%_\\]/g, "")}%`;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.customer_code, c.full_name, c.phone, c.customer_type, c.city,
            ROUND(c.credit_limit * 100) AS limit_paise,
            COUNT(h.id) AS visits,
            COALESCE(SUM(ROUND(h.grand_total * 100)), 0) AS billed_paise,
            COALESCE(SUM((SELECT COALESCE(SUM(ROUND(p.amount * 100)), 0)
                            FROM acct_sales_payments p
                           WHERE p.legal_business_id = h.legal_business_id
                             AND p.sale_id = h.id AND p.status = 'RECORDED')), 0) AS paid_paise,
            DATE_FORMAT(MAX(h.invoice_date), '%Y-%m-%d') AS last_visit
       FROM acct_customers c
       LEFT JOIN acct_sales_headers h
         ON h.legal_business_id = c.legal_business_id
        AND h.customer_id = c.id AND h.status = 'POSTED'
      WHERE c.legal_business_id = ? AND c.status = 'ACTIVE'
        AND (? = '%%' OR c.full_name LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)
      GROUP BY c.id
      ORDER BY MAX(h.invoice_date) IS NULL, MAX(h.invoice_date) DESC, c.id DESC
      LIMIT 500`,
    [businessId, like, like, like, like]
  );

  const customers = rows.map(r => ({
    id: Number(r.id),
    customer_code: String(r.customer_code),
    full_name: String(r.full_name),
    phone: r.phone ? String(r.phone) : null,
    customer_type: String(r.customer_type),
    city: r.city ? String(r.city) : null,
    visits: Number(r.visits),
    billed_paise: Number(r.billed_paise),
    last_visit: r.last_visit ? String(r.last_visit) : null,
    dues: Number(r.billed_paise) - Number(r.paid_paise),
  }));
  const shown = view === "dues" ? customers.filter(c => c.dues > 0) : customers;
  const owing = customers.filter(c => c.dues > 0);
  const totalDues = owing.reduce((s, c) => s + c.dues, 0);
  const repeat = customers.filter(c => Number(c.visits) >= 2).length;
  const needPhone = customers.filter(c => !c.phone).length;

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1>Customers</h1>
      <p style={{ color: "#475569" }}>
        Everyone who buys from you, found by mobile number. A new customer is
        also saved automatically when you bill a new number.
      </p>

      {result && MESSAGES[result] && (
        <p role="status" style={{ color: "#b91c1c" }}>{MESSAGES[result]}</p>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "16px 0" }}>
        <div style={card}><small>Customers</small><br /><strong style={{ fontSize: 22 }}>{customers.length}</strong></div>
        <div style={card}><small>Buy again and again (2+ bills)</small><br /><strong style={{ fontSize: 22 }}>{repeat}</strong></div>
        <div style={card}>
          <small>Customers who owe money</small><br />
          <strong style={{ fontSize: 22 }}>{owing.length}</strong>
        </div>
        <div style={card}><small>Total owed to you</small><br /><strong style={{ fontSize: 22 }}>₹{inr(totalDues)}</strong></div>
      </div>

      {needPhone > 0 && (
        <p style={{ padding: "8px 12px", background: "#fffbeb", borderRadius: 8 }}>
          {needPhone} customer(s) came from old bills without a mobile number. Open them and add the number so
          they are not saved twice.
        </p>
      )}

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "16px 0" }}>
        <input
          name="q"
          defaultValue={search}
          placeholder="Search by name or mobile"
          style={{ padding: 10, minWidth: 240, border: "1px solid #cbd5e1", borderRadius: 8 }}
        />
        <select name="view" defaultValue={view} style={{ padding: 10, borderRadius: 8 }}>
          <option value="all">All customers</option>
          <option value="dues">Only customers who owe money</option>
        </select>
        <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer" }}>Search</button>
      </form>

      <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              {["Customer", "Mobile", "Bills", "Total bought", "Owes", "Last visit", ""].map(h => (
                <th key={h} style={cell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td style={cell} colSpan={7}>No customers found.</td></tr>
            )}
            {shown.map(c => (
              <tr key={c.id}>
                <td style={cell}>
                  <strong>{c.full_name}</strong>
                  <br />
                  <small style={{ color: "#64748b" }}>
                    {c.customer_code}{c.customer_type === "WHOLESALE" ? " · Wholesale" : ""}{c.city ? ` · ${c.city}` : ""}
                  </small>
                </td>
                <td style={cell}>{c.phone ? prettyPhone(c.phone) : <em style={{ color: "#b45309" }}>Add number</em>}</td>
                <td style={cell}>{Number(c.visits)}</td>
                <td style={cell}>₹{inr(c.billed_paise)}</td>
                <td style={{ ...cell, color: c.dues > 0 ? "#b45309" : "#166534", fontWeight: 600 }}>
                  {c.dues > 0 ? `₹${inr(c.dues)}` : "Nothing"}
                </td>
                <td style={cell}>{c.last_visit ?? "—"}</td>
                <td style={cell}>
                  <Link className="btn-link btn-link-small" href={`/accounting/customers/${c.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={{ marginTop: 28, padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>Add a customer</h2>
        <form
          action={createCustomerAction}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, alignItems: "end" }}
        >
          <label>Name<input name="full_name" required maxLength={150} style={{ width: "100%" }} /></label>
          <label>
            Mobile number
            <input name="phone" required inputMode="numeric" maxLength={20} placeholder="10 digits" style={{ width: "100%" }} />
          </label>
          <label>
            Type
            <select name="customer_type" defaultValue="RETAIL" style={{ width: "100%" }}>
              <option value="RETAIL">Retail</option>
              <option value="WHOLESALE">Wholesale</option>
            </select>
          </label>
          <label>City (optional)<input name="city" maxLength={100} style={{ width: "100%" }} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" name="whatsapp_opt_in" value="yes" />
            Agreed to receive WhatsApp messages
          </label>
          <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", justifyContent: "center" }}>
            Save customer
          </button>
        </form>
        <p style={{ color: "#64748b", marginBottom: 0 }}>
          Address and credit limit can be added on the customer&apos;s own page.
        </p>
      </section>
    </div>
  );
}

export default function CustomersPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading customers…</p>}>
      <CustomerList {...props} />
    </Suspense>
  );
}
