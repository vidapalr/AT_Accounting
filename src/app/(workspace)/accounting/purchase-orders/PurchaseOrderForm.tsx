"use client";

import { useState } from "react";

import QuickSupplierSelect from "@/components/accounting/quick-supplier-select";
import SubmitButton from "@/components/SubmitButton";
import { savePurchaseOrderAction } from "@/lib/purchase-order-actions";

type Choices = {
  suppliers: { id: number; supplier_code: string; supplier_name: string }[];
  locations: { id: number; location_code: string; location_name: string }[];
  skus: { id: number; sku: string; product_name: string; size_label: string | null; color_name: string | null; unit_of_measure: string }[];
};
export type OrderToEdit = {
  id: number; supplierId: number; locationId: number; orderDate: string; expectedDate: string; remarks: string;
  lines: { variantId: number; quantity: string; unitCost: string }[];
};

const control: React.CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", padding: "10px 12px", marginTop: 5, border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 16 };
const trim = (v: string) => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

export default function PurchaseOrderForm({ choices, order, today }: { choices: Choices; order?: OrderToEdit; today: string }) {
  const [count, setCount] = useState(Math.max(order?.lines.length ?? 0, 3));
  return (
    <form action={savePurchaseOrderAction} style={{ display: "grid", gap: 14 }}>
      {order && <input type="hidden" name="order_id" value={order.id} />}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <QuickSupplierSelect initialSuppliers={choices.suppliers} selectedSupplierId={order ? String(order.supplierId) : ""} />
        <label>Deliver to
          <select name="location_id" required defaultValue={order ? String(order.locationId) : choices.locations.length === 1 ? String(choices.locations[0].id) : ""} style={control}>
            <option value="" disabled>Choose…</option>
            {choices.locations.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}
          </select>
        </label>
        <label>Order date<input type="date" name="order_date" required defaultValue={order?.orderDate ?? today} style={control} /></label>
        <label>Expected on (optional)<input type="date" name="expected_date" defaultValue={order?.expectedDate ?? ""} style={control} /></label>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr><th style={{ textAlign: "left" }}>Item</th><th style={{ textAlign: "left" }}>Quantity</th><th style={{ textAlign: "left" }}>Agreed price each (₹)</th></tr></thead>
          <tbody>
            {Array.from({ length: count }, (_, i) => {
              const saved = order?.lines[i];
              return (
                <tr key={i}>
                  <td style={{ paddingRight: 8 }}>
                    <select name={`line_${i}_variant`} defaultValue={saved ? String(saved.variantId) : ""} style={control}>
                      <option value="">Choose item…</option>
                      {choices.skus.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sku} — {s.product_name}{s.size_label ? ` / ${s.size_label}` : ""}{s.color_name ? ` / ${s.color_name}` : ""} ({s.unit_of_measure})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ paddingRight: 8 }}><input name={`line_${i}_quantity`} inputMode="decimal" defaultValue={saved ? trim(saved.quantity) : ""} style={control} /></td>
                  <td><input name={`line_${i}_cost`} inputMode="decimal" defaultValue={saved ? trim(saved.unitCost) : ""} style={control} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="btn-link" style={{ marginTop: 8 }} onClick={() => setCount((c) => Math.min(c + 1, 100))}>+ Add another item</button>
      </div>

      <label>Note for the supplier (optional)<textarea name="remarks" rows={2} maxLength={500} defaultValue={order?.remarks ?? ""} style={control} /></label>
      <div><SubmitButton label={order ? "Save changes" : "Save order"} /></div>
    </form>
  );
}
