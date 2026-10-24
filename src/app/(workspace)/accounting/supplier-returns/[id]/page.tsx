import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";
import { loadSupplierBalances } from "@/lib/supplier-ledger";
import { parsePaise } from "@/lib/returns-math";
import { linkReplacementAction, recordSupplierRefundAction } from "@/lib/supplier-return-actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (value: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const paiseText = (p: bigint) => inr(`${p / 100n}.${String(p % 100n).padStart(2, "0")}`);
const today = () => new Date().toISOString().slice(0, 10);

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };
const field: React.CSSProperties = { padding: "10px 12px", fontSize: 16, minWidth: 0 };

const REASONS: Record<string, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  EXTRA: "Extra / not needed",
  OTHER: "Other",
};

async function DebitNote({ params, searchParams }: Props) {
  const user = await requireAccess("supplier_returns");
  const businessId = user.legal_business_id;
  const { id } = await params;
  const query = await searchParams;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  const returnId = Number(id);

  const [rows] = await db.execute<Row[]>(
    `SELECT r.id, r.return_no, r.supplier_id, r.purchase_id, r.reason, r.remarks, r.supplier_note_no,
            r.cost_value, r.agreed_value,
            DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date,
            DATE_FORMAT(r.return_date, '%d %b %Y') AS pretty_date,
            s.supplier_name, s.gstin, s.mobile,
            h.purchase_no, h.supplier_invoice_no, w.location_name
     FROM acct_supplier_returns r
     JOIN acct_suppliers s ON s.id = r.supplier_id AND s.legal_business_id = r.legal_business_id
     LEFT JOIN acct_purchase_headers h ON h.id = r.purchase_id AND h.legal_business_id = r.legal_business_id
     LEFT JOIN acct_inventory_locations w ON w.id = r.location_id AND w.legal_business_id = r.legal_business_id
     WHERE r.id = ? AND r.legal_business_id = ? AND r.status = 'POSTED'`,
    [returnId, businessId]
  );
  const ret = rows[0];
  if (!ret) notFound();

  const [lines] = await db.execute<Row[]>(
    `SELECT p.product_name, v.sku, v.size_label, v.color_name, rl.quantity, rl.unit_cost, rl.total_cost
     FROM acct_supplier_return_lines rl
     JOIN acct_product_variants v ON v.id = rl.variant_id AND v.legal_business_id = rl.legal_business_id
     JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
     WHERE rl.return_id = ? AND rl.legal_business_id = ? ORDER BY rl.id`,
    [returnId, businessId]
  );

  const [refunds] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(refund_date, '%d %b %Y') AS d, amount, payment_method
     FROM acct_supplier_refunds
     WHERE legal_business_id = ? AND return_id = ? AND status = 'RECORDED' ORDER BY refund_date, id`,
    [businessId, returnId]
  );

  const [replaced] = await db.execute<Row[]>(
    `SELECT h.id, h.purchase_no, DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%d %b %Y') AS d,
            COALESCE((SELECT SUM(l.line_amount) FROM acct_purchase_lines l
                      WHERE l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id), 0) AS total
     FROM acct_supplier_return_replacements x
     JOIN acct_purchase_headers h ON h.id = x.purchase_id AND h.legal_business_id = x.legal_business_id
     WHERE x.legal_business_id = ? AND x.return_id = ? ORDER BY h.id`,
    [businessId, returnId]
  );

  const [candidates] = await db.execute<Row[]>(
    `SELECT h.id, h.purchase_no, DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%d %b %Y') AS d
     FROM acct_purchase_headers h
     WHERE h.legal_business_id = ? AND h.supplier_id = ? AND h.status = 'POSTED'
       AND h.id <> COALESCE(?, 0)
       AND COALESCE(h.received_date, h.invoice_date) >= ?
       AND h.id NOT IN (SELECT purchase_id FROM acct_supplier_return_replacements
                        WHERE legal_business_id = ? AND return_id = ?)
     ORDER BY h.id DESC LIMIT 50`,
    [businessId, ret.supplier_id, ret.purchase_id, ret.return_date, businessId, returnId]
  );

  const [cashAccounts] = await db.execute<Row[]>(
    `SELECT id, cash_name FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY cash_name`,
    [businessId]
  );
  const [bankAccounts] = await db.execute<Row[]>(
    `SELECT id, account_label, ownership_type FROM acct_bank_accounts
     WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY account_label`,
    [businessId]
  );

  const agreed = parsePaise(String(ret.agreed_value));
  const cost = parsePaise(String(ret.cost_value));
  const refunded = refunds.reduce((s, r) => s + parsePaise(String(r.amount)), 0n);
  const left = agreed - refunded;
  const balances = await loadSupplierBalances(db, businessId);
  const net = balances.get(Number(ret.supplier_id))?.balance ?? 0n;
  const held = net < 0n ? -net : 0n; // supplier owes us
  const refundable = left < held ? left : held;

  const accountOptions = (
    <>
      <option value="">Choose account…</option>
      {cashAccounts.map((c) => <option key={`c${c.id}`} value={`cash:${c.id}`}>Cash: {c.cash_name}</option>)}
      {bankAccounts.map((b) => (
        <option key={`b${b.id}`} value={`bank:${b.id}`}>
          Bank: {b.account_label}{b.ownership_type === "INVESTOR" ? " (investor)" : ""}
        </option>
      ))}
    </>
  );

  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <PrintHeader title={`Debit note ${ret.return_no}`} subtitle={`Goods returned to ${ret.supplier_name}`} />
      <h1 className="no-print">Debit note {ret.return_no}</h1>
      {query.saved && <p className="no-print" style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p className="no-print" style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <table>
          <tbody>
            <tr><td style={cell}>Supplier</td><td style={cell}><strong>{ret.supplier_name}</strong>{ret.gstin ? ` · GSTIN ${ret.gstin}` : ""}</td></tr>
            <tr><td style={cell}>Date</td><td style={cell}>{ret.pretty_date}</td></tr>
            <tr><td style={cell}>Against purchase</td><td style={cell}>{ret.purchase_no ?? "—"}{ret.supplier_invoice_no ? ` (supplier invoice ${ret.supplier_invoice_no})` : ""}</td></tr>
            <tr><td style={cell}>Sent from</td><td style={cell}>{ret.location_name ?? "—"}</td></tr>
            <tr><td style={cell}>Reason</td><td style={cell}>{REASONS[String(ret.reason)] ?? String(ret.reason)}{ret.remarks ? ` — ${ret.remarks}` : ""}</td></tr>
            {ret.supplier_note_no && <tr><td style={cell}>Supplier&rsquo;s credit note</td><td style={cell}>{ret.supplier_note_no}</td></tr>}
          </tbody>
        </table>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead><tr>{["Item", "Quantity", "Cost each", "Value"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={cell}>{l.product_name} <small>({l.sku}{l.size_label ? `, ${l.size_label}` : ""}{l.color_name ? `, ${l.color_name}` : ""})</small></td>
                  <td style={cell}>{String(l.quantity)}</td>
                  <td style={cell}>{inr(l.unit_cost)}</td>
                  <td style={cell}>{inr(l.total_cost)}</td>
                </tr>
              ))}
              <tr><td style={cell} colSpan={3}><strong>Cost of goods returned</strong></td><td style={cell}>{paiseText(cost)}</td></tr>
              <tr><td style={cell} colSpan={3}><strong>Credit from the supplier</strong></td><td style={cell}><strong>{paiseText(agreed)}</strong></td></tr>
              {cost > agreed && (
                <tr><td style={cell} colSpan={3}>Difference taken as a loss</td><td style={cell}>{paiseText(cost - agreed)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={box} className="no-print">
        <h2>What did the supplier do?</h2>

        <h3>Credit on my account</h3>
        <p>
          Already done. {paiseText(agreed)} has been taken off what you owe {ret.supplier_name}.{" "}
          {net > 0n && <>You still owe him <strong>{paiseText(net)}</strong> in total.</>}
          {net < 0n && <>He now owes you <strong>{paiseText(-net)}</strong> in total. Use it on his next bill, or record a refund below.</>}
          {net === 0n && <>You and he are square.</>}
        </p>

        <h3>Refund (supplier paid money back)</h3>
        {refunds.length > 0 && (
          <ul>
            {refunds.map((r, i) => <li key={i}>{r.d}: {inr(r.amount)} ({String(r.payment_method).replace("_", " ").toLowerCase()})</li>)}
          </ul>
        )}
        {refundable > 0n ? (
          <form action={recordSupplierRefundAction} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
            <input type="hidden" name="return_id" value={String(ret.id)} />
            <label>Date<br /><input type="date" name="refund_date" defaultValue={today()} min={String(ret.return_date)} max={today()} required style={field} /></label>
            <label>Amount (₹)<br />
              <input name="amount" inputMode="decimal" defaultValue={`${refundable / 100n}.${String(refundable % 100n).padStart(2, "0")}`} required style={{ ...field, width: 150 }} />
            </label>
            <label>How<br />
              <select name="method" defaultValue="BANK_TRANSFER" style={field}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label>Money went into<br />
              <select name="account" required defaultValue="" style={field}>{accountOptions}</select>
            </label>
            <button type="submit" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "12px 22px" }}>
              Record refund
            </button>
          </form>
        ) : (
          <p style={{ color: "#64748b" }}>
            {left <= 0n
              ? "The full amount has been refunded."
              : "Not available: you still owe this supplier money, so his credit is used against that. A refund can be recorded once he owes you."}
          </p>
        )}

        <h3>Replacement items</h3>
        <p style={{ color: "#64748b" }}>
          Receive the new goods as a normal purchase from this supplier (Buying, then Buy stock),
          then link that purchase here so the two are kept together.
        </p>
        {replaced.length > 0 && (
          <ul>
            {replaced.map((p) => (
              <li key={p.id}><Link href={`/accounting/purchases/${p.id}`}>{p.purchase_no}</Link> · {p.d} · {inr(p.total)}</li>
            ))}
          </ul>
        )}
        {candidates.length > 0 ? (
          <form action={linkReplacementAction} style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "end" }}>
            <input type="hidden" name="return_id" value={String(ret.id)} />
            <label>Purchase with the replacement items<br />
              <select name="replacement_purchase_id" required defaultValue="" style={field}>
                <option value="" disabled>Choose…</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.purchase_no} · {c.d}</option>)}
              </select>
            </label>
            <button type="submit" className="btn-link" style={{ cursor: "pointer", fontSize: 16, padding: "12px 22px" }}>Link purchase</button>
          </form>
        ) : (
          <p style={{ color: "#64748b" }}>No newer received purchase from this supplier to link yet.</p>
        )}
      </section>

      <nav className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <PrintButton label="Print debit note" />
        <Link className="btn-link btn-link-primary" href="/accounting/supplier-returns">Return more goods</Link>
        <Link className="btn-link" href={`/accounting/supplier-statement?supplier=${ret.supplier_id}`}>Supplier statement</Link>
        <Link className="btn-link" href="/accounting/purchase-management">Supplier bills and payments</Link>
      </nav>
    </main>
  );
}

export default function DebitNotePage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <DebitNote {...props} />
    </Suspense>
  );
}
