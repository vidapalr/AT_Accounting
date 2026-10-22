
import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import PurchaseDraftForm, {
  type PurchaseDraft,
} from "./PurchaseDraftForm";
import styles from "./purchases.module.css";

type Props = {
  searchParams: Promise<{
    result?: string;
    purchase?: string;
    edit?: string;
  }>;
};

interface Supplier extends RowDataPacket {
  id: number;
  supplier_code: string;
  supplier_name: string;
}

interface Location extends RowDataPacket {
  id: number;
  location_code: string;
  location_name: string;
}

interface SKU extends RowDataPacket {
  id: number;
  sku: string;
  product_name: string;
  size_label: string | null;
  color_name: string | null;
  unit_of_measure: string;
}

interface Purchase extends RowDataPacket {
  id: number;
  purchase_no: string;
  supplier_name: string;
  supplier_invoice_no: string | null;
  invoice_date: string;
  location_name: string;
  status: string;
  line_count: number;
  total_amount: string;
}

interface EditHeader extends RowDataPacket {
  supplier_id: number;
  supplier_invoice_no: string | null;
  invoice_date: string;
  location_id: number;
  remarks: string | null;
}

interface EditLine extends RowDataPacket {
  variant_id: number;
  quantity: string;
  unit_cost: string;
}

const DIVISION_ID = 1;

const messages: Record<string, string> = {
  created: "Purchase draft saved successfully.",
  updated: "Purchase draft updated successfully.",
  invalid: "Check the invoice details and purchase lines.",
  "business-not-found": "Legal business was not found.",
  "master-invalid": "Select an active supplier and central warehouse.",
  "variant-invalid":
    "One or more SKUs are inactive or have invalid quantities.",
  "duplicate-invoice":
    "This supplier invoice number is already recorded.",
  "not-editable":
    "Only draft purchases can be edited. Posted purchases are read-only.",
  failed: "Unable to save purchase. Check the server logs.",
};

async function PurchaseContent({ searchParams }: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;
  const businessId = user.legal_business_id;

  const [suppliers] = await db.execute<Supplier[]>(
    `SELECT id, supplier_code, supplier_name
     FROM acct_suppliers
     WHERE legal_business_id = ?
       AND status = 'ACTIVE'
     ORDER BY supplier_name`,
    [businessId]
  );

  const [locations] = await db.execute<Location[]>(
    `SELECT id, location_code, location_name
     FROM acct_inventory_locations
     WHERE legal_business_id = ?
       AND division_id = ?
       AND location_type = 'CENTRAL_WAREHOUSE'
       AND status = 'ACTIVE'
     ORDER BY location_name`,
    [businessId, DIVISION_ID]
  );

  const [skus] = await db.execute<SKU[]>(
    `SELECT
       v.id,
       v.sku,
       p.product_name,
       v.size_label,
       v.color_name,
       v.unit_of_measure
     FROM acct_product_variants v
     JOIN acct_products p
       ON p.id = v.product_id
      AND p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
     WHERE v.legal_business_id = ?
       AND v.division_id = ?
       AND v.status = 'ACTIVE'
       AND p.status = 'ACTIVE'
     ORDER BY p.product_name, v.sku`,
    [businessId, DIVISION_ID]
  );

  const [purchases] = await db.execute<Purchase[]>(
    `SELECT
       h.id,
       h.purchase_no,
       s.supplier_name,
       h.supplier_invoice_no,
       DATE_FORMAT(h.invoice_date, '%Y-%m-%d')
         AS invoice_date,
       w.location_name,
       h.status,
       COUNT(l.id) AS line_count,
       CAST(COALESCE(SUM(l.line_amount), 0) AS CHAR)
         AS total_amount
     FROM acct_purchase_headers h
     JOIN acct_suppliers s
       ON s.id = h.supplier_id
      AND s.legal_business_id = h.legal_business_id
     JOIN acct_inventory_locations w
       ON w.id = h.receiving_location_id
      AND w.legal_business_id = h.legal_business_id
     LEFT JOIN acct_purchase_lines l
       ON l.purchase_id = h.id
      AND l.legal_business_id = h.legal_business_id
      AND l.division_id = h.division_id
     WHERE h.legal_business_id = ?
       AND h.division_id = ?
     GROUP BY
       h.id,
       h.purchase_no,
       s.supplier_name,
       h.supplier_invoice_no,
       h.invoice_date,
       w.location_name,
       h.status
     ORDER BY h.id DESC
     LIMIT 100`,
    [businessId, DIVISION_ID]
  );

  const selectedPurchaseId = Number(query.purchase);
  const selectedPurchase = purchases.find(
    (p) => Number(p.id) === selectedPurchaseId
  );

  let editDraft: PurchaseDraft | undefined;
  let editUnavailable = false;

  if (query.edit !== undefined) {
    const editId = /^[1-9]\d*$/.test(query.edit) &&
      Number.isSafeInteger(Number(query.edit))
      ? Number(query.edit)
      : null;

    if (editId === null) {
      editUnavailable = true;
    } else {
      const [editHeaders] = await db.execute<EditHeader[]>(
        `SELECT
           supplier_id,
           supplier_invoice_no,
           DATE_FORMAT(invoice_date, '%Y-%m-%d')
             AS invoice_date,
           receiving_location_id AS location_id,
           remarks
         FROM acct_purchase_headers
         WHERE id = ?
           AND legal_business_id = ?
           AND division_id = ?
           AND status = 'DRAFT'
         LIMIT 1`,
        [editId, businessId, DIVISION_ID]
      );

      const editHeader = editHeaders[0];

      if (!editHeader) {
        editUnavailable = true;
      } else {
        const [editLines] = await db.execute<EditLine[]>(
          `SELECT
             variant_id,
             CAST(quantity AS CHAR) AS quantity,
             CAST(unit_cost AS CHAR) AS unit_cost
           FROM acct_purchase_lines
           WHERE purchase_id = ?
             AND legal_business_id = ?
             AND division_id = ?
           ORDER BY line_no`,
          [editId, businessId, DIVISION_ID]
        );

        editDraft = {
          id: editId,
          purchase_no:
            purchases.find((p) => Number(p.id) === editId)
              ?.purchase_no ?? `Purchase #${editId}`,
          supplier_id: Number(editHeader.supplier_id),
          supplier_invoice_no:
            editHeader.supplier_invoice_no,
          invoice_date: editHeader.invoice_date,
          location_id: Number(editHeader.location_id),
          remarks: editHeader.remarks,
          lines: editLines.map((line) => ({
            variant_id: Number(line.variant_id),
            quantity: line.quantity,
            unit_cost: line.unit_cost,
          })),
        };
      }
    }
  }

  const ready =
    suppliers.length > 0 &&
    locations.length > 0 &&
    skus.length > 0;

  return (
    <main className={styles.page}>
      <Link
        href="/accounting/suppliers"
        className={styles.backLink}
      >
        ← Supplier Master
      </Link>

      <header className={styles.pageHeader}>
        <h1>Abhiram Textiles — Purchase Entry</h1>
        <p>
          Record supplier invoices and product quantities.
          Saved drafts do not increase stock; stock changes
          only after goods receipt is posted.
        </p>
      </header>

      {query.result && (
        <p role="status" className={styles.status}>
          {messages[query.result] ?? "Request processed."}
        </p>
      )}

      {selectedPurchase && (
        <p>
          Saved purchase:{" "}
          <strong>{selectedPurchase.purchase_no}</strong>
          {" — "}
          {selectedPurchase.status}
        </p>
      )}

      {editUnavailable && (
        <p role="alert" className={styles.status}>
          This purchase cannot be edited. Only draft
          purchases can be changed.
        </p>
      )}

      {!ready && (
        <section className={`${styles.card} ${styles.setupCard}`}>
          <h2>Setup Required</h2>
          <p>
            Before entering a purchase, register at least
            one supplier, active SKU and central warehouse.
          </p>
          <p>
            Suppliers: {suppliers.length}
            {" · "}
            SKUs: {skus.length}
            {" · "}
            Central warehouses: {locations.length}
          </p>
          <Link href="/accounting/products">
            Open Product Master
          </Link>
        </section>
      )}

      <section id="purchase-entry" className={styles.card}>
        <h2>
          {editDraft
            ? `Edit Purchase Draft — ${editDraft.purchase_no}`
            : "Create Purchase Draft"}
        </h2>
        <PurchaseDraftForm
          key={editDraft?.id ?? "new-purchase"}
          suppliers={suppliers.map((supplier) => ({
            id: Number(supplier.id),
            supplier_code: supplier.supplier_code,
            supplier_name: supplier.supplier_name,
          }))}
          locations={locations.map((location) => ({
            id: Number(location.id),
            location_code: location.location_code,
            location_name: location.location_name,
          }))}
          skus={skus.map((sku) => ({
            id: Number(sku.id),
            sku: sku.sku,
            product_name: sku.product_name,
            size_label: sku.size_label,
            color_name: sku.color_name,
            unit_of_measure: sku.unit_of_measure,
          }))}
          draft={editDraft}
        />
      </section>

      <section className={styles.card}>
        <h2>Recent Purchases</h2>

        <div className={styles.tableWrap}>
          <table className={styles.recentTable}>
            <thead>
              <tr>
                {[
                  "Purchase Number",
                  "Supplier",
                  "Supplier Invoice",
                  "Invoice Date",
                  "Warehouse",
                  "SKUs",
                  "Total",
                  "Status",
                  "Actions",
                ].map((heading) => (
                  <th key={heading}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>
                    <Link
                      href={`/accounting/purchases/${purchase.id}`}
                    >
                      {purchase.purchase_no}
                    </Link>
                  </td>
                  <td>
                    {purchase.supplier_name}
                  </td>
                  <td>
                    {purchase.supplier_invoice_no ?? "—"}
                  </td>
                  <td>
                    {purchase.invoice_date}
                  </td>
                  <td>
                    {purchase.location_name}
                  </td>
                  <td>
                    {purchase.line_count}
                  </td>
                  <td>
                    ₹{purchase.total_amount}
                  </td>
                  <td>
                    <span className={styles.statusBadge}>
                      {purchase.status}
                    </span>
                  </td>
                  <td>
                    {purchase.status === "DRAFT" ? (
                      <Link
                        href={`/accounting/purchases?edit=${purchase.id}#purchase-entry`}
                        className={styles.actionLink}
                      >
                        Edit Draft
                      </Link>
                    ) : (
                      <Link
                        href={`/accounting/purchases/${purchase.id}`}
                        className={styles.actionLink}
                      >
                        View
                      </Link>
                    )}
                  </td>
                </tr>
              ))}

              {purchases.length === 0 && (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    No purchases recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function PurchasesPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24 }}>
          Loading purchases…
        </main>
      }
    >
      <PurchaseContent {...props} />
    </Suspense>
  );
}
