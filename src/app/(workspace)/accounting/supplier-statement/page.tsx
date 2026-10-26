import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import OtherSideNote from "@/components/accounting/OtherSideNote";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";
import { todayInIndia } from "@/lib/reports/money";
import { normalizePhone } from "@/lib/customer-phone";
import { loadSupplierBalances, loadSupplierEvents } from "@/lib/supplier-ledger";
import { ageDues, buildStatement } from "@/lib/supplier-statement";

type Props = { searchParams: Promise<{ supplier?: string }> };
type Row = RowDataPacket & Record<string, string | number | null>;

const rupees = (p: bigint) => {
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const whole = (abs / 100n).toLocaleString("en-IN");
  return `${neg ? "-" : ""}₹${whole}.${String(abs % 100n).padStart(2, "0")}`;
};
const prettyDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const right: React.CSSProperties = { ...cell, textAlign: "right" };

const LABEL = {
  BILL: "Purchase bill",
  PAYMENT: "Payment made",
  RETURN: "Goods returned (debit note)",
  REFUND: "Refund received",
} as const;

function balanceWords(balance: bigint): string {
  if (balance > 0n) return `You owe ${rupees(balance)}`;
  if (balance < 0n) return `Supplier owes you ${rupees(-balance)}`;
  return "Square";
}

async function StatementContent({ searchParams }: Props) {
  const user = await requireAccess("supplier_returns");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const today = todayInIndia();

  if (query.supplier !== undefined) {
    if (!/^[1-9]\d*$/.test(query.supplier)) notFound();
    const supplierId = Number(query.supplier);
    const [suppliers] = await db.execute<Row[]>(
      `SELECT id, supplier_name, gstin, mobile, whatsapp_number, credit_days
       FROM acct_suppliers WHERE id = ? AND legal_business_id = ?`,
      [supplierId, businessId]
    );
    const supplier = suppliers[0];
    if (!supplier) notFound();

    const events = await loadSupplierEvents(db, businessId, supplierId);
    const { rows, balance } = buildStatement(events);
    const bills = events.filter((e) => e.kind === "BILL").map((e) => ({ date: e.date, amount: e.amount }));
    const reductions = events.reduce(
      (s, e) => (e.kind === "PAYMENT" || e.kind === "RETURN" ? s + e.amount : e.kind === "REFUND" ? s - e.amount : s),
      0n
    );
    const ageing = ageDues(bills, reductions, today);

    const phone = normalizePhone(String(supplier.whatsapp_number ?? "")) ?? normalizePhone(String(supplier.mobile ?? ""));
    const message =
      `Hello ${supplier.supplier_name}, this is Abhiram Textiles. As on ${prettyDate(today)}, ` +
      (balance > 0n
        ? `our account shows ${rupees(balance)} payable to you.`
        : balance < 0n
          ? `our account shows ${rupees(-balance)} due from you (credit for returned goods).`
          : `our account with you is square.`) +
      ` Please confirm if this matches your books.`;
    const waLink = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}` : null;

    return (
      <main style={{ padding: 24, maxWidth: 1000 }}>
        <PrintHeader title={`Account statement: ${supplier.supplier_name}`} subtitle={`As on ${prettyDate(today)}`} />
        <h1 className="no-print">{supplier.supplier_name}</h1>
        <OtherSideNote businessId={businessId} role={user.role} supplierId={supplierId} />
        <p style={{ fontSize: 20 }}>
          <strong>{balanceWords(balance)}</strong>
          {supplier.gstin ? <span style={{ color: "#64748b", fontSize: 14 }}> · GSTIN {supplier.gstin}</span> : null}
        </p>

        {ageing.totalDue > 0n && (
          <section style={box}>
            <h2>How old is what you owe?</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", minWidth: 480 }}>
                <thead><tr>{["Up to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days", "Total"].map((h) => <th key={h} style={right}>{h}</th>)}</tr></thead>
                <tbody>
                  <tr>
                    <td style={right}>{rupees(ageing.upTo30)}</td>
                    <td style={right}>{rupees(ageing.from31to60)}</td>
                    <td style={right}>{rupees(ageing.from61to90)}</td>
                    <td style={right}>{rupees(ageing.over90)}</td>
                    <td style={right}><strong>{rupees(ageing.totalDue)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ color: "#64748b", fontSize: 13 }}>Payments and returns are counted against the oldest bills first.</p>
          </section>
        )}

        <section style={box}>
          <h2>Every entry</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={cell}>Date</th><th style={cell}>What</th><th style={cell}>Reference</th>
                  <th style={right}>You owe more</th><th style={right}>You owe less</th><th style={right}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={cell}>{prettyDate(r.date)}</td>
                    <td style={cell}>{LABEL[r.kind]}</td>
                    <td style={cell}>{r.ref}</td>
                    <td style={right}>{r.effect > 0n ? rupees(r.effect) : ""}</td>
                    <td style={right}>{r.effect < 0n ? rupees(-r.effect) : ""}</td>
                    <td style={right}>{balanceWords(r.balance)}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td style={cell} colSpan={6}>Nothing recorded with this supplier yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <nav className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <PrintButton label="Print statement" />
          {waLink && <a className="btn-link btn-link-primary" href={waLink} target="_blank" rel="noreferrer">Send on WhatsApp</a>}
          <Link className="btn-link" href="/accounting/supplier-returns">Return goods</Link>
          <Link className="btn-link" href="/accounting/purchase-management">Pay supplier bills</Link>
          <Link className="btn-link" href="/accounting/supplier-statement">All suppliers</Link>
        </nav>
        {!phone && <p className="no-print" style={{ color: "#64748b" }}>Add a mobile number on the Suppliers page to send this on WhatsApp.</p>}
      </main>
    );
  }

  const balances = await loadSupplierBalances(db, businessId);
  const [suppliers] = await db.execute<Row[]>(
    `SELECT id, supplier_name FROM acct_suppliers WHERE legal_business_id = ? ORDER BY supplier_name`,
    [businessId]
  );
  const list = suppliers
    .map((s) => ({ id: Number(s.id), name: String(s.supplier_name), b: balances.get(Number(s.id)) }))
    .filter((s) => s.b !== undefined);
  const totalOwe = list.reduce((sum, s) => (s.b!.balance > 0n ? sum + s.b!.balance : sum), 0n);
  const totalOwed = list.reduce((sum, s) => (s.b!.balance < 0n ? sum - s.b!.balance : sum), 0n);

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1>Supplier statement</h1>
      <p style={{ fontSize: 18 }}>
        You owe suppliers <strong>{rupees(totalOwe)}</strong>
        {totalOwed > 0n && <> · Suppliers owe you <strong>{rupees(totalOwed)}</strong></>}
      </p>
      <section style={box}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={cell}>Supplier</th><th style={right}>Bills</th><th style={right}>Paid</th>
                <th style={right}>Returned</th><th style={right}>Balance</th><th style={cell}></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td style={cell}><strong>{s.name}</strong></td>
                  <td style={right}>{rupees(s.b!.billed)}</td>
                  <td style={right}>{rupees(s.b!.paid)}</td>
                  <td style={right}>{rupees(s.b!.returned)}</td>
                  <td style={right}>{balanceWords(s.b!.balance)}</td>
                  <td style={cell}><Link className="btn-link btn-link-small" href={`/accounting/supplier-statement?supplier=${s.id}`}>Open</Link></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td style={cell} colSpan={6}>No supplier bills yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn-link btn-link-primary" href="/accounting/supplier-returns">Return goods to a supplier</Link>
        <Link className="btn-link" href="/accounting/purchase-management">Supplier bills and payments</Link>
      </nav>
    </main>
  );
}

export default function SupplierStatementPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <StatementContent {...props} />
    </Suspense>
  );
}
