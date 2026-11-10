import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { billCreditSql } from "@/lib/supplier-ledger";
import { todayInIndia } from "@/lib/reports/money";
import { paySupplierAction } from "@/lib/supplier-pay-actions";
import SubmitButton from "@/components/SubmitButton";
import PaidFromPicker, { type PaidFromOption } from "@/components/PaidFromPicker";

type Props = { searchParams: Promise<{ supplier?: string; result?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const paise = (v: unknown): bigint => {
  const [w, f = ""] = String(v ?? "0").split(".");
  return BigInt(w || "0") * 100n + BigInt(f.padEnd(2, "0").slice(0, 2));
};
const rupees = (p: bigint) => `₹${(p / 100n).toLocaleString("en-IN")}.${String(p % 100n).padStart(2, "0")}`;
const cell: React.CSSProperties = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const input: React.CSSProperties = { display: "block", width: "100%", padding: 12, fontSize: 16, marginTop: 6, border: "1px solid #cbd5e1", borderRadius: 6 };

const MESSAGES: Record<string, string> = {
  invalid: "Check the amount, date and where the money came from.",
  "source-invalid": "That account, investor or agreement can't be used for this payment.",
  "more-than-owed": "That is more than you owe this supplier.",
  "parts-differ": "The amounts typed against the bills do not add up to the payment amount.",
  "part-too-big": "One bill has more typed against it than is still due on it.",
  "duplicate-reference": "A payment with this reference was already saved for this supplier.",
  failed: "The payment could not be saved. Nothing was changed.",
};

const OWED_SQL = `
  SELECT h.id, h.purchase_no, DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%Y-%m-%d') AS d,
         CAST(COALESCE((SELECT SUM(l.line_amount) FROM acct_purchase_lines l
                         WHERE l.legal_business_id = h.legal_business_id AND l.division_id = h.division_id
                           AND l.purchase_id = h.id), 0) - ${billCreditSql("h")} AS CHAR) AS total,
         CAST(COALESCE((SELECT SUM(p.amount) FROM acct_purchase_payments p
                         WHERE p.legal_business_id = h.legal_business_id AND p.division_id = h.division_id
                           AND p.purchase_id = h.id AND p.status IN ('DRAFT','VERIFIED')), 0) AS CHAR) AS paid,
         h.supplier_id
  FROM acct_purchase_headers h
  WHERE h.legal_business_id = ? AND h.division_id = ? AND h.status = 'POSTED'`;

async function Content({ searchParams }: Props) {
  const user = await requireAccess("purchases");
  const businessId = user.legal_business_id;
  const divisionId = await getActiveDivisionId(user);
  const query = await searchParams;

  const [allBills] = await db.execute<Row[]>(OWED_SQL + " ORDER BY COALESCE(h.received_date, h.invoice_date), h.id", [businessId, divisionId]);
  const due = new Map<number, bigint>();
  for (const b of allBills) {
    const d = paise(b.total) - paise(b.paid);
    if (d > 0n) due.set(Number(b.supplier_id), (due.get(Number(b.supplier_id)) ?? 0n) + d);
  }
  const [suppliers] = await db.execute<Row[]>(
    `SELECT id, supplier_name FROM acct_suppliers WHERE legal_business_id = ? ORDER BY supplier_name`, [businessId]);
  const owing = suppliers.filter((s) => (due.get(Number(s.id)) ?? 0n) > 0n);

  const supplierId = /^[1-9]\d*$/.test(query.supplier ?? "") ? Number(query.supplier) : null;
  const supplier = suppliers.find((s) => Number(s.id) === supplierId);
  const message = query.result ? MESSAGES[query.result] : null;

  if (!supplier) {
    return (
      <main style={{ padding: 16, maxWidth: 800 }}>
        <h1>Pay a supplier</h1>
        <p style={{ color: "#64748b" }}>Pick the supplier. You pay one amount and the app spreads it over their oldest bills.</p>
        {message && <p role="alert" style={{ color: "#b91c1c" }}>{message}</p>}
        {owing.length === 0 ? <p>No supplier has anything pending.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {owing.map((s) => (
              <Link key={String(s.id)} className="btn-link" href={`/accounting/pay-supplier?supplier=${s.id}`}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 17, padding: "14px 16px" }}>
                <span>{s.supplier_name}</span>
                <strong>{rupees(due.get(Number(s.id)) ?? 0n)}</strong>
              </Link>
            ))}
          </div>
        )}
      </main>
    );
  }

  const bills = allBills.filter((b) => Number(b.supplier_id) === supplierId)
    .map((b) => ({ id: Number(b.id), no: String(b.purchase_no), date: String(b.d), due: paise(b.total) - paise(b.paid) }))
    .filter((b) => b.due > 0n);
  const owed = bills.reduce((t, b) => t + b.due, 0n);

  const [banks] = await db.execute<Row[]>(
    `SELECT id, bank_name, account_label, ownership_type, funding_party_id FROM acct_bank_accounts
      WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY ownership_type, bank_name`, [businessId]);
  const [cashAccts] = await db.execute<Row[]>(
    `SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`, [businessId]);
  const [parties] = await db.execute<Row[]>(
    `SELECT id, full_name FROM acct_funding_parties WHERE legal_business_id = ? ORDER BY full_name`, [businessId]);
  const [agreements] = await db.execute<Row[]>(
    `SELECT id, agreement_no, party_id FROM acct_funding_agreements
      WHERE legal_business_id = ? AND status = 'ACTIVE' AND branch_id IS NULL ORDER BY agreement_no`, [businessId]);

  const options: PaidFromOption[] = [];
  for (const b of banks) {
    const name = `${b.bank_name}${b.account_label ? ` ${b.account_label}` : ""}`;
    if (b.ownership_type === "BUSINESS") options.push({ key: `bank${b.id}`, label: `Business bank: ${name}`, source: "BUSINESS_BANK", bankId: Number(b.id) });
    else if (b.funding_party_id) options.push({ key: `ibank${b.id}`, label: `Investor bank: ${name}`, source: "INVESTOR_BANK", bankId: Number(b.id), partyId: Number(b.funding_party_id) });
  }
  for (const c of cashAccts) options.push({ key: `cash${c.id}`, label: `Cash: ${c.cash_name}`, source: "BUSINESS_CASH", cashId: Number(c.id) });
  for (const p of parties) options.push({ key: `icash${p.id}`, label: `Investor cash: ${p.full_name}`, source: "INVESTOR_CASH", partyId: Number(p.id) });
  try {
    const [ownerAccts] = await db.execute<Row[]>(
      `SELECT id, account_name FROM acct_owner_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY account_name`, [businessId]);
    for (const o of ownerAccts) options.push({ key: `oacc${o.id}`, label: `Owner account: ${o.account_name}`, source: "OWNER_PERSONAL", ownerAccountId: Number(o.id), ownerAccountName: String(o.account_name) });
  } catch { /* before migration 076 */ }
  options.push({ key: "owner", label: "Owner's own money (no account)", source: "OWNER_PERSONAL" });

  return (
    <main style={{ padding: 16, maxWidth: 800 }}>
      <Link className="btn-link" href="/accounting/pay-supplier">← Other suppliers</Link>
      <h1>Pay {supplier.supplier_name}</h1>
      <p style={{ fontSize: 18 }}>You owe <strong>{rupees(owed)}</strong> on {bills.length} bill{bills.length === 1 ? "" : "s"}.</p>
      {message && <p role="alert" style={{ color: "#b91c1c", fontSize: 17 }}>{message}</p>}

      <form action={paySupplierAction}>
        <input type="hidden" name="supplier_id" value={String(supplier.id)} />
        <section style={box}>
          <label>Amount paid (₹), as one payment
            <input name="amount" required inputMode="decimal" placeholder="26000" style={input} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>Date paid
            <input type="date" name="payment_date" required defaultValue={todayInIndia()} style={input} />
          </label>
          <label style={{ display: "block", marginTop: 12 }}>How
            <select name="payment_method" required defaultValue="" style={input}>
              <option value="">Choose</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="UPI">UPI</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <div style={{ marginTop: 12 }}>
            <PaidFromPicker options={options} agreements={agreements.map((a) => ({ id: Number(a.id), label: String(a.agreement_no), partyId: Number(a.party_id) }))} />
          </div>
          <label style={{ display: "block", marginTop: 12 }}>Bank reference or cheque number (as on your bank statement)
            <input name="payment_reference" maxLength={120} style={input} />
          </label>
          <input type="hidden" name="evidence_reference" value="" />
          <input type="hidden" name="remarks" value="" />
        </section>

        <section style={box}>
          <h2 style={{ marginTop: 0 }}>Which bills it goes to</h2>
          <p style={{ color: "#64748b", marginTop: 0 }}>
            Leave the boxes empty and the app fills the oldest bill first. Or type how much goes on each bill; they must add up to the amount.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={cell}>Bill</th><th style={cell}>Date</th><th style={{ ...cell, textAlign: "right" }}>Still due</th><th style={cell}>Put this much on it</th></tr></thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td style={cell}>{b.no}</td>
                    <td style={cell}>{b.date}</td>
                    <td style={{ ...cell, textAlign: "right" }}>{rupees(b.due)}</td>
                    <td style={cell}><input name={`part_${b.id}`} inputMode="decimal" placeholder="auto" style={{ ...input, marginTop: 0, minWidth: 110 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <SubmitButton label="Save payment" />
      </form>
    </main>
  );
}

export default function PaySupplierPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
