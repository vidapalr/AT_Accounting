
"use client";

import { useMemo, useState } from "react";
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

type Props = {
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
}: Props) {
  const [custPhone, setCustPhone] = useState(initialInvoice?.customerPhone ?? "");
  const [custName, setCustName] = useState(initialInvoice?.customerName ?? "");
  const digits = custPhone.replace(/\D/g, "").slice(-10);
  const known = digits.length === 10 ? customers.find(c => c.phone === digits) : undefined;

  const [branchId, setBranchId] = useState(
    initialInvoice?.branchId ?? branches[0]?.id ?? 0
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

  return (
    <form action={action} style={{
      display: "grid",
      gap: 20,
      marginBottom: 36,
    }}>
      {initialInvoice && (
        <input
          type="hidden"
          name="sale_id"
          value={initialInvoice.id}
        />
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

      <section style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
      }}>
        <label>
          Sales Branch
          {editing ? (
            <>
              <input
                type="hidden"
                name="branch_id"
                value={branchId}
              />
              <input
                value={
                  branches.find(branch => branch.id === branchId)
                    ?.name ?? ""
                }
                readOnly
                style={inputStyle}
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
              style={inputStyle}
              required
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label>
          Invoice Date
          <input
            name="invoice_date"
            type="date"
            defaultValue={initialInvoice?.date ?? today}
            disabled={
              initialInvoice?.status === "POSTED"
            }
            required
            style={inputStyle}
          />
          {initialInvoice?.status === "POSTED" && (
            <input
              type="hidden"
              name="invoice_date"
              value={initialInvoice.date}
            />
          )}
        </label>

        <label>
          Customer Mobile
          <input
            name="customer_phone"
            type="tel"
            inputMode="numeric"
            list="known-customers"
            placeholder="10 digit mobile (leave empty for walk-in)"
            maxLength={20}
            value={custPhone}
            onChange={e => {
              const v = e.target.value;
              setCustPhone(v);
              const d = v.replace(/\D/g, "").slice(-10);
              const match = d.length === 10 ? customers.find(c => c.phone === d) : undefined;
              if (match && custName.trim() === "") setCustName(match.name);
            }}
            style={inputStyle}
          />
          <datalist id="known-customers">
            {customers.slice(0, 300).map(c => (
              <option key={c.phone} value={c.phone}>{c.name}</option>
            ))}
          </datalist>
        </label>

        <label>
          Customer Name
          <input
            name="customer_name"
            placeholder="Walk-in customer"
            maxLength={150}
            value={custName}
            onChange={e => setCustName(e.target.value)}
            style={inputStyle}
          />
        </label>

        {digits.length === 10 && (
          <p
            role="status"
            style={{
              gridColumn: "1 / -1",
              margin: 0,
              padding: "8px 12px",
              borderRadius: 8,
              background: known ? (known.dues > 0 ? "#fffbeb" : "#f0fdf4") : "#eff6ff",
              color: "#1e293b",
            }}
          >
            {known
              ? `Existing customer: ${known.name}. ${
                  known.dues > 0 ? `Still owes ₹${amount(known.dues)}.` : "No dues."
                }${
                  known.creditLimit > 0
                    ? ` Credit limit ₹${amount(known.creditLimit)}.`
                    : ""
                }`
              : "New customer. They will be saved automatically with this sale."}
          </p>
        )}
      </section>

      <section>
        <h2>Invoice Items</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{
            borderCollapse: "collapse",
            width: "100%",
            minWidth: 850,
          }}>
            <thead>
              <tr>
                <th>Product / SKU</th>
                <th>Available</th>
                <th>Qty</th>
                <th>Rate ₹</th>
                <th>Discount ₹</th>
                <th>Total ₹</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, index) => {
                const product = findProduct(row.variantId);
                const price = Number(row.price || 0);
                const min = product?.minPrice;
                const fractionalQuantity =
                  product?.unit === "METER";

                const belowMinimum =
                  min != null && price < min;

                const insufficient =
                  product != null &&
                  Number(row.quantity) > product.available;

                return (
                  <tr key={row.key}>
                    <td style={{ padding: 6, minWidth: 270 }}>
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
                        style={inputStyle}
                        required={index === 0}
                      >
                        <option value={0}>Select item</option>
                        {branchProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {p.sku}
                            {!p.active ? " (inactive)" : ""}
                          </option>
                        ))}
                      </select>

                      {belowMinimum && (
                        <p style={{
                          color: "#b45309",
                          fontSize: 12,
                          margin: "5px 0",
                        }}>
                          Below minimum ₹{amount(min)}
                          — override permitted
                        </p>
                      )}

                      {belowMinimum && (
                        <input
                          placeholder="Reason (optional)"
                          value={row.reason}
                          maxLength={300}
                          onChange={e =>
                            updateRow(row.key, {
                              reason: e.target.value,
                            })
                          }
                          style={inputStyle}
                        />
                      )}
                    </td>

                    <td style={{ padding: 6 }}>
                      {product
                        ? `${product.available} ${product.unit}`
                        : "—"}
                      {insufficient && (
                        <p style={{
                          color: "#b91c1c",
                          fontSize: 12,
                        }}>
                          Insufficient stock
                        </p>
                      )}
                    </td>

                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        min={fractionalQuantity ? "0.001" : "1"}
                        step={fractionalQuantity ? "0.001" : "1"}
                        value={row.quantity}
                        onChange={e =>
                          updateRow(row.key, {
                            quantity: e.target.value,
                          })
                        }
                        style={{ ...inputStyle, width: 90 }}
                      />
                    </td>

                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.price}
                        onChange={e =>
                          updateRow(row.key, {
                            price: e.target.value,
                          })
                        }
                        style={{ ...inputStyle, width: 110 }}
                      />
                    </td>

                    <td style={{ padding: 6 }}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.discount}
                        onChange={e =>
                          updateRow(row.key, {
                            discount: e.target.value,
                          })
                        }
                        style={{ ...inputStyle, width: 100 }}
                      />
                    </td>

                    <td style={{ padding: 6 }}>
                      ₹{amount(lineTotals[index])}
                    </td>

                    <td style={{ padding: 6 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setRows(current =>
                            current.filter(r => r.key !== row.key)
                          )
                        }
                        disabled={rows.length === 1}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() =>
            setRows(current => [...current, newSaleRow()])
          }
          style={{ padding: 10, marginTop: 10 }}
        >
          + Add Item
        </button>

      </section>

      <section style={{
        display: "grid",
        gap: 12,
        maxWidth: 440,
        marginLeft: "auto",
        width: "100%",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
        }}>
          <span>Items Total</span>
          <strong>₹{amount(subtotal)}</strong>
        </div>

        <label>
          Additional Invoice Discount ₹
          <input
            type="number"
            min="0"
            step="0.01"
            name="invoice_discount"
            value={invoiceDiscount}
            onChange={e =>
              setInvoiceDiscount(e.target.value)
            }
            style={inputStyle}
          />
        </label>

        <div style={{
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid #cbd5e1",
          paddingTop: 12,
        }}>
          <strong>Invoice Total</strong>
          <strong style={{ fontSize: 24 }}>
            ₹{amount(grandTotal)}
          </strong>
        </div>
      </section>

      {editing ? (
        <section>
          <h2>Recorded Payments</h2>
          <p>
            Existing collections of ₹
            {amount(initialInvoice.collected)} are preserved.
            Update the invoice total so it is not less than
            the collected amount.
          </p>
        </section>
      ) : (
      <section>
        <h2>Payment Collection</h2>
        <p>
          Enter full or partial collection. Leave payment
          empty for a credit sale.
        </p>
        {paymentAccounts.length === 0 && (
          <p role="status">
            No active receiving bank or cash accounts are available.
            Add or activate an account before recording a collection.
          </p>
        )}

        {payments.map(payment => (
          <div key={payment.key} style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 12,
          }}>
            <label style={{ minWidth: 165 }}>
              Payment Type
              <select
                value={payment.method}
                onChange={e =>
                  updatePayment(payment.key, {
                    method: e.target.value,
                    account: "",
                  })
                }
                style={{ ...inputStyle, marginTop: 5 }}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="OTHER">Others</option>
              </select>
            </label>

            <label style={{ minWidth: 280 }}>
              Receiving Account
              <select
                value={payment.account}
                onChange={e =>
                  updatePayment(payment.key, {
                    account: e.target.value,
                  })
                }
                style={{ ...inputStyle, width: 280 }}
                required={Number(payment.amount) > 0}
              >
                <option value="">Select Receiving Account</option>
                {paymentAccounts
                  .filter(account =>
                    payment.method === "CASH"
                      ? account.value.startsWith("CASH:")
                      : account.value.startsWith("BANK:")
                  )
                  .map(account => (
                    <option
                      key={account.value}
                      value={account.value}
                    >
                      {account.label}
                    </option>
                  ))}
              </select>
            </label>

            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount ₹"
              value={payment.amount}
              onChange={e =>
                updatePayment(payment.key, {
                  amount: e.target.value,
                })
              }
              style={{ ...inputStyle, width: 145 }}
            />

            <input
              placeholder="Payment reference (optional)"
              value={payment.reference}
              onChange={e =>
                updatePayment(payment.key, {
                  reference: e.target.value,
                })
              }
              style={{ ...inputStyle, width: 220 }}
            />

            <button
              type="button"
              onClick={() =>
                setPayments(current =>
                  current.filter(p => p.key !== payment.key)
                )
              }
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={paymentAccounts.length === 0}
          onClick={() =>
            setPayments(current => [
              ...current, newPaymentRow(),
            ])
          }
        >
          + Add Payment
        </button>

        <div style={{
          display: "flex",
          gap: 26,
          marginTop: 20,
          flexWrap: "wrap",
        }}>
          <div>
            <div>Collected</div>
            <strong>₹{amount(collected)}</strong>
          </div>
          <div>
            <div>Customer Balance</div>
            <strong>₹{amount(outstanding)}</strong>
          </div>
        </div>

        {outstanding < 0 && (
          <p style={{ color: "#b91c1c" }}>
            Collection exceeds the invoice total.
          </p>
        )}
      </section>
      )}

      <label>
        Invoice Remarks (optional)
        <textarea
          name="remarks"
          maxLength={500}
          rows={2}
          defaultValue={initialInvoice?.remarks ?? ""}
          style={inputStyle}
        />
      </label>

      <div style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
      }}>
        {editing ? (
          <button
            type="submit"
            disabled={
              rows.some(r => {
                const p = findProduct(r.variantId);
                return p != null &&
                  Number(r.quantity) > p.available;
              })
            }
            style={{ padding: "12px 20px" }}
          >
            Update Invoice
          </button>
        ) : (
          <>
            <button
              type="submit"
              name="mode"
              value="DRAFT"
              disabled={payments.length > 0}
              style={{ padding: "12px 20px" }}
            >
              Save Draft
            </button>
            <button
              type="submit"
              name="mode"
              value="POSTED"
              disabled={
                outstanding < 0 ||
                rows.some(r => {
                  const p = findProduct(r.variantId);
                  return p != null &&
                    Number(r.quantity) > p.available;
                })
              }
              style={{ padding: "12px 20px" }}
            >
              Confirm Sale & Update Stock
            </button>
          </>
        )}
      </div>
    </form>
  );
}
