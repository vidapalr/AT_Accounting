import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import {
  createSalesReturnAction,
  recordRefundAction,
  recordStockDamageAction,
} from "@/lib/returns-actions";

type Props = {
  searchParams: Promise<{ sale?: string; saved?: string; error?: string }>;
};

type Row = RowDataPacket & Record<string, string | number | null>;

const inr = (value: string | number | null) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const today = () => new Date().toISOString().slice(0, 10);

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "left" };
const box: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, margin: "16px 0" };

async function ReturnsContent({ searchParams }: Props) {
  const user = await requireAccess("returns");
  const businessId = user.legal_business_id;
  const query = await searchParams;
  const saleId = Number(query.sale);

  const [invoices] = await db.execute<Row[]>(
    `SELECT id, invoice_no, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS d, customer_name, grand_total
     FROM acct_sales_headers
     WHERE legal_business_id = ? AND status = 'POSTED'
     ORDER BY invoice_date DESC, id DESC LIMIT 60`,
    [businessId]
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

  let sale: Row | undefined;
  let lines: Row[] = [];
  if (Number.isInteger(saleId) && saleId > 0) {
    const [saleRows] = await db.execute<Row[]>(
      `SELECT id, invoice_no, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS d, customer_name, grand_total
       FROM acct_sales_headers WHERE id = ? AND legal_business_id = ? AND status = 'POSTED'`,
      [saleId, businessId]
    );
    sale = saleRows[0];
    if (sale) {
      const [lineRows] = await db.execute<Row[]>(
        `SELECT l.id, l.quantity, l.unit_price, l.line_total, v.sku, p.product_name,
                COALESCE((SELECT SUM(rl.quantity) FROM acct_sales_return_lines rl
                          JOIN acct_sales_returns r ON r.id = rl.return_id
                          WHERE rl.sale_line_id = l.id AND r.status = 'POSTED'), 0) AS returned
         FROM acct_sales_lines l
         JOIN acct_product_variants v ON v.id = l.variant_id
         JOIN acct_products p ON p.id = v.product_id
         WHERE l.sale_id = ? AND l.legal_business_id = ? ORDER BY l.id`,
        [saleId, businessId]
      );
      lines = lineRows;
    }
  }

  const [returns] = await db.execute<Row[]>(
    `SELECT r.id, r.return_no, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS d, r.reason,
            r.refund_value, s.invoice_no,
            COALESCE((SELECT SUM(f.amount) FROM acct_sales_refunds f
                      WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0) AS refunded,
            COALESCE((SELECT SUM(px.amount) FROM acct_sales_payments px
                      WHERE px.exchange_return_id = r.id AND px.status = 'RECORDED'), 0) AS exchanged
     FROM acct_sales_returns r
     JOIN acct_sales_headers s ON s.id = r.sale_id
     WHERE r.legal_business_id = ? AND r.status = 'POSTED'
     ORDER BY r.return_date DESC, r.id DESC LIMIT 40`,
    [businessId]
  );

  const [locations] = await db.execute<Row[]>(
    `SELECT id, location_name FROM acct_inventory_locations
     WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY location_name`,
    [businessId]
  );
  const [variants] = await db.execute<Row[]>(
    `SELECT v.id, v.sku, p.product_name FROM acct_product_variants v
     JOIN acct_products p ON p.id = v.product_id
     WHERE v.legal_business_id = ? AND v.status = 'ACTIVE' ORDER BY p.product_name, v.sku LIMIT 500`,
    [businessId]
  );
  const [damages] = await db.execute<Row[]>(
    `SELECT d.id, DATE_FORMAT(d.damage_date, '%Y-%m-%d') AS d, d.quantity, d.total_cost, d.reason,
            v.sku, p.product_name
     FROM acct_stock_damages d
     JOIN acct_product_variants v ON v.id = d.variant_id
     JOIN acct_products p ON p.id = v.product_id
     WHERE d.legal_business_id = ? AND d.status = 'POSTED'
     ORDER BY d.damage_date DESC, d.id DESC LIMIT 20`,
    [businessId]
  );

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
  const methodOptions = (
    <>
      <option value="CASH">Cash</option>
      <option value="UPI">UPI</option>
      <option value="BANK_TRANSFER">Bank transfer</option>
      <option value="CARD">Card</option>
      <option value="OTHER">Other</option>
    </>
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <h1>Returns, Refunds and Damaged Stock</h1>
      {query.saved && <p style={{ color: "#166534" }}>{query.saved.slice(0, 300)}</p>}
      {query.error && <p style={{ color: "#b91c1c" }}>{query.error.slice(0, 300)}</p>}

      <section style={box}>
        <h2>1. Customer return</h2>
        <p style={{ color: "#64748b" }}>
          Pick the invoice. Resellable pieces go back into stock at the cost they were sold at.
          Damaged pieces do not, and their cost is booked as damaged stock.
          The customer is credited only what they actually paid for those pieces (after discounts).
        </p>
        <form method="get">
          <label>Invoice{" "}
            <select name="sale" defaultValue={sale ? String(sale.id) : ""}>
              <option value="">Choose…</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoice_no} · {i.d} · {i.customer_name || "Walk-in"} · {inr(i.grand_total)}
                </option>
              ))}
            </select>
          </label>{" "}
          <button type="submit">Load lines</button>
        </form>

        {sale && (
          <form action={createSalesReturnAction} style={{ marginTop: 16 }}>
            <input type="hidden" name="sale_id" value={String(sale.id)} />
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Product", "Sold", "Already returned", "Price", "Return qty", "Condition"].map((h) => (
                    <th key={h} style={cell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td style={cell}>{l.product_name} <small>({l.sku})</small></td>
                    <td style={cell}>{String(l.quantity)}</td>
                    <td style={cell}>{String(l.returned)}</td>
                    <td style={cell}>{inr(l.unit_price)}</td>
                    <td style={cell}><input name={`qty_${l.id}`} inputMode="decimal" size={6} placeholder="0" /></td>
                    <td style={cell}>
                      <select name={`condition_${l.id}`} defaultValue="RESELLABLE">
                        <option value="RESELLABLE">Resellable</option>
                        <option value="DAMAGED">Damaged</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
              <label>Date<br /><input type="date" name="return_date" defaultValue={today()} required /></label>
              <label>Reason<br />
                <select name="reason" required defaultValue="">
                  <option value="" disabled>Choose…</option>
                  <option value="DEFECTIVE">Defective</option>
                  <option value="WRONG_SIZE">Wrong size</option>
                  <option value="CUSTOMER_CHANGED_MIND">Customer changed mind</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label>Notes<br /><input name="remarks" maxLength={500} size={30} /></label>
            </p>
            <p style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
              <label>Refund<br />
                <select name="refund_now" defaultValue="NONE">
                  <option value="NONE">Not paid yet (customer credit)</option>
                  <option value="FULL">Pay the full refund now</option>
                </select>
              </label>
              <label>Paid from<br /><select name="refund_account" defaultValue="">{accountOptions}</select></label>
              <label>Method<br /><select name="refund_method" defaultValue="CASH">{methodOptions}</select></label>
            </p>
            <button type="submit">Save return only</button>{" "}
            <button type="submit" name="exchange" value="1" className="btn-link btn-link-primary" style={{ cursor: "pointer", fontSize: 16, padding: "10px 18px" }}>
              Exchange: save the return, then choose the new items
            </button>
            <p style={{ color: "#64748b", marginBottom: 0 }}>
              For an exchange the refund choices above are ignored. The value of the returned pieces is used as part payment on the new bill.
            </p>
          </form>
        )}
      </section>

      <section style={box}>
        <h2>Returns and refunds owed</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{["Return", "Date", "Invoice", "Reason", "Credit", "Refunded", "Still owed", "Pay refund"].map((h) => (
              <th key={h} style={cell}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {returns.map((r) => {
              const owed = Math.round((Number(r.refund_value) - Number(r.refunded) - Number(r.exchanged)) * 100) / 100;
              return (
                <tr key={r.id}>
                  <td style={cell}>{r.return_no}</td>
                  <td style={cell}>{r.d}</td>
                  <td style={cell}>{r.invoice_no}</td>
                  <td style={cell}>{String(r.reason).replaceAll("_", " ").toLowerCase()}</td>
                  <td style={cell}>{inr(r.refund_value)}</td>
                  <td style={cell}>{inr(Number(r.refunded) + Number(r.exchanged))}</td>
                  <td style={cell}>{inr(owed)}</td>
                  <td style={cell}>
                    {owed > 0 ? (
                      <form action={recordRefundAction} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <input type="hidden" name="return_id" value={String(r.id)} />
                        <input name="amount" defaultValue={owed.toFixed(2)} size={8} inputMode="decimal" />
                        <input type="date" name="refund_date" defaultValue={today()} required />
                        <select name="account" defaultValue="">{accountOptions}</select>
                        <select name="method" defaultValue="CASH">{methodOptions}</select>
                        <button type="submit">Pay</button>
                      </form>
                    ) : "Settled"}
                  </td>
                </tr>
              );
            })}
            {returns.length === 0 && <tr><td style={cell} colSpan={8}>No returns yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section style={box}>
        <h2>2. Damaged or lost stock</h2>
        <p style={{ color: "#64748b" }}>
          For pieces damaged or lost in the shop or warehouse. They leave stock at their average cost and
          reduce gross profit.
        </p>
        <form action={recordStockDamageAction} style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <label>Location<br />
            <select name="location_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
            </select>
          </label>
          <label>Product<br />
            <select name="variant_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {variants.map((v) => <option key={v.id} value={v.id}>{v.product_name} ({v.sku})</option>)}
            </select>
          </label>
          <label>Quantity<br /><input name="quantity" inputMode="decimal" size={6} required /></label>
          <label>Date<br /><input type="date" name="damage_date" defaultValue={today()} required /></label>
          <label>Reason<br />
            <select name="reason" defaultValue="DAMAGED">
              <option value="DAMAGED">Damaged</option>
              <option value="LOST">Lost</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label>Notes<br /><input name="remarks" maxLength={500} size={24} /></label>
          <button type="submit">Record</button>
        </form>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead><tr>{["Date", "Product", "Qty", "Cost", "Reason"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
          <tbody>
            {damages.map((d) => (
              <tr key={d.id}>
                <td style={cell}>{d.d}</td>
                <td style={cell}>{d.product_name} ({d.sku})</td>
                <td style={cell}>{String(d.quantity)}</td>
                <td style={cell}>{inr(d.total_cost)}</td>
                <td style={cell}>{String(d.reason).toLowerCase()}</td>
              </tr>
            ))}
            {damages.length === 0 && <tr><td style={cell} colSpan={5}>Nothing recorded.</td></tr>}
          </tbody>
        </table>
      </section>

      <p>
        New returns and damages reach the profit figures once posted:{" "}
        <Link href="/accounting/reports">open Reports</Link> and use &ldquo;Post pending entries&rdquo;.
      </p>
    </main>
  );
}

export default function ReturnsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ReturnsContent {...props} />
    </Suspense>
  );
}
