import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone, prettyPhone } from "@/lib/customer-phone";
import { loadLinkedPeople } from "@/lib/party-link";
import { maxSetoff } from "@/lib/setoff-math";
import {
  addCustomerAsSupplierAction,
  addSupplierAsCustomerAction,
  linkPartiesAction,
  unlinkPartiesAction,
} from "@/lib/party-actions";
import SubmitButton from "@/components/SubmitButton";
import ConfirmButton from "@/components/ConfirmButton";

type Props = { searchParams: Promise<{ saved?: string; error?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left", verticalAlign: "top" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0, width: "100%" };

const SAVED: Record<string, string> = {
  linked: "Linked. Both records stay as they were.",
  "added-customer": "Added as a customer and linked.",
  "added-supplier": "Added as a supplier and linked.",
  unlinked: "Link removed. Nothing else changed.",
};

async function BothSidesContent({ searchParams }: Props) {
  const user = await requireAccess("both_sides");
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const people = await loadLinkedPeople(db, businessId);
  const [suppliers] = await db.execute<Row[]>(
    `SELECT id, supplier_name, mobile, whatsapp_number FROM acct_suppliers
      WHERE legal_business_id = ? AND linked_customer_id IS NULL ORDER BY supplier_name`,
    [businessId]
  );
  const [customers] = await db.execute<Row[]>(
    `SELECT id, full_name, phone FROM acct_customers
      WHERE legal_business_id = ? AND linked_supplier_id IS NULL ORDER BY full_name`,
    [businessId]
  );

  // Same mobile number on a supplier and a customer: probably the same person.
  const byPhone = new Map(customers.filter((c) => c.phone).map((c) => [String(c.phone), c]));
  const suggestions = suppliers.flatMap((s) => {
    const phone = normalizePhone(String(s.mobile ?? "")) ?? normalizePhone(String(s.whatsapp_number ?? ""));
    const c = phone ? byPhone.get(phone) : undefined;
    return c ? [{ s, c, phone: phone as string }] : [];
  });

  const saved = query.saved ? (SAVED[query.saved] ?? (query.saved.startsWith("SO-") ? `Set-off ${query.saved} recorded.` : null)) : null;

  return (
    <main style={{ padding: 16, maxWidth: 900 }}>
      <h1>Both sides</h1>
      <p style={{ color: "#64748b" }}>
        Some people sell to us and buy from us. Link their supplier and customer records, see both amounts together,
        and cancel the smaller amount against the larger one. No old bill or payment is changed.
      </p>
      {saved && <p style={{ color: "#166534", fontSize: 17 }}>{saved}</p>}
      {query.error && <p style={{ color: "#b91c1c", fontSize: 17 }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <h2>People who are both</h2>
        {people.length === 0 ? (
          <p>No one is linked yet. Link a supplier and a customer below.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr><th style={cell}>Person</th><th style={right}>They owe us</th><th style={right}>We owe them</th><th style={right}>Net</th><th style={cell}></th></tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const net = p.theyOweUs - p.weOweThem;
                  const can = maxSetoff(p.theyOweUs, p.weOweThem) > 0n;
                  return (
                    <tr key={p.supplierId}>
                      <td style={cell}>
                        <strong>{p.supplierName}</strong>
                        {p.customerName !== p.supplierName && <><br /><span style={{ color: "#64748b", fontSize: 14 }}>customer: {p.customerName}</span></>}
                      </td>
                      <td style={right}>{rupees(p.theyOweUs)}</td>
                      <td style={right}>{rupees(p.weOweThem)}</td>
                      <td style={right}>{net === 0n ? "Even" : net > 0n ? `They owe ${rupees(net)}` : `We owe ${rupees(-net)}`}</td>
                      <td style={cell}>
                        <div style={{ display: "grid", gap: 6 }}>
                          <Link className="btn-link btn-link-primary" href={`/accounting/both-sides/${p.supplierId}`}>
                            {can ? "Set off" : "Open"}
                          </Link>
                          <form action={unlinkPartiesAction}>
                            <input type="hidden" name="supplier_id" value={String(p.supplierId)} />
                            <ConfirmButton label="Remove link" question="Remove the link? Bills, payments and past set-offs stay as they are." />
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {suggestions.length > 0 && (
        <section style={box}>
          <h2>Looks like the same person</h2>
          <p style={{ color: "#64748b" }}>The mobile number matches.</p>
          {suggestions.map(({ s, c, phone }) => (
            <form key={String(s.id)} action={linkPartiesAction} style={{ ...cell, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
              <input type="hidden" name="supplier_id" value={String(s.id)} />
              <input type="hidden" name="customer_id" value={String(c.id)} />
              <span>
                Supplier <strong>{s.supplier_name}</strong> and customer <strong>{c.full_name}</strong>
                <br /><span style={{ color: "#64748b", fontSize: 14 }}>{prettyPhone(phone)}</span>
              </span>
              <SubmitButton label="Yes, same person" />
            </form>
          ))}
        </section>
      )}

      <section style={box}>
        <h2>Link a supplier and a customer</h2>
        <form action={linkPartiesAction} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
          <label>Supplier
            <select name="supplier_id" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {suppliers.map((s) => <option key={String(s.id)} value={String(s.id)}>{s.supplier_name}</option>)}
            </select>
          </label>
          <label>Customer
            <select name="customer_id" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {customers.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.full_name}{c.phone ? ` (${prettyPhone(String(c.phone))})` : ""}</option>)}
            </select>
          </label>
          <SubmitButton label="Link them" />
        </form>
      </section>

      <section style={box}>
        <h2>Not in the other list yet?</h2>
        <form action={addSupplierAsCustomerAction} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end", marginBottom: 14 }}>
          <label>This supplier also buys from us
            <select name="supplier_id" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {suppliers.map((s) => <option key={String(s.id)} value={String(s.id)}>{s.supplier_name}</option>)}
            </select>
          </label>
          <SubmitButton label="Add as customer too" />
        </form>
        <form action={addCustomerAsSupplierAction} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", alignItems: "end" }}>
          <label>This customer also sells to us
            <select name="customer_id" required defaultValue="" style={field}>
              <option value="" disabled>Choose…</option>
              {customers.map((c) => <option key={String(c.id)} value={String(c.id)}>{c.full_name}</option>)}
            </select>
          </label>
          <SubmitButton label="Add as supplier too" />
        </form>
      </section>
    </main>
  );
}

export default function BothSidesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <BothSidesContent {...props} />
    </Suspense>
  );
}
