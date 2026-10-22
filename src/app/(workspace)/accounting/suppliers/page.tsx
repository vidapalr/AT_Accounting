
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { createSupplierAction } from "@/lib/supplier-actions";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

interface Supplier extends RowDataPacket {
  id: number;
  supplier_code: string;
  supplier_name: string;
  supplier_type: string;
  contact_person: string | null;
  mobile: string | null;
  whatsapp_number: string | null;
  city: string | null;
  state_name: string | null;
  gstin: string | null;
  payment_terms: string;
  credit_days: number;
  status: string;
}

const fieldStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 10,
  marginTop: 5,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
};

const sectionStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 20,
  marginTop: 20,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(225px, 1fr))",
  gap: 15,
};

const cellStyle: React.CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

const messages: Record<string, string> = {
  created: "Supplier created successfully.",
  duplicate: "This supplier code is already registered.",
  invalid: "Check supplier details, GSTIN and payment terms.",
  "business-not-found": "Legal business was not found.",
  failed: "Unable to save supplier. Check server logs.",
};

async function SupplierContent({ searchParams }: Props) {
  const user = await requireAccess("purchases");
  const query = await searchParams;

  const [suppliers] = await db.execute<Supplier[]>(
    `SELECT
       id,
       supplier_code,
       supplier_name,
       supplier_type,
       contact_person,
       mobile,
       whatsapp_number,
       city,
       state_name,
       gstin,
       payment_terms,
       credit_days,
       status
     FROM acct_suppliers
     WHERE legal_business_id = ?
     ORDER BY supplier_name, id`,
    [user.legal_business_id]
  );

  return (
    <main style={{
      maxWidth: 1450,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting/products">
        ← Product Master
      </Link>

      <h1>Abhiram Textiles — Supplier Master</h1>

      <p>
        Manage direct weavers, manufacturers, wholesalers
        and distributors who supply inventory.
      </p>

      {query.result && (
        <p role="status" style={sectionStyle}>
          {messages[query.result] ?? "Request processed."}
        </p>
      )}

      <section style={sectionStyle}>
        <h2>Add Supplier</h2>

        <form action={createSupplierAction} style={gridStyle}>
          <label>
            Supplier Code
            <input
              name="supplier_code"
              required
              maxLength={30}
              placeholder="SUP-0001"
              style={fieldStyle}
            />
          </label>

          <label>
            Supplier / Business Name
            <input
              name="supplier_name"
              required
              maxLength={180}
              placeholder="Supplier name"
              style={fieldStyle}
            />
          </label>

          <label>
            Supplier Type
            <select
              name="supplier_type"
              defaultValue="WHOLESALER"
              style={fieldStyle}
            >
              <option value="MANUFACTURER">Manufacturer</option>
              <option value="WHOLESALER">Wholesaler</option>
              <option value="WEAVER">Weaver</option>
              <option value="DISTRIBUTOR">Distributor</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label>
            Contact Person
            <input
              name="contact_person"
              maxLength={150}
              style={fieldStyle}
            />
          </label>

          <label>
            Mobile Number
            <input
              name="mobile"
              maxLength={20}
              inputMode="tel"
              style={fieldStyle}
            />
          </label>

          <label>
            WhatsApp Number
            <input
              name="whatsapp_number"
              maxLength={20}
              inputMode="tel"
              style={fieldStyle}
            />
          </label>

          <label>
            Email
            <input
              name="email"
              type="email"
              maxLength={190}
              style={fieldStyle}
            />
          </label>

          <label>
            City
            <input
              name="city"
              maxLength={100}
              placeholder="Pedana"
              style={fieldStyle}
            />
          </label>

          <label>
            State
            <input
              name="state_name"
              maxLength={100}
              placeholder="Andhra Pradesh"
              style={fieldStyle}
            />
          </label>

          <label>
            PIN Code
            <input
              name="postal_code"
              maxLength={12}
              style={fieldStyle}
            />
          </label>

          <label>
            GSTIN (Optional)
            <input
              name="gstin"
              maxLength={15}
              placeholder="15-character GSTIN"
              style={fieldStyle}
            />
          </label>

          <label>
            Payment Terms
            <select
              name="payment_terms"
              defaultValue="CASH"
              style={fieldStyle}
            >
              <option value="CASH">Cash / Immediate</option>
              <option value="ADVANCE">Advance</option>
              <option value="CREDIT">Credit</option>
            </select>
          </label>

          <label>
            Credit Days
            <input
              type="number"
              name="credit_days"
              min={0}
              max={65535}
              defaultValue={0}
              style={fieldStyle}
            />
            <small>
              Use 0 for Cash or Advance payments.
            </small>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Address
            <textarea
              name="address"
              maxLength={500}
              rows={2}
              style={fieldStyle}
            />
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea
              name="notes"
              maxLength={1000}
              rows={2}
              placeholder="Products supplied, special terms, etc."
              style={fieldStyle}
            />
          </label>

          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="submit"
              style={{ padding: "12px 20px" }}
            >
              Save Supplier
            </button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <h2>Registered Suppliers ({suppliers.length})</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
          }}>
            <thead>
              <tr>
                {[
                  "Code",
                  "Supplier",
                  "Type",
                  "Contact",
                  "Mobile",
                  "WhatsApp",
                  "Location",
                  "GSTIN",
                  "Payment Terms",
                  "Status",
                ].map((heading) => (
                  <th key={heading} style={cellStyle}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td style={cellStyle}>
                    {supplier.supplier_code}
                  </td>

                  <td style={cellStyle}>
                    <strong>{supplier.supplier_name}</strong>
                  </td>

                  <td style={cellStyle}>
                    {supplier.supplier_type}
                  </td>

                  <td style={cellStyle}>
                    {supplier.contact_person ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {supplier.mobile ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {supplier.whatsapp_number ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {[supplier.city, supplier.state_name]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>

                  <td style={cellStyle}>
                    {supplier.gstin ?? "—"}
                  </td>

                  <td style={cellStyle}>
                    {supplier.payment_terms}
                    {supplier.payment_terms === "CREDIT"
                      ? ` (${supplier.credit_days} days)`
                      : ""}
                  </td>

                  <td style={cellStyle}>
                    {supplier.status}
                  </td>
                </tr>
              ))}

              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={10} style={cellStyle}>
                    No suppliers registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function SuppliersPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading Supplier Master…
        </main>
      }
    >
      <SupplierContent {...props} />
    </Suspense>
  );
}
