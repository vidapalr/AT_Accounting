"use client";

import { useState } from "react";
import Link from "next/link";

import { saveStockTransferDraftAction } from "@/lib/stock-transfer-actions";
import styles from "./stock-transfers.module.css";

type Location = {
  id: number;
  location_code: string;
  location_name: string;
  location_type: string;
};

type Variant = {
  id: number;
  sku: string;
  unit_of_measure: string;
  product_name: string;
  status: string;
  product_status: string;
};

type TransferLine = {
  variant_id: number;
  quantity: string;
  min_selling_price: string;
  max_selling_price: string | null;
  suggested_selling_price: string | null;
};

type EditableLine = {
  variant_id: string;
  quantity: string;
  min_selling_price: string;
  max_selling_price: string;
  suggested_selling_price: string;
};

export type StockTransferDraft = {
  id: number;
  from_location_id: number;
  to_location_id: number;
  transfer_date: string;
  remarks: string | null;
  lines: TransferLine[];
};

type Props = {
  locations: Location[];
  variants: Variant[];
  sourceBalances: { location_id: number; variant_id: number; available_qty: string; min_price: string | null; max_price: string | null }[];
  today: string;
  draft?: StockTransferDraft;
};

const MAX_ITEM_COUNT = 100;

export default function StockTransferDraftForm({
  locations,
  variants,
  sourceBalances,
  today,
  draft,
}: Props) {
  const [lines, setLines] = useState<EditableLine[]>(
    draft?.lines.length
      ? draft.lines.map((line) => ({
          variant_id: String(line.variant_id),
          quantity: String(line.quantity ?? ""),
          min_selling_price: String(line.min_selling_price ?? ""),
          max_selling_price: String(line.max_selling_price ?? ""),
          suggested_selling_price: String(
            line.suggested_selling_price ?? ""
          ),
        }))
      : [{
          variant_id: "",
          quantity: "",
          min_selling_price: "",
          max_selling_price: "",
          suggested_selling_price: "",
        }]
  );
  const [sourceId, setSourceId] = useState(
    String(draft?.from_location_id ?? "")
  );
  const [itemSearches, setItemSearches] = useState<string[]>(
    draft?.lines.length ? draft.lines.map(() => "") : [""]
  );
  const [showOnlyInStock, setShowOnlyInStock] = useState(true);

  const priceFor = (variantId: number) =>
    sourceBalances.find(r =>
      String(r.location_id) === sourceId && r.variant_id === variantId
    );

  const availableFor = (variantId: number): number =>
    Number(sourceBalances.find(r =>
      String(r.location_id) === sourceId && r.variant_id === variantId
    )?.available_qty ?? 0);

  const activeVariants = variants.filter(v =>
    v.status === "ACTIVE" && v.product_status === "ACTIVE"
  );

  const branches = locations.filter(
    (location) => location.location_type === "RETAIL"
  );

  function updateLine(
    index: number,
    field: keyof EditableLine,
    value: string
  ) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, [field]: value } : line
      )
    );
  }

  return (
    <form action={saveStockTransferDraftAction} className={styles.form}>
      {draft && (
        <input type="hidden" name="transfer_id" value={draft.id} />
      )}

      <div className={styles.formGrid}>
        <label className={styles.field}>
          From Location
          <select
            name="from_location_id"
            required
            value={sourceId}
            onChange={e => {
              setSourceId(e.target.value);
              setLines(current => current.map(line => ({...line, variant_id: "", quantity: "", min_selling_price: "", max_selling_price: ""})));
              setItemSearches(current => current.map(() => ""));
            }}
            className={styles.control}
          >
            <option value="">Select source</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.location_name} ({location.location_code})
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          To Branch
          <select
            name="to_location_id"
            required
            defaultValue={draft ? String(draft.to_location_id) : ""}
            className={styles.control}
          >
            <option value="">Select destination</option>
            {branches.map((location) => (
              <option key={location.id} value={location.id}>
                {location.location_name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          Transfer Date
          <input
            type="date"
            name="transfer_date"
            defaultValue={draft?.transfer_date ?? today}
            required
            className={styles.control}
          />
        </label>
      </div>

      <div className={styles.itemsHeading}>
        <div>
          <h3>Transfer Items</h3>
          <p className={styles.muted}>
            Add up to {MAX_ITEM_COUNT} products. Enter a quantity and
            selling prices are calculated from source stock cost + 1% allowance:
            minimum +30%, maximum +100%. Purchase costs are not shown.
          </p>
        </div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            if (lines.length >= MAX_ITEM_COUNT) return;
            setLines(current => [...current, {
              variant_id: "", quantity: "", min_selling_price: "",
              max_selling_price: "", suggested_selling_price: "",
            }]);
            setItemSearches(current => [...current, ""]);
          }}
          disabled={lines.length >= MAX_ITEM_COUNT}
        >
          + Add Item
        </button>
      </div>

      <label className={styles.muted}>
        <input type="checkbox" checked={showOnlyInStock}
          onChange={e => setShowOnlyInStock(e.target.checked)} />
        {" "}Only show SKUs with available stock in selected source
      </label>
      <div className={styles.tableWrap}>
        <table className={styles.itemsTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Product / SKU</th>
              <th>Available Qty</th>
              <th>Transfer Quantity</th>
              <th>Min Price ₹</th>
              <th>Max Price ₹</th>
              <th>Suggested ₹</th>
              <th aria-label="Remove item" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const selectedVariant = variants.find(
                (variant) => String(variant.id) === line.variant_id
              );
                const search = (itemSearches[index] ?? "").toLowerCase().trim();
                const selectableVariants = activeVariants.filter(variant => {
                  if (variant.id === Number(line.variant_id)) return true;
                  if (showOnlyInStock && availableFor(variant.id) <= 0) return false;
                  const haystack = `${variant.product_name} ${variant.sku} ${variant.unit_of_measure}`.toLowerCase();
                  return search.split(/\s+/).every(word => haystack.includes(word));
                });
                const selectedAvailable = selectedVariant ? availableFor(selectedVariant.id) : 0;
                const currentPricing = selectedVariant ? priceFor(selectedVariant.id) : null;
              const minAuto = currentPricing?.min_price ?? "";
              const maxAuto = currentPricing?.max_price ?? "";
              const qtyTooHigh = Boolean(line.quantity && selectedVariant &&
                  Number(line.quantity) > selectedAvailable);
              return (
                <tr key={index}>
                  <td className={styles.rowNumber}>{index + 1}</td>
                  <td className={styles.skuCell}>
                    <input type="search"
                      className={styles.skuSearch}
                      placeholder="Search product or SKU..."
                      aria-label={`Search item ${index + 1}`}
                      value={itemSearches[index] ?? ""}
                      onChange={e => setItemSearches(current => current.map((v, i) =>
                        i === index ? e.target.value : v))}
                    />
                    <select
                      name={`variant_${index}`}
                      value={line.variant_id}
                      onChange={(event) => {
                        const next = event.target.value;
                        const prices = sourceBalances.find(r =>
                          String(r.location_id) === sourceId &&
                          String(r.variant_id) === next
                        );
                        setLines(current => current.map((item, i) => i === index
                          ? { ...item, variant_id: next,
                              min_selling_price: prices?.min_price ?? "",
                              max_selling_price: prices?.max_price ?? "" }
                          : item));
                      }}
                      className={styles.control}
                    >
                      <option value="">Select product</option>
                      {selectedVariant &&
                        !selectableVariants.some(
                          (variant) => variant.id === selectedVariant.id
                        ) && (
                          <option
                            value={selectedVariant.id}
                            key={selectedVariant.id}
                          >
                            {selectedVariant.product_name} —{" "}
                            {selectedVariant.sku} (Inactive)
                          </option>
                        )}
                      {selectableVariants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.product_name} — {variant.sku}
                          {" "}({variant.unit_of_measure})
                        </option>
                      ))}
                    </select>
                  </td>
                  
                  <td className={styles.availableQtyCell}>
                    {selectedVariant && sourceId ? (
                      <>
                        <strong>
                          {selectedAvailable.toLocaleString("en-IN", {
                            maximumFractionDigits: 3,
                          })}
                        </strong>
                        <span> {selectedVariant.unit_of_measure}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <input
                      name={`quantity_${index}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, "quantity", event.target.value)
                      }
                      className={styles.control}
                    />
                  </td>
                  <td>
                    <input
                      name={`min_${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={minAuto}
                      readOnly
                      className={styles.control}
                      title="Automatic: source stock average cost × 1.01 × 1.30"
                    />
                  </td>
                  <td>
                    <input
                      name={`max_${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={maxAuto}
                      readOnly
                      className={styles.control}
                      title="Automatic: source stock average cost × 1.01 × 2.00"
                    />
                    {selectedVariant && (!minAuto || !maxAuto) && (
                      <small style={{ color: "#b91c1c", display: "block" }}>
                        Cost unavailable — cannot save this SKU.
                      </small>
                    )}
                  </td>
                  <td>
                    <input
                      name={`suggested_${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.suggested_selling_price}
                      onChange={(event) =>
                        updateLine(
                          index,
                          "suggested_selling_price",
                          event.target.value
                        )
                      }
                      className={styles.control}
                    />
                  </td>
                  <td className={styles.removeCell}>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => {
                          setLines(current => current.filter((_, i) => i !== index));
                          setItemSearches(current => current.filter((_, i) => i !== index));
                        }}
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
        Remarks
        <textarea
          name="remarks"
          rows={3}
          maxLength={500}
          defaultValue={draft?.remarks ?? ""}
          className={styles.control}
        />
      </label>

      <div className={styles.formActions}>
        <button
          type="submit"
          disabled={lines.some(line => !line.variant_id || !line.quantity ||
            line.min_selling_price === "" || Number(line.quantity) <= 0 ||
            Number(line.quantity) > availableFor(Number(line.variant_id)) ||
            (line.max_selling_price !== "" && Number(line.max_selling_price) < Number(line.min_selling_price))) ||
            new Set(lines.map(line => line.variant_id)).size !== lines.length ||
            !sourceId || locations.length === 0 || branches.length === 0 ||
            !variants.some(
              (variant) =>
                variant.status === "ACTIVE" &&
                variant.product_status === "ACTIVE"
            )}
          className={styles.primaryButton}
        >
          {draft ? "Update Transfer Draft" : "Save Transfer Draft"}
        </button>
        {draft && (
          <Link
            href="/accounting/stock-transfers"
            className={styles.cancelLink}
          >
            Cancel editing
          </Link>
        )}
      </div>
    </form>
  );
}
