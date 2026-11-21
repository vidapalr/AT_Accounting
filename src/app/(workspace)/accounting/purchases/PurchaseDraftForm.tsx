"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import QuickSupplierSelect from "@/components/accounting/quick-supplier-select";
import {
  createPurchaseDraftAction,
  updatePurchaseDraftAction,
  editReceivedPurchaseAction,
} from "@/lib/purchase-actions";
import { quickCreateItemAction } from "@/lib/quick-item-actions";

import styles from "./purchases.module.css";

type Supplier = {
  id: number;
  supplier_code: string;
  supplier_name: string;
};

type Location = {
  id: number;
  location_code: string;
  location_name: string;
};

type SKU = {
  id: number;
  sku: string;
  product_name: string;
  size_label: string | null;
  color_name: string | null;
  unit_of_measure: string;
};

export type PurchaseDraft = {
  id: number;
  purchase_no: string;
  supplier_id: number;
  supplier_invoice_no: string | null;
  invoice_date: string;
  location_id: number;
  remarks: string | null;
  /** Goods already received: saving reverses the old entry and posts again. */
  received?: boolean;
  /** GST total printed on the supplier's bill (optional). */
  billTax?: string;
  lines: Array<{
    variant_id: number;
    quantity: string;
    unit_cost: string;
    lot_no?: string;
  }>;
};

export type Prefill = {
  locationId: number | null;
  reportIds: number[];
  lines: Array<{ variant_id: number; quantity: string }>;
};

type Props = {
  prefill?: Prefill;
  suppliers: Supplier[];
  locations: Location[];
  skus: SKU[];
  /** Product groups, for New item. */
  categories?: Array<{ id: number; name: string }>;
  /** The item's current usual selling price (variant id -> rupees), shown on the line. */
  prices?: Record<number, string>;
  draft?: PurchaseDraft;
  /** The business charges GST: costs are as on the supplier's bill, GST included. */
  gstOn?: boolean;
};

const MAX_LINE_COUNT = 100;

export default function PurchaseDraftForm({
  suppliers,
  locations,
  skus: initialSkus,
  categories = [],
  prices = {},
  draft,
  prefill,
  gstOn = false,
}: Props) {
  const [lineCount, setLineCount] = useState(
    Math.max(draft?.lines.length ?? prefill?.lines.length ?? 0, 1)
  );
  // Items can be added while typing the purchase (New item), so the list lives in state.
  const [skus, setSkus] = useState<SKU[]>(initialSkus);
  const startLine = (i: number) => String(draft?.lines[i]?.variant_id ?? prefill?.lines[i]?.variant_id ?? "");
  const [chosen, setChosen] = useState<string[]>(() => Array.from({ length: MAX_LINE_COUNT }, (_, i) => startLine(i)));
  const [priceText, setPriceText] = useState<string[]>(() => Array.from({ length: MAX_LINE_COUNT }, (_, i) => prices[Number(startLine(i))] ?? ""));
  const [newFor, setNewFor] = useState<number | null>(null);
  const [newItem, setNewItem] = useState({ productName: "", categoryId: categories[0]?.id ?? 0, size: "", color: "", unit: "PCS" as "PCS" | "SET" | "METER" });
  const [newError, setNewError] = useState("");
  const [saving, startSaving] = useTransition();
  const pick = (index: number, id: string) => {
    setChosen((c) => c.map((v, i) => (i === index ? id : v)));
    setPriceText((c) => c.map((v, i) => (i === index && !v ? (prices[Number(id)] ?? "") : v)));
  };
  const saveNewItem = (index: number) => {
    setNewError("");
    startSaving(async () => {
      const r = await quickCreateItemAction(newItem);
      if (!r.ok) { setNewError(r.message); return; }
      setSkus((list) => (list.some((x) => x.id === r.item.id) ? list : [...list, r.item]));
      pick(index, String(r.item.id));
      setNewFor(null);
      setNewItem((n) => ({ ...n, productName: "", size: "", color: "" }));
    });
  };

  return (
    <form
      action={
        draft
          ? (draft.received ? editReceivedPurchaseAction : updatePurchaseDraftAction)
          : createPurchaseDraftAction
      }
      className={styles.purchaseForm}
    >
      {prefill && (
        <>
          <input type="hidden" name="report_ids" value={prefill.reportIds.join(",")} />
          <p className={styles.muted}>
            Filled from what your staff reported on WhatsApp. Choose the supplier and
            enter the cost of each item, then save.
          </p>
        </>
      )}

      {draft && (
        <input
          type="hidden"
          name="purchase_id"
          value={draft.id}
        />
      )}

      <div className={styles.formGrid}>
        <QuickSupplierSelect
          initialSuppliers={suppliers}
          selectedSupplierId={
            draft ? String(draft.supplier_id) : ""
          }
        />

        <label className={styles.field}>
          Supplier Invoice Number
          <input
            name="supplier_invoice_no"
            maxLength={100}
            defaultValue={draft?.supplier_invoice_no ?? ""}
            placeholder="Supplier bill number"
            className={styles.control}
          />
        </label>

        {gstOn ? (
          <label className={styles.field}>
            GST on the supplier&apos;s bill (₹, optional)
            <input
              name="bill_tax_total"
              inputMode="decimal"
              defaultValue={draft?.billTax ?? ""}
              placeholder="Total CGST + SGST or IGST printed on the bill"
              className={styles.control}
            />
            <span style={{ color: "#64748b", fontSize: 13 }}>
              Type the cost per piece including GST. If the supplier has a GSTIN, the GST comes back as input credit;
              this box makes it match the bill to the paisa. Leave empty to work it out from the product rates.
            </span>
          </label>
        ) : null}

        <label className={styles.field}>
          Original Invoice Date
          <input
            type="date"
            name="invoice_date"
            required
            defaultValue={draft?.invoice_date ?? ""}
            className={styles.control}
          />
        </label>

        <label className={styles.field}>
          Receiving Warehouse
          <select
            name="location_id"
            required
            defaultValue={
              draft
                ? String(draft.location_id)
                : prefill?.locationId
                  ? String(prefill.locationId)
                  : locations.length === 1
                  ? String(locations[0].id)
                  : ""
            }
            className={styles.control}
          >
            <option value="">Select Warehouse</option>
            {locations.map((location) => (
              <option
                key={location.id}
                value={location.id}
              >
                {location.location_code} —{" "}
                {location.location_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.itemsHeading}>
        <div>
          <h3>Purchase Items</h3>
          <p className={styles.muted}>
            Add up to {MAX_LINE_COUNT} different SKUs.
            Quantities for pieces and sets must be whole
            numbers; metres can use up to three decimals.
          </p>
        </div>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() =>
            setLineCount((count) =>
              Math.min(count + 1, MAX_LINE_COUNT)
            )
          }
          disabled={lineCount >= MAX_LINE_COUNT}
        >
          + Add Item
        </button>
      </div>

      <p className={styles.muted} style={{ margin: "4px 0 8px" }}>
        Not in the list? Press <strong>+ New item</strong> on the line. The <strong>selling price</strong> is typed only here: bills,
        stock moves and the website use it, with the lowest and highest price worked out from the cost (change them any time on Selling prices).
        Leave it empty to keep the item&apos;s current price.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Product / SKU</th>
              <th>Quantity</th>
              <th>{gstOn ? "Cost per piece incl. GST (₹)" : "Unit Cost (₹)"}</th>
              <th>Selling price (₹)</th>
              <th>Lot / dye batch (optional)</th>
              <th aria-label="Remove item" />
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: lineCount }, (_, index) => {
              const saved = draft?.lines[index];
              const pre = prefill?.lines[index];

              return (
                <tr key={index}>
                  <td className={styles.rowNumber}>
                    {index + 1}
                  </td>

                  <td className={styles.skuCell}>
                    <select
                      name={`line_${index}_variant`}
                      value={chosen[index]}
                      onChange={(e) => pick(index, e.target.value)}
                      className={styles.control}
                    >
                      <option value="">Select item</option>
                      {skus.map((sku) => (
                        <option
                          key={sku.id}
                          value={sku.id}
                        >
                          {sku.sku} — {sku.product_name}
                          {sku.size_label
                            ? ` / ${sku.size_label}`
                            : ""}
                          {sku.color_name
                            ? ` / ${sku.color_name}`
                            : ""}
                          {` (${sku.unit_of_measure})`}
                        </option>
                      ))}
                    </select>
                    {categories.length > 0 && (
                      <button type="button" className={styles.secondaryButton} style={{ marginTop: 6 }} onClick={() => { setNewFor(newFor === index ? null : index); setNewError(""); }}>
                        {newFor === index ? "Close" : "+ New item"}
                      </button>
                    )}
                    {newFor === index && (
                      <div style={{ marginTop: 8, padding: 10, border: "1px solid #cbd5e1", borderRadius: 8, background: "#f8fafc", display: "grid", gap: 8, minWidth: 260 }}>
                        <strong>New item</strong>
                        <label className={styles.field}>Name<input value={newItem.productName} onChange={(e) => setNewItem({ ...newItem, productName: e.target.value })} placeholder="e.g. Banaras silk saree" className={styles.control} /></label>
                        <label className={styles.field}>Group
                          <select value={newItem.categoryId} onChange={(e) => setNewItem({ ...newItem, categoryId: Number(e.target.value) })} className={styles.control}>
                            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <label className={styles.field} style={{ flex: 1 }}>Size<input value={newItem.size} onChange={(e) => setNewItem({ ...newItem, size: e.target.value })} placeholder="Free / L / 42" className={styles.control} /></label>
                          <label className={styles.field} style={{ flex: 1 }}>Colour<input value={newItem.color} onChange={(e) => setNewItem({ ...newItem, color: e.target.value })} placeholder="Maroon" className={styles.control} /></label>
                        </div>
                        <label className={styles.field}>Counted in
                          <select value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as "PCS" | "SET" | "METER" })} className={styles.control}>
                            <option value="PCS">Pieces</option><option value="SET">Sets</option><option value="METER">Metres</option>
                          </select>
                        </label>
                        {newError && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{newError}</p>}
                        <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => saveNewItem(index)}>
                          {saving ? "Adding…" : "Add item and use it here"}
                        </button>
                        <small style={{ color: "#64748b" }}>Code and barcode are given automatically. If the item already exists, it is reused.</small>
                      </div>
                    )}
                  </td>

                  <td>
                    <input
                      name={`line_${index}_quantity`}
                      type="text"
                      inputMode="decimal"
                      placeholder="10"
                      defaultValue={saved?.quantity ?? pre?.quantity ?? ""}
                      className={styles.control}
                    />
                  </td>

                  <td>
                    <input
                      name={`line_${index}_cost`}
                      type="text"
                      inputMode="decimal"
                      placeholder="650.00"
                      defaultValue={saved?.unit_cost ?? ""}
                      className={styles.control}
                    />
                  </td>

                  <td>
                    <input
                      name={`line_${index}_price`}
                      type="text"
                      inputMode="decimal"
                      placeholder="Selling price"
                      value={priceText[index]}
                      onChange={(e) => setPriceText((c) => c.map((v, i) => (i === index ? e.target.value : v)))}
                      className={styles.control}
                    />
                  </td>

                  <td>
                    <input
                      name={`line_${index}_lot`}
                      type="text"
                      maxLength={60}
                      placeholder="Lot 12"
                      defaultValue={saved?.lot_no ?? ""}
                      className={styles.control}
                    />
                  </td>

                  <td className={styles.removeCell}>
                    {lineCount > 1 && index === lineCount - 1 && (
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() =>
                          setLineCount((count) =>
                            Math.max(count - 1, 1)
                          )
                        }
                        aria-label={`Remove item ${index + 1}`}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className={styles.field}>
        Purchase Remarks
        <textarea
          name="remarks"
          rows={3}
          maxLength={500}
          defaultValue={draft?.remarks ?? ""}
          placeholder="Transport details or supplier notes"
          className={styles.control}
        />
      </label>

      <div className={styles.formActions}>
        <button
          type="submit"
          disabled={
            suppliers.length === 0 ||
            locations.length === 0 ||
            (skus.length === 0 && categories.length === 0)
          }
          className={styles.primaryButton}
        >
          {draft ? (draft.received ? "Save changes to this purchase" : "Update Purchase Draft") : "Save Purchase Draft"}
        </button>

        {draft && (
          <Link
            href="/accounting/purchases"
            className={styles.cancelLink}
          >
            Cancel editing
          </Link>
        )}
      </div>
    </form>
  );
}
