"use client";

import { useState } from "react";
import Link from "next/link";

import QuickSupplierSelect from "@/components/accounting/quick-supplier-select";
import {
  createPurchaseDraftAction,
  updatePurchaseDraftAction,
} from "@/lib/purchase-actions";

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
  lines: Array<{
    variant_id: number;
    quantity: string;
    unit_cost: string;
  }>;
};

type Props = {
  suppliers: Supplier[];
  locations: Location[];
  skus: SKU[];
  draft?: PurchaseDraft;
};

const MAX_LINE_COUNT = 100;

export default function PurchaseDraftForm({
  suppliers,
  locations,
  skus,
  draft,
}: Props) {
  const [lineCount, setLineCount] = useState(
    Math.max(draft?.lines.length ?? 0, 1)
  );

  return (
    <form
      action={
        draft
          ? updatePurchaseDraftAction
          : createPurchaseDraftAction
      }
      className={styles.purchaseForm}
    >
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

      <div className={styles.tableWrap}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Product / SKU</th>
              <th>Quantity</th>
              <th>Unit Cost (₹)</th>
              <th aria-label="Remove item" />
            </tr>
          </thead>

          <tbody>
            {Array.from({ length: lineCount }, (_, index) => {
              const saved = draft?.lines[index];

              return (
                <tr key={index}>
                  <td className={styles.rowNumber}>
                    {index + 1}
                  </td>

                  <td className={styles.skuCell}>
                    <select
                      name={`line_${index}_variant`}
                      defaultValue={
                        saved ? String(saved.variant_id) : ""
                      }
                      className={styles.control}
                    >
                      <option value="">Select SKU</option>
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
                  </td>

                  <td>
                    <input
                      name={`line_${index}_quantity`}
                      type="text"
                      inputMode="decimal"
                      placeholder="10"
                      defaultValue={saved?.quantity ?? ""}
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
            skus.length === 0
          }
          className={styles.primaryButton}
        >
          {draft ? "Update Purchase Draft" : "Save Purchase Draft"}
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
