
"use client";

import { useMemo, useState } from "react";
import styles from "./SalesBillingForm.module.css";
import {
  createSaleAction,
  updateSaleAction,
} from "@/lib/sales-actions";

type Branch = {
  id: number;
  name: string;
};

type ProductOption = {
  id: number;
  branchId: number;
  name: string;
  sku: string;
  unit: string;
  available: number;
  active: boolean;
  minPrice: number | null;
  suggestedPrice: number | null;
};

type SaleRow = {
  key: number;
  variantId: number;
  quantity: string;
  price: string;
  discount: string;
  reason: string;
};

type PaymentRow = {
  key: number;
  method: string;
  amount: string;
  reference: string;
  account: string;
};

type PaymentAccountOption = {
  value: string;
  label: string;
};

type InitialInvoice = {
  id: number;
  status: "DRAFT" | "POSTED";
  date: string;
  branchId: number;
  customerName: string;
  customerPhone: string;
  invoiceDiscount: string;
  remarks: string;
  collected: number;
  lines: Array<{
    variantId: number;
    quantity: string;
    price: string;
    discount: string;
    reason: string;
  }>;
};

type CustomerOption = {
  name: string;
  phone: string;
  dues: number;
  creditLimit: number;
};

type Prefill = {
  reportId: number;
  branchId: number | null;
  lines: Array<{ variantId: number; quantity: string; price: string }>;
};

type Props = {
  prefill?: Prefill;
  customers?: CustomerOption[];
  branches: Branch[];
  products: ProductOption[];
  paymentAccounts: PaymentAccountOption[];
  today: string;
  initialInvoice?: InitialInvoice;
};

const inputStyle: React.CSSProperties = {
  padding: 9,
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  width: "100%",
};

function amount(n: number): string {
  return Number.isFinite(n)
    ? n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";
}

const newSaleRow = (): SaleRow => ({
  key: Date.now() + Math.random(),
  variantId: 0,
  quantity: "1",
  price: "",
  discount: "0",
  reason: "",
});

const newPaymentRow = (): PaymentRow => ({
  key: Date.now() + Math.random(),
  method: "CASH",
  amount: "",
  reference: "",
  account: "",
});

export default function SalesBillingForm({
  customers = [],
  branches,
  products,
  paymentAccounts,
  today,
  initialInvoice,
  prefill,
}: Props) {
  const [custPhone, setCustPhone] = useState(initialInvoice?.customerPhone ?? "");
  const [custName, setCustName] = useState(initialInvoice?.customerName ?? "");
  const digits = custPhone.replace(/\D/g, "").slice(-10);
  const known = digits.length === 10 ? customers.find(c => c.phone === digits) : undefined;

  const [branchId, setBranchId] = useState(
    initialInvoice?.branchId ?? prefill?.branchId ?? branches[0]?.id ?? 0
  );
  const [rows, setRows] = useState<SaleRow[]>(
    initialInvoice
      ? initialInvoice.lines.map(line => ({
          key: line.variantId,
          variantId: line.variantId,
          quantity: line.quantity,
          price: line.price,
          discount: line.discount,
          reason: line.reason,
        }))
      : prefill
        ? prefill.lines.map(line => ({
            ...newSaleRow(),
            variantId: line.variantId,
            quantity: line.quantity,
            price: line.price,
          }))
        : [newSaleRow()]
  );
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(
    initialInvoice?.invoiceDiscount ?? "0"
  );
  const editing = initialInvoice != null;
  const action = editing ? updateSaleAction : createSaleAction;

  const branchProducts = products.filter(
    product =>
      product.branchId === branchId &&
      (
        (product.active && product.available > 0) ||
        rows.some(row => row.variantId === product.id)
      )
  );

  const productMap = useMemo(
    () => new Map(
      products.map(product => [
        `${product.branchId}-${product.id}`,
        product,
      ])
    ),
    [products]
  );

  function findProduct(variantId: number) {
    const product = productMap.get(`${branchId}-${variantId}`);
    if (!product || !initialInvoice) return product;

    const restoredQuantity = initialInvoice.lines
      .filter(line => line.variantId === variantId)
      .reduce((sum, line) => sum + Number(line.quantity), 0);

    return {
      ...product,
      available: product.available + restoredQuantity,
    };
  }

  function updateRow(
    key: number,
    patch: Partial<SaleRow>
  ) {
    setRows(current => current.map(row =>
      row.key === key ? { ...row, ...patch } : row
    ));
  }

  function updatePayment(
    key: number,
    patch: Partial<PaymentRow>
  ) {
    setPayments(current => current.map(payment =>
      payment.key === key
        ? { ...payment, ...patch }
        : payment
    ));
  }

  const lineTotals = rows.map(row => {
    const gross =
      Number(row.quantity || 0) *
      Number(row.price || 0);

    return Math.max(
      0,
      Math.round(gross * 100) / 100 -
        Number(row.discount || 0)
    );
  });

  const subtotal = lineTotals.reduce(
    (sum, line) => sum + line, 0
  );

  const grandTotal = Math.max(
    0, subtotal - Number(invoiceDiscount || 0)
  );

  const collected = payments.reduce(
    (sum, payment) =>
      sum + Number(payment.amount || 0),
    0
  );

  const outstanding = grandTotal - collected;

  const overStock = rows.some(r => {
    const p = findProduct(r.variantId);
    return p != null && Number(r.quantity) > p.available;
  });
  const firstCash = paymentAccounts.find(a => a.value.startsWith("CASH:"));

  function payFull() {
    if (!firstCash || grandTotal <= 0) return;
    setPayments([
      {
        ...newPaymentRow(),
        method: "CASH",
        amount: grandTotal.toFixed(2),
        account: firstCash.value,
      },
    ]);
  }

  return (
    <form action={action} className={styles.form}>
      {initialInvoice && (
        <input type="hidden" name="sale_id" value={initialInvoice.id} />
      )}
      {prefill && !initialInvoice && (
        <>
          <input type="hidden" name="report_id" value={prefill.reportId} />
          <p style={{ background: "#eff6ff", padding: 10, borderRadius: 8 }}>
            Filled from what your staff reported on WhatsApp. Add the customer and
            payment, then save the bill.
          </p>
        </>
      )}
      <input
        type="hidden"
        name="lines_json"
        value={JSON.stringify(
          rows.filter(r => r.variantId > 0).map(r => ({
            variantId: r.variantId,
            quantity: r.quantity,
            price: r.price,
            discount: r.discount,
            overrideReason: r.reason,
          }))
        )}
      />
      <input
        type="hidden"
        name="payments_json"
        value={JSON.stringify(
          payments
            .filter(p => Number(p.amount) > 0)
            .map(p => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              account: p.account,
            }))
        )}
      />

      {/* 1. Customer */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span className={styles.step}>1</span> Who is buying?
        </h2>
        <div className={styles.grid2}>
          <label className={styles.field}>
            Customer mobile number
            <input
              name="customer_phone"
              type="tel"
              inputMode="numeric"
              list="known-customers"
              placeholder="10 digits (empty = walk-in)"
              maxLength={20}
              value={custPhone}
              onChange={e => {
                const v = e.target.value;
                setCustPhone(v);
                const d = v.replace(/\D/g, "").slice(-10);
                const match =
                  d.length === 10 ? customers.find(c => c.phone === d) : undefined;
                if (match && custName.trim() === "") setCustName(match.name);
              }}
            />
            <datalist id="known-customers">
              {customers.slice(0, 300).map(c => (
                <option key={c.phone} value={c.phone}>{c.name}</option>
              ))}
            </datalist>
          </label>

          <label className={styles.field}>
            Customer name
            <input
              name="customer_name"
              placeholder="Walk-in customer"
              maxLength={150}
              value={custName}
              onChange={e => setCustName(e.target.value)}
            />
          </label>
        </div>

        {digits.length === 10 && (
          <p
            role="status"
            className={`${styles.hint} ${
              !known ? styles.hintNew : known.dues > 0 ? styles.hintOwes : styles.hintOk
            }`}
          >
            {known
              ? `Existing customer: ${known.name}. ${
                  known.dues > 0 ? `Still owes ₹${amount(known.dues)}.` : "No dues."
                }${
                  known.creditLimit > 0 ? ` Credit limit ₹${amount(known.creditLimit)}.` : ""
                }`
              : "New customer. They will be saved automatically with this sale."}
          </p>
        )}

        <details className={styles.more}>
          <summary>Shop and date: {branches.find(b => b.id === branchId)?.name ?? ""}</summary>
          <div className={styles.grid2} style={{ marginTop: 10 }}>
            <label className={styles.field}>
              Shop / branch
              {editing ? (
                <>
                  <input type="hidden" name="branch_id" value={branchId} />
                  <input
                    value={branches.find(b => b.id === branchId)?.name ?? ""}
                    readOnly
                  />
                </>
              ) : (
                <select
                  name="branch_id"
                  value={branchId}
                  onChange={e => {
                    setBranchId(Number(e.target.value));
                    setRows([newSaleRow()]);
                  }}
                  required
                >
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              )}
            </label>
            <label className={styles.field}>
              Bill date
              <input
                name="invoice_date"
                type="date"
                defaultValue={initialInvoice?.date ?? today}
                disabled={initialInvoice?.status === "POSTED"}
                required
              />
              {initialInvoice?.status === "POSTED" && (
                <input type="hidden" name="invoice_date" value={initialInvoice.date} />
              )}
            </label>
          </div>
        </details>
      </section>

      {/* 2. Items */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span className={styles.step}>2</span> What are they buying?
        </h2>

        <div className={styles.items}>
          {rows.map((row, index) => {
            const product = findProduct(row.variantId);
            const price = Number(row.price || 0);
            const min = product?.minPrice;
            const fractionalQuantity = product?.unit === "METER";
            const belowMinimum = min != null && price < min;
            const insufficient =
              product != null && Number(row.quantity) > product.available;

            return (
              <div key={row.key} className={styles.item}>
                <label className={styles.field}>
                  Product
                  <select
                    value={row.variantId}
                    onChange={e => {
                      const id = Number(e.target.value);
                      const selected = findProduct(id);
                      updateRow(row.key, {
                        variantId: id,
                        price:
                          selected?.suggestedPrice != null
                            ? String(selected.suggestedPrice)
                            : selected?.minPrice != null
                              ? String(selected.minPrice)
                              : "",
                        reason: "",
                      });
                    }}
                    required={index === 0}
                  >
                    <option value={0}>Choose a product</option>
                    {branchProducts.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.sku}
                        {!p.active ? " (inactive)" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {product && (
                  <p className={insufficient ? styles.bad : styles.stock}>
                    {insufficient
                      ? `Not enough stock: only ${product.available} ${product.unit} available`
                      : `In stock: ${product.available} ${product.unit}`}
                  </p>
                )}

                <div className={styles.itemNums}>
                  <label className={styles.field}>
                    Quantity
                    <input
                      type="number"
                      inputMode="decimal"
                      min={fractionalQuantity ? "0.001" : "1"}
                      step={fractionalQuantity ? "0.001" : "1"}
                      value={row.quantity}
                      onChange={e => updateRow(row.key, { quantity: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Price ₹
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={row.price}
                      onChange={e => updateRow(row.key, { price: e.target.value })}
                    />
                  </label>
                  <label className={styles.field}>
                    Discount ₹
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={row.discount}
                      onChange={e => updateRow(row.key, { discount: e.target.value })}
                    />
                  </label>
                  <div className={styles.lineTotal}>
                    <span>Amount</span>
                    <strong>₹{amount(lineTotals[index])}</strong>
                  </div>
                </div>

                {belowMinimum && (
                  <>
                    <p className={styles.warn}>
                      Price is below the minimum ₹{amount(min)}. You may continue.
                    </p>
                    <label className={styles.field}>
                      Reason (optional)
                      <input
                        value={row.reason}
                        maxLength={300}
                        onChange={e => updateRow(row.key, { reason: e.target.value })}
                      />
                    </label>
                  </>
                )}

                {rows.length > 1 && (
                  <div className={styles.itemFoot}>
                    <span />
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnDanger}`}
                      onClick={() =>
                        setRows(current => current.filter(r => r.key !== row.key))
                      }
                    >
                      Remove this item
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.btn}
          style={{ marginTop: 12 }}
          onClick={() => setRows(current => [...current, newSaleRow()])}
        >
          + Add another item
        </button>
      </section>

      {/* 3. Total and payment */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          <span className={styles.step}>3</span> Total and payment
        </h2>

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Items total</span>
            <strong>₹{amount(subtotal)}</strong>
          </div>
          <label className={`${styles.field}`}>
            Extra discount on the whole bill ₹
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              name="invoice_discount"
              value={invoiceDiscount}
              onChange={e => setInvoiceDiscount(e.target.value)}
            />
          </label>
          <div className={`${styles.totalRow} ${styles.grand}`}>
            <strong>Bill total</strong>
            <strong>₹{amount(grandTotal)}</strong>
          </div>
        </div>

        {editing ? (
          <p style={{ color: "#475569" }}>
            Payments already received (₹{amount(initialInvoice.collected)}) are kept.
            The new bill total cannot be less than this.
          </p>
        ) : (
          <div style={{ marginTop: 18 }}>
            <h3 style={{ margin: "0 0 8px" }}>Did the customer pay now?</h3>
            {paymentAccounts.length === 0 && (
              <p role="status" className={styles.warn}>
                No bank or cash account is ready to receive money. Ask the owner to set one up.
              </p>
            )}

            <div className={styles.quick}>
              <button
                type="button"
                className={styles.btn}
                disabled={!firstCash || grandTotal <= 0}
                onClick={payFull}
              >
                Paid in full (cash)
              </button>
              <button
                type="button"
                className={styles.btn}
                disabled={paymentAccounts.length === 0}
                onClick={() => setPayments(current => [...current, newPaymentRow()])}
              >
                Add a payment (UPI, card, part payment)
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnQuiet}`}
                disabled={payments.length === 0}
                onClick={() => setPayments([])}
              >
                Pay later (credit)
              </button>
            </div>

            {payments.map(payment => (
              <div key={payment.key} className={styles.pay}>
                <label className={styles.field}>
                  How
                  <select
                    value={payment.method}
                    onChange={e =>
                      updatePayment(payment.key, { method: e.target.value, account: "" })
                    }
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className={styles.field}>
                  Money goes into
                  <select
                    value={payment.account}
                    onChange={e => updatePayment(payment.key, { account: e.target.value })}
                    required={Number(payment.amount) > 0}
                  >
                    <option value="">Choose account</option>
                    {paymentAccounts
                      .filter(account =>
                        payment.method === "CASH"
                          ? account.value.startsWith("CASH:")
                          : account.value.startsWith("BANK:")
                      )
                      .map(account => (
                        <option key={account.value} value={account.value}>
                          {account.label}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Amount ₹
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    value={payment.amount}
                    onChange={e => updatePayment(payment.key, { amount: e.target.value })}
                  />
                </label>
                <label className={styles.field}>
                  Reference (optional)
                  <input
                    value={payment.reference}
                    onChange={e => updatePayment(payment.key, { reference: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnDanger}`}
                  onClick={() =>
                    setPayments(current => current.filter(p => p.key !== payment.key))
                  }
                >
                  Remove
                </button>
              </div>
            ))}

            <div className={styles.balance}>
              <div>
                <div>Paid now</div>
                <strong>₹{amount(collected)}</strong>
              </div>
              <div>
                <div>Customer will owe</div>
                <strong style={{ color: outstanding > 0 ? "#b45309" : undefined }}>
                  ₹{amount(Math.max(outstanding, 0))}
                </strong>
              </div>
            </div>

            {outstanding < 0 && (
              <p className={styles.bad}>The payment is more than the bill total.</p>
            )}
          </div>
        )}

        <label className={styles.field} style={{ marginTop: 16 }}>
          Note (optional)
          <textarea
            name="remarks"
            maxLength={500}
            rows={2}
            defaultValue={initialInvoice?.remarks ?? ""}
          />
        </label>
      </section>

      <div className={styles.actions}>
        {editing ? (
          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={overStock}
          >
            Save changes to this bill
          </button>
        ) : (
          <>
            <button
              type="submit"
              name="mode"
              value="POSTED"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={outstanding < 0 || overStock}
            >
              Confirm sale
            </button>
            <button
              type="submit"
              name="mode"
              value="DRAFT"
              className={`${styles.btn} ${styles.btnQuiet}`}
              disabled={payments.length > 0}
              title="Keeps the bill without changing stock. Cannot be used when a payment is entered."
            >
              Save for later
            </button>
          </>
        )}
      </div>
    </form>
  );
}
