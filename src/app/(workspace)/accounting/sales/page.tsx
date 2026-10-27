
import { Suspense } from "react";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { bestOffer } from "@/lib/offer-math";
import { loadOffers } from "@/lib/shop";
import SalesBillingForm from
  "@/components/accounting/SalesBillingForm";

type Props = {
  searchParams: Promise<{
    result?: string;
    id?: string;
    view?: string;
    edit?: string;
    from_report?: string;
    from_approval?: string;
  }>;
};

interface PaymentBankRow extends RowDataPacket {
  id: number;
  ownership_type: string;
  account_label: string;
  bank_name: string;
  account_number_last4: string;
}

interface PaymentCashRow extends RowDataPacket {
  id: number;
  cash_code: string;
  cash_name: string;
}

const messages: Record<string, string> = {
  created: "Invoice saved successfully.",
  updated: "Invoice and stock quantities updated successfully.",
  invalid: "Check the invoice details.",
  "invalid-edit": "The invoice edit details are invalid.",
  "not-editable": "Only draft or posted invoices can be edited.",
  "in-ledger":
    "This invoice is already in the ledger and can no longer be edited. Use Returns, Refunds and Damaged Stock to correct it.",
  "insufficient-stock":
    "The corrected quantities exceed available branch stock.",
  "valuation-invalid":
    "Inventory valuation is inconsistent; the invoice was not changed.",
  "payments-exceed-total":
    "The new invoice total cannot be less than its recorded payments.",
  "invalid-lines": "Select at least one unique SKU.",
  "invalid-amount": "Check prices, discounts and payments.",
  "invalid-branch": "A unique active retail location is required.",
  "invalid-payment-account":
    "Select an active, eligible bank or cash account.",
  "invalid-product": "One or more products are unavailable.",
  "invalid-phone": "Enter a 10 digit mobile number, or leave it empty for a walk-in customer.",
  "approval-gone":
    "Some of the items taken on approval were already dealt with. Open Items on approval and check them.",
  "approval-mismatch":
    "The bill must include every item the customer is keeping. Nothing was saved.",
  "credit-limit": "This sale would take the customer over their credit limit. Collect some payment, or raise the limit on the customer's page.",
  failed: "Unable to save invoice. Check server logs.",
};

async function SalesContent({ searchParams }: Props) {
  const user = await requireAccess("sales");
  const { result, id, view, edit, from_report, from_approval } = await searchParams;
  const businessId = user.legal_business_id;

  const [branches] = await db.execute<RowDataPacket[]>(
    `SELECT
       b.id,
       b.branch_name AS name
     FROM acct_branches b
     JOIN acct_inventory_locations l
       ON l.legal_business_id = b.legal_business_id
      AND l.division_id = b.division_id
      AND l.branch_id = b.id
      AND l.location_type = 'RETAIL'
      AND l.status = 'ACTIVE'
     WHERE b.legal_business_id = ?
       AND b.status = 'ACTIVE'
     GROUP BY b.id, b.branch_name
     HAVING COUNT(l.id) = 1
     ORDER BY b.branch_name`,
    [businessId]
  );

  const [products] = await db.execute<RowDataPacket[]>(
    `SELECT
       v.id,
       p.id AS product_id,
       p.fabric AS fabric,
       l.branch_id AS branchId,
       p.product_name AS name,
       v.sku,
       v.unit_of_measure AS unit,
       v.status AS variant_status,
       p.status AS product_status,
       COALESCE(SUM(m.quantity_change), 0)
         AS available
     FROM acct_inventory_locations l
     JOIN acct_product_variants v
       ON v.legal_business_id = l.legal_business_id
      AND v.division_id = l.division_id
     JOIN acct_products p
       ON p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
      AND p.id = v.product_id
     LEFT JOIN acct_stock_movements m
       ON m.legal_business_id = l.legal_business_id
      AND m.division_id = l.division_id
      AND m.location_id = l.id
      AND m.variant_id = v.id
     WHERE l.legal_business_id = ?
       AND l.location_type = 'RETAIL'
       AND l.status = 'ACTIVE'
     GROUP BY
       l.id, l.branch_id, v.id, p.id, p.fabric,
       p.product_name, v.sku, v.unit_of_measure,
       v.status, p.status
     ORDER BY p.product_name, v.sku`,
    [businessId]
  );

  const [priceRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       dst.branch_id AS branchId,
       tl.variant_id,
       tl.min_selling_price,
       tl.suggested_selling_price
     FROM acct_stock_transfer_lines tl
     JOIN acct_stock_transfers t
       ON t.legal_business_id = tl.legal_business_id
      AND t.division_id = tl.division_id
      AND t.id = tl.transfer_id
     JOIN acct_inventory_locations dst
       ON dst.legal_business_id = t.legal_business_id
      AND dst.division_id = t.division_id
      AND dst.id = t.to_location_id
     WHERE t.legal_business_id = ?
       AND t.status = 'RECEIVED'
     ORDER BY t.received_at DESC, t.id DESC`,
    [businessId]
  );

  const [bankRows] = await db.execute<PaymentBankRow[]>(
    `SELECT
       id,
       bank_name,
       account_label,
       account_number_last4,
       ownership_type
     FROM acct_bank_accounts
     WHERE legal_business_id = ?
       AND ownership_type IN ('BUSINESS', 'INVESTOR')
       AND status = 'ACTIVE'
       AND verification_status = 'VERIFIED'
       AND can_receive = 1
     ORDER BY ownership_type, bank_name, id`,
    [businessId]
  );

  const [cashRows] = await db.execute<PaymentCashRow[]>(
    `SELECT id, cash_name, cash_code
     FROM acct_cash_accounts
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY cash_name, id`,
    [businessId]
  );

  const [customerRows] = await db.execute<RowDataPacket[]>(
    `SELECT c.full_name, c.phone, ROUND(c.credit_limit * 100) AS limit_paise,
            COALESCE((SELECT SUM(ROUND(h.grand_total * 100)) FROM acct_sales_headers h
                       WHERE h.legal_business_id = c.legal_business_id
                         AND h.customer_id = c.id AND h.status = 'POSTED'), 0)
          - COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
                        JOIN acct_sales_headers h2 ON h2.legal_business_id = p.legal_business_id
                         AND h2.id = p.sale_id
                       WHERE h2.legal_business_id = c.legal_business_id
                         AND h2.customer_id = c.id AND h2.status = 'POSTED'
                         AND p.status = 'RECORDED'), 0) AS dues_paise
       FROM acct_customers c
      WHERE c.legal_business_id = ? AND c.status = 'ACTIVE' AND c.phone IS NOT NULL
      ORDER BY c.id DESC
      LIMIT 500`,
    [businessId]
  );
  const customerOptions = customerRows.map(c => ({
    name: String(c.full_name),
    phone: String(c.phone),
    dues: Number(c.dues_paise) / 100,
    creditLimit: Number(c.limit_paise) / 100,
  }));

  const paymentAccounts = [
    ...bankRows.map(account => ({
      value: `BANK:${account.id}`,
      label:
        `${account.bank_name} — ${account.account_label} ` +
        `••••${account.account_number_last4}` +
        (account.ownership_type === "INVESTOR"
          ? " (Investor)"
          : ""),
    })),
    ...cashRows.map(account => ({
      value: `CASH:${account.id}`,
      label: `${account.cash_name} (${account.cash_code})`,
    })),
  ];

  const latestPrices = new Map<string, {
    minPrice: number | null;
    suggestedPrice: number | null;
  }>();

  for (const price of priceRows) {
    const key = `${price.branchId}-${price.variant_id}`;
    if (!latestPrices.has(key)) {
      latestPrices.set(key, {
        minPrice: price.min_selling_price === null
          ? null : Number(price.min_selling_price),
        suggestedPrice:
          price.suggested_selling_price === null
            ? null : Number(price.suggested_selling_price),
      });
    }
  }

  const storeOffers = await loadOffers(businessId).catch(() => []);
  const todayIst = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const billingProducts = products.map(p => {
    const pricing = latestPrices.get(`${p.branchId}-${p.id}`);
    const hit = pricing?.suggestedPrice != null
      ? bestOffer(storeOffers, "STORE", { productId: Number(p.product_id), fabric: p.fabric ? String(p.fabric) : null },
          BigInt(Math.round(pricing.suggestedPrice * 100)), todayIst)
      : null;

    return {
      id: Number(p.id),
      branchId: Number(p.branchId),
      name: String(p.name),
      sku: String(p.sku),
      unit: String(p.unit),
      available: Number(p.available),
      active:
        p.variant_status === "ACTIVE" &&
        p.product_status === "ACTIVE",
      minPrice: pricing?.minPrice ?? null,
      suggestedPrice: pricing?.suggestedPrice ?? null,
      offer: hit ? { name: hit.offer.name, offPerUnit: Number(hit.offPaise) / 100 } : null,
    };
  });

  // A "sold" line a staff member reported on WhatsApp: start the bill from it.
  let prefill:
    | {
        reportId: number;
        branchId: number | null;
        lines: Array<{ variantId: number; quantity: string; price: string }>;
        customerName?: string;
        customerPhone?: string;
        approvalItemIds?: number[];
        approvalBack?: Array<{ variantId: number; quantity: number }>;
      }
    | undefined;

  // Items a customer took home to try and has decided to keep: start the bill from them.
  const approvalIds = String(from_approval ?? "")
    .split(",").map(v => Number(v.trim()))
    .filter(v => Number.isSafeInteger(v) && v > 0).slice(0, 100);
  if (approvalIds.length > 0) {
    const [kept] = await db.execute<RowDataPacket[]>(
      `SELECT i.id, i.variant_id, i.quantity, h.from_location_id, h.holding_location_id,
              c.full_name, c.phone, l.branch_id
         FROM acct_approval_items i
         JOIN acct_approval_handouts h ON h.id = i.handout_id AND h.legal_business_id = i.legal_business_id
         JOIN acct_customers c ON c.id = i.customer_id AND c.legal_business_id = i.legal_business_id
         LEFT JOIN acct_inventory_locations l ON l.id = h.from_location_id
        WHERE i.legal_business_id = ? AND i.status = 'OUT'
          AND i.id IN (${approvalIds.map(() => "?").join(",")})
        ORDER BY i.id`,
      [businessId, ...approvalIds]
    );
    if (kept.length > 0) {
      const branch = Number(kept[0].branch_id);
      const byVariant = new Map<number, number>();
      for (const k of kept) {
        byVariant.set(Number(k.variant_id), (byVariant.get(Number(k.variant_id)) ?? 0) + Number(k.quantity));
      }
      const branchId = branches.some(b => Number(b.id) === branch) ? branch : null;
      prefill = {
        reportId: 0,
        branchId,
        lines: [...byVariant].map(([variantId, quantity]) => ({
          variantId,
          quantity: String(quantity),
          price: String(latestPrices.get(`${branchId}-${variantId}`)?.suggestedPrice ?? ""),
        })),
        customerName: String(kept[0].full_name),
        customerPhone: kept[0].phone ? String(kept[0].phone) : "",
        approvalItemIds: kept.map(k => Number(k.id)),
        approvalBack: [...byVariant].map(([variantId, quantity]) => ({ variantId, quantity })),
      };
    }
  }
  const reportId = Number(from_report);
  if (!prefill && Number.isSafeInteger(reportId) && reportId > 0) {
    const [reports] = await db.execute<RowDataPacket[]>(
      `SELECT d.id, d.variant_id, d.quantity, d.price, l.branch_id
         FROM acct_stock_drafts d
         LEFT JOIN acct_inventory_locations l ON l.id = d.location_id
        WHERE d.id = ? AND d.legal_business_id = ? AND d.action = 'SOLD'
          AND d.status IN ('PENDING', 'DONE') AND d.variant_id IS NOT NULL`,
      [reportId, businessId]
    );
    const r = reports[0];
    if (r) {
      const branch = Number(r.branch_id);
      prefill = {
        reportId: Number(r.id),
        branchId: branches.some(b => Number(b.id) === branch) ? branch : null,
        lines: [{
          variantId: Number(r.variant_id),
          quantity: String(Number(r.quantity)),
          price: r.price === null ? "" : String(Number(r.price)),
        }],
      };
    }
  }

  const selectedInvoiceId = Number(edit ?? view);
  const hasSelectedInvoice =
    Number.isSafeInteger(selectedInvoiceId) &&
    selectedInvoiceId > 0;
  const [selectedInvoices] = hasSelectedInvoice
    ? await db.execute<RowDataPacket[]>(
        `SELECT
           s.id,
           s.invoice_no,
           DATE_FORMAT(s.invoice_date, '%Y-%m-%d')
             AS invoice_date,
           s.branch_id,
           s.location_id,
           s.customer_name,
           s.customer_phone,
           s.status,
           s.subtotal,
           s.discount_amount,
           s.grand_total,
           s.remarks,
           b.branch_name
         FROM acct_sales_headers s
         JOIN acct_branches b
           ON b.legal_business_id = s.legal_business_id
          AND b.division_id = s.division_id
          AND b.id = s.branch_id
         WHERE s.legal_business_id = ?
           AND s.id = ?
         LIMIT 1`,
        [businessId, selectedInvoiceId]
      )
    : [[] as RowDataPacket[]];
  const selectedInvoice = selectedInvoices[0];
  const [selectedLines] = selectedInvoice
    ? await db.execute<RowDataPacket[]>(
        `SELECT
           sl.variant_id,
           sl.quantity,
           sl.unit_price,
           sl.discount_amount,
           sl.line_total,
           sl.price_override_reason,
           v.sku,
           v.unit_of_measure,
           p.product_name
         FROM acct_sales_lines sl
         JOIN acct_product_variants v
           ON v.legal_business_id = sl.legal_business_id
          AND v.division_id = sl.division_id
          AND v.id = sl.variant_id
         JOIN acct_products p
           ON p.legal_business_id = v.legal_business_id
          AND p.division_id = v.division_id
          AND p.id = v.product_id
         WHERE sl.legal_business_id = ?
           AND sl.sale_id = ?
         ORDER BY sl.id`,
        [businessId, selectedInvoiceId]
      )
    : [[] as RowDataPacket[]];
  const [selectedPayments] = selectedInvoice
    ? await db.execute<RowDataPacket[]>(
        `SELECT
           DATE_FORMAT(payment_date, '%Y-%m-%d')
             AS payment_date,
           payment_method, amount,
                payment_reference
         FROM acct_sales_payments
         WHERE legal_business_id = ?
           AND sale_id = ?
           AND status = 'RECORDED'
         ORDER BY id`,
        [businessId, selectedInvoiceId]
      )
    : [[] as RowDataPacket[]];
  const [selectedCollection] = selectedInvoice
    ? await db.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(amount), 0) AS collected
         FROM acct_sales_payments
         WHERE legal_business_id = ?
           AND sale_id = ?
           AND status = 'RECORDED'`,
        [businessId, selectedInvoiceId]
      )
    : [[] as RowDataPacket[]];

  const [sales] = await db.execute<RowDataPacket[]>(
    `SELECT
       s.id,
       s.invoice_no,
       DATE_FORMAT(s.invoice_date, '%Y-%m-%d')
         AS invoice_date,
       s.customer_name,
       s.customer_phone,
       s.grand_total,
       s.status,
       b.branch_name,
       COALESCE(SUM(
         CASE WHEN pay.status = 'RECORDED'
           THEN pay.amount ELSE 0 END
       ), 0) AS collected
     FROM acct_sales_headers s
     JOIN acct_branches b
       ON b.legal_business_id = s.legal_business_id
      AND b.division_id = s.division_id
      AND b.id = s.branch_id
     LEFT JOIN acct_sales_payments pay
       ON pay.legal_business_id = s.legal_business_id
      AND pay.division_id = s.division_id
      AND pay.sale_id = s.id
     WHERE s.legal_business_id = ?
     GROUP BY
       s.id, s.invoice_no, s.invoice_date,
       s.customer_name, s.customer_phone,
       s.grand_total, s.status, b.branch_name
     ORDER BY s.id DESC
     LIMIT 30`,
    [businessId]
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <main style={{
      padding: 24,
      maxWidth: 1300,
      margin: "0 auto",
    }}>
      <h1>Sales and Billing</h1>

      <nav style={{
        display: "flex",
        gap: 18,
        marginBottom: 22,
        flexWrap: "wrap",
      }}>
        <a href="/accounting/invoices">
          See all invoices
        </a>
        <a href="/accounting/returns">
          Customer returns
        </a>
      </nav>

      {result && (
        <p role="status" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          {messages[result] ?? "Request completed."}
          {result === "created" && id ? (
            <>
              {" "}
              <a className="btn-link btn-link-primary" href={`/accounting/sales/${id}`}>
                Next: view, print or take payment for this invoice
              </a>
            </>
          ) : null}
        </p>
      )}

      {edit && selectedInvoice &&
      ["DRAFT", "POSTED"].includes(selectedInvoice.status) ? (
        <>
          <h2>
            Edit Invoice {selectedInvoice.invoice_no}
          </h2>
          <p>
            {selectedInvoice.status === "POSTED"
              ? "Posted invoice edits adjust inventory and preserve recorded payments."
              : "This bill is a draft: nothing has left stock and no payment is taken yet. Press Confirm sale to finish it, or change it first."}
          </p>
          <SalesBillingForm
            customers={customerOptions}
            branches={branches.map(branch => ({
              id: Number(branch.id),
              name: String(branch.name),
            }))}
            products={billingProducts}
            paymentAccounts={paymentAccounts}
            today={today}
            initialInvoice={{
              id: Number(selectedInvoice.id),
              status: selectedInvoice.status,
              date: String(selectedInvoice.invoice_date),
              branchId: Number(selectedInvoice.branch_id),
              customerName: String(
                selectedInvoice.customer_name ?? ""
              ),
              customerPhone: String(
                selectedInvoice.customer_phone ?? ""
              ),
              invoiceDiscount: (
                Number(selectedInvoice.discount_amount) -
                selectedLines.reduce(
                  (sum, line) =>
                    sum + Number(line.discount_amount),
                  0
                )
              ).toFixed(2),
              remarks: String(selectedInvoice.remarks ?? ""),
              collected: Number(selectedCollection[0]?.collected ?? 0),
              lines: selectedLines.map(line => ({
                variantId: Number(line.variant_id),
                quantity: String(line.quantity),
                price: String(line.unit_price),
                discount: String(line.discount_amount),
                reason: String(
                  line.price_override_reason ?? ""
                ),
              })),
            }}
          />
          <a href="/accounting/sales">
            Cancel editing
          </a>
        </>
      ) : edit ? (
        <p role="status">
          Invoice not found or it is no longer editable.
        </p>
      ) : branches.length === 0 ? (
        <p>No eligible retail branch was found.</p>
      ) : (
        <SalesBillingForm
          customers={customerOptions}
          branches={branches.map(b => ({
            id: Number(b.id),
            name: String(b.name),
          }))}
          products={billingProducts}
          paymentAccounts={paymentAccounts}
          today={today}
          prefill={prefill}
        />
      )}

      <h2>Recent Sales & Invoices</h2>

      <div style={{ overflowX: "auto" }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 760 }}>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Date</th>
              <th>Branch</th>
              <th>Customer</th>
              <th>Status</th>
              <th>Total ₹</th>
              <th>Collected ₹</th>
              <th>Balance ₹</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map(s => (
              <tr key={s.id}>
                <td>{s.invoice_no}</td>
                <td>{s.invoice_date}</td>
                <td>{s.branch_name}</td>
                <td>
                  {s.customer_name ?? "Walk-in"}
                  {s.customer_phone
                    ? ` (${s.customer_phone})`
                    : ""}
                </td>
                <td>{s.status}</td>
                <td>{Number(s.grand_total).toFixed(2)}</td>
                <td>{Number(s.collected).toFixed(2)}</td>
                <td>
                  {(
                    Number(s.grand_total) -
                    Number(s.collected)
                  ).toFixed(2)}
                </td>
                <td>
                  <div style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}>
                    {s.status === "POSTED" && Number(s.grand_total) - Number(s.collected) > 0.004 && (
                      <a className="btn-link btn-link-small btn-link-primary" href={`/accounting/sales/${s.id}#take-payment`}>
                        Take payment
                      </a>
                    )}
                    <a className="btn-link btn-link-small" href={`/accounting/sales?view=${s.id}`}>
                      View
                    </a>
                    {s.status === "DRAFT" && (
                      <a className="btn-link btn-link-small btn-link-primary" href={`/accounting/sales?edit=${s.id}`}>
                        Confirm sale
                      </a>
                    )}
                    {["DRAFT", "POSTED"].includes(s.status) && (
                      <a className="btn-link btn-link-small" href={`/accounting/sales?edit=${s.id}`}>
                        Edit
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {view && selectedInvoice && (
        <section style={{
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 20,
          marginTop: 24,
        }}>
          <h2>Invoice {selectedInvoice.invoice_no}</h2>
          {selectedInvoice.status === "POSTED" && (
            <p>
              <a className="btn-link btn-link-primary" href={`/accounting/sales/${selectedInvoice.id}#take-payment`}>
                Take payment or print this invoice
              </a>
            </p>
          )}
          <p>
            {selectedInvoice.invoice_date} · {selectedInvoice.branch_name}
            {" · "}{selectedInvoice.status}
          </p>
          <p>
            Customer: {selectedInvoice.customer_name || "Walk-in"}
            {selectedInvoice.customer_phone
              ? ` (${selectedInvoice.customer_phone})`
              : ""}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
            }}>
              <thead>
                <tr>
                  <th>Product / SKU</th>
                  <th>Qty</th>
                  <th>Rate ₹</th>
                  <th>Discount ₹</th>
                  <th>Line Total ₹</th>
                </tr>
              </thead>
              <tbody>
                {selectedLines.map((line, index) => (
                  <tr key={`${line.variant_id}-${index}`}>
                    <td>
                      {line.product_name} — {line.sku}
                    </td>
                    <td>
                      {line.quantity} {line.unit_of_measure}
                    </td>
                    <td>{Number(line.unit_price).toFixed(2)}</td>
                    <td>
                      {Number(line.discount_amount).toFixed(2)}
                    </td>
                    <td>{Number(line.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Invoice Total: ₹
            {Number(selectedInvoice.grand_total).toFixed(2)}
          </p>
          <h3>Recorded Payments</h3>
          {selectedPayments.length === 0 ? (
            <p>No recorded payments.</p>
          ) : (
            <ul>
              {selectedPayments.map((payment, index) => (
                <li key={index}>
                  {payment.payment_date} ·{" "}
                  {String(payment.payment_method).replaceAll("_", " ")}
                  {" · ₹"}{Number(payment.amount).toFixed(2)}
                  {payment.payment_reference
                    ? ` · Ref: ${payment.payment_reference}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
          {selectedInvoice.remarks && (
            <p>Remarks: {selectedInvoice.remarks}</p>
          )}
          <a href="/accounting/sales">Close invoice details</a>
        </section>
      )}
    </main>
  );
}

export default function SalesPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading sales...</p>}>
      <SalesContent {...props} />
    </Suspense>
  );
}
