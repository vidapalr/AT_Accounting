import { Suspense } from "react";
import PrintHeader from "@/components/PrintHeader";
import Link from "next/link";
import TransferHistoryTable from "./TransferHistoryTable";
import PrintTransferButton from "./PrintTransferButton";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import StockTransferDraftForm, {
  type StockTransferDraft,
} from "./StockTransferDraftForm";
import styles from "./stock-transfers.module.css";

type Props = {
  searchParams: Promise<{
    result?: string;
    edit?: string;
    view?: string;
  }>;
};

interface TransferHeader extends RowDataPacket {
  id: number;
  from_location_id: number;
  to_location_id: number;
  transfer_date: string;
  remarks: string | null;
}

interface TransferLine extends RowDataPacket {
  variant_id: number;
  quantity: string;
  min_selling_price: string;
  max_selling_price: string | null;
  suggested_selling_price: string | null;
}

interface TransferDetail extends RowDataPacket {
  id: number;
  transfer_no: string;
  transfer_date: string;
  status: string;
  from_location: string;
  to_location: string;
  remarks: string | null;
  created_at_text: string | null;
  dispatched_at_text: string | null;
  received_at_text: string | null;
  created_by: number;
  dispatched_by: number | null;
  received_by: number | null;
}

interface TransferDetailLine extends RowDataPacket {
  sku: string;
  product_name: string;
  unit_of_measure: string;
  quantity: string;
  min_selling_price: string;
  max_selling_price: string | null;
  suggested_selling_price: string | null;
}

interface Location extends RowDataPacket {
  id: number;
  location_code: string;
  location_name: string;
  location_type: string;
  branch_id: number | null;
}

interface Variant extends RowDataPacket {
  id: number;
  sku: string;
  unit_of_measure: string;
  product_name: string;
  status: string;
  product_status: string;
}

const messages: Record<string, string> = {
  created: "Stock transfer draft created successfully.",
  updated: "Stock transfer draft updated successfully.",
  invalid: "Enter valid transfer details and select items.",
  "invalid-item": "Check quantities and selling prices.",
  "location-invalid": "Select an active warehouse and retail branch.",
  "product-invalid": "One or more products are unavailable.",
  "insufficient-stock": "Insufficient warehouse stock for an item.",
  "not-editable": "Only draft stock transfers can be edited.",
  dispatched: "Stock dispatched from the warehouse.",
  received: "Stock received at the branch.",
  "not-draft": "Only draft transfers can be dispatched.",
  "not-dispatched": "Only dispatched transfers can be received.",
  "date-invalid": "Receipt date cannot precede transfer date.",
  "valuation-invalid": "Warehouse inventory valuation needs review.",
  failed: "Unable to save transfer. Check server logs.",
};

async function TransferContent({ searchParams }: Props) {
  const user = await requireAccess("purchases");
  const businessId = user.legal_business_id;
  const { result, edit, view } = await searchParams;

  const [locations] = await db.execute<Location[]>(
    `SELECT
       id,
       location_code,
       location_name,
       location_type,
       branch_id
     FROM acct_inventory_locations
     WHERE legal_business_id = ?
       AND division_id = 1
       AND status = 'ACTIVE'
       AND location_type IN (
         'CENTRAL_WAREHOUSE',
         'WAREHOUSE',
         'RETAIL',
         'STOCKROOM'
       )
     ORDER BY location_type, location_name`,
    [businessId]
  );

  const [variants] = await db.execute<Variant[]>(
    `SELECT
       v.id,
       v.sku,
       v.unit_of_measure,
       p.product_name,
       v.status,
       p.status AS product_status
     FROM acct_product_variants v
     JOIN acct_products p
       ON p.id = v.product_id
      AND p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
     WHERE v.legal_business_id = ?
       AND v.division_id = 1
     GROUP BY
       v.id, v.sku, v.unit_of_measure, p.product_name,
       v.status, p.status
     ORDER BY p.product_name, v.sku`,
    [businessId]
  );

  const [transfers] = await db.execute<RowDataPacket[]>(
    `SELECT
       t.id,
       t.transfer_no,
       DATE_FORMAT(t.transfer_date, '%Y-%m-%d')
         AS transfer_date,
       t.status,
       f.location_name AS from_location,
       d.location_name AS to_location,
       COUNT(tl.id) AS item_count,
       COALESCE(SUM(tl.quantity), 0) AS total_quantity
     FROM acct_stock_transfers t
     JOIN acct_inventory_locations f
       ON f.id = t.from_location_id
      AND f.legal_business_id = t.legal_business_id
     JOIN acct_inventory_locations d
       ON d.id = t.to_location_id
      AND d.legal_business_id = t.legal_business_id
     LEFT JOIN acct_stock_transfer_lines tl
       ON tl.transfer_id = t.id
     WHERE t.legal_business_id = ?
       AND t.division_id = 1
     GROUP BY
       t.id, t.transfer_no, t.transfer_date, t.status,
       f.location_name, d.location_name
     ORDER BY t.id DESC
     LIMIT 500`,
    [businessId]
  );

  // Source-location balances and calculated selling prices; no costs exposed.
  const [sourceBalances] = await db.execute<RowDataPacket[]>(
    `SELECT location_id, variant_id,
            CAST(SUM(quantity_change) AS CHAR) AS available_qty,
            CAST(CASE WHEN SUM(quantity_change) > 0
                 AND SUM(CASE WHEN quantity_change > 0
                       THEN total_cost ELSE -total_cost END) > 0
              THEN ROUND(
                (SUM(CASE WHEN quantity_change > 0
                       THEN total_cost ELSE -total_cost END)
                 / SUM(quantity_change)) * 1.01 * 1.30, 2)
              ELSE NULL END AS CHAR) AS min_price,
            CAST(CASE WHEN SUM(quantity_change) > 0
                 AND SUM(CASE WHEN quantity_change > 0
                       THEN total_cost ELSE -total_cost END) > 0
              THEN ROUND(
                (SUM(CASE WHEN quantity_change > 0
                       THEN total_cost ELSE -total_cost END)
                 / SUM(quantity_change)) * 1.01 * 2.00, 2)
              ELSE NULL END AS CHAR) AS max_price
     FROM acct_stock_movements
     WHERE legal_business_id = ? AND division_id = 1
     GROUP BY location_id, variant_id`,
    [businessId]
  );

  let draft: StockTransferDraft | undefined;
  let selectedTransfer: TransferDetail | undefined;
  let selectedTransferLines: TransferDetailLine[] = [];
  const editId =
    edit && /^[1-9]\d*$/.test(edit) &&
    Number.isSafeInteger(Number(edit))
      ? Number(edit)
      : null;

  if (editId !== null) {
    const [headers] = await db.execute<TransferHeader[]>(
      `SELECT
         id,
         from_location_id,
         to_location_id,
         DATE_FORMAT(transfer_date, '%Y-%m-%d')
           AS transfer_date,
         remarks
       FROM acct_stock_transfers
       WHERE id = ?
         AND legal_business_id = ?
         AND division_id = 1
         AND status = 'DRAFT'
       LIMIT 1`,
      [editId, businessId]
    );
    const header = headers[0];

    if (header) {
      const [lines] = await db.execute<TransferLine[]>(
        `SELECT
           variant_id,
           CAST(quantity AS CHAR) AS quantity,
           CAST(min_selling_price AS CHAR) AS min_selling_price,
           CAST(max_selling_price AS CHAR) AS max_selling_price,
           CAST(suggested_selling_price AS CHAR)
             AS suggested_selling_price
         FROM acct_stock_transfer_lines
         WHERE transfer_id = ?
           AND legal_business_id = ?
           AND division_id = ?
         ORDER BY id`,
        [editId, businessId, 1]
      );

      draft = { ...header, lines };
    }
  }

  const viewId =
    view && /^[1-9]\d*$/.test(view) &&
    Number.isSafeInteger(Number(view))
      ? Number(view)
      : null;

  if (viewId !== null) {
    const [headers] = await db.execute<TransferDetail[]>(
      `SELECT
         t.id,
         t.transfer_no,
         DATE_FORMAT(t.transfer_date, '%Y-%m-%d')
           AS transfer_date,
         t.status,
         f.location_name AS from_location,
         d.location_name AS to_location,
         t.remarks,
         DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') AS created_at_text,
         DATE_FORMAT(t.dispatched_at, '%Y-%m-%d %H:%i') AS dispatched_at_text,
         DATE_FORMAT(t.received_at, '%Y-%m-%d %H:%i') AS received_at_text,
         t.created_by, t.dispatched_by, t.received_by
       FROM acct_stock_transfers t
       JOIN acct_inventory_locations f
         ON f.id = t.from_location_id
        AND f.legal_business_id = t.legal_business_id
       JOIN acct_inventory_locations d
         ON d.id = t.to_location_id
        AND d.legal_business_id = t.legal_business_id
       WHERE t.id = ?
         AND t.legal_business_id = ?
         AND t.division_id = 1
       LIMIT 1`,
      [viewId, businessId]
    );

    selectedTransfer = headers[0];

    if (selectedTransfer) {
      const [lines] = await db.execute<TransferDetailLine[]>(
        `SELECT
           v.sku,
           p.product_name,
           v.unit_of_measure,
           CAST(l.quantity AS CHAR) AS quantity,
           CAST(l.min_selling_price AS CHAR)
             AS min_selling_price,
           CAST(l.max_selling_price AS CHAR)
             AS max_selling_price,
           CAST(l.suggested_selling_price AS CHAR)
             AS suggested_selling_price
         FROM acct_stock_transfer_lines l
         JOIN acct_product_variants v
           ON v.id = l.variant_id
          AND v.legal_business_id = l.legal_business_id
          AND v.division_id = l.division_id
         JOIN acct_products p
           ON p.id = v.product_id
          AND p.legal_business_id = v.legal_business_id
          AND p.division_id = v.division_id
         WHERE l.transfer_id = ?
           AND l.legal_business_id = ?
           AND l.division_id = 1
         ORDER BY l.id`,
        [viewId, businessId]
      );

      selectedTransferLines = lines;
    }
  }

  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <h1>Stock Transfers</h1>
        <p>Central Warehouse → Retail Branches</p>
      </header>

      {result && (
        <p role="status" className={styles.status}>
          {messages[result] ?? "Request completed."}
        </p>
      )}

      {edit && !draft && (
        <p role="status" className={styles.status}>
          This transfer draft is unavailable or no longer editable.
        </p>
      )}

      {view && !selectedTransfer && (
        <p role="status" className={styles.status}>
          This stock transfer could not be found.
        </p>
      )}

      {selectedTransfer && (
        <section className={`${styles.card} ${styles.printArea}`}>
          <PrintHeader title={`Stock transfer ${selectedTransfer.transfer_no}`} />
          <div className={styles.detailHeading}>
            <div>
              <h2>Transfer Details: {selectedTransfer.transfer_no}</h2>
              <p className={styles.muted}>
                {selectedTransfer.from_location} →{" "}
                {selectedTransfer.to_location}
                {" · "}
                {selectedTransfer.transfer_date}
                {" · "}
                {selectedTransfer.status}
              </p>
            </div>
            <div className={styles.detailControls}>
              <PrintTransferButton />
              <Link
              href="/accounting/stock-transfers"
              className={styles.cancelLink}
            >
              Close details
              </Link>
            </div>
          </div>
          <div className={styles.timeline}>
            <div><b>Created</b><span>{selectedTransfer.created_at_text ?? selectedTransfer.transfer_date} · User #{selectedTransfer.created_by}</span></div>
            <div><b>Dispatched</b><span>{selectedTransfer.dispatched_at_text ? `${selectedTransfer.dispatched_at_text} · User #${selectedTransfer.dispatched_by}` : "Pending"}</span></div>
            <div><b>Received</b><span>{selectedTransfer.received_at_text ? `${selectedTransfer.received_at_text} · User #${selectedTransfer.received_by}` : "Pending"}</span></div>
          </div>
          <p className={styles.detailTotal}>Items: {selectedTransferLines.length} · Total quantities by unit: {Object.entries(selectedTransferLines.reduce((acc, line) => { const unit = String(line.unit_of_measure); acc[unit] = (acc[unit] ?? 0) + Number(line.quantity); return acc; }, {} as Record<string, number>)).map(([unit, total]) => `${total.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit}`).join(" · ")}</p>
          <div className={styles.tableWrap}>
            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product / SKU</th>
                  <th>Quantity</th>
                  <th>Min Price ₹</th>
                  <th>Max Price ₹</th>
                  <th>Suggested ₹</th>
                </tr>
              </thead>
              <tbody>
                {selectedTransferLines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyState}>
                      No transfer items found.
                    </td>
                  </tr>
                ) : (
                  selectedTransferLines.map((line, index) => (
                    <tr key={`${line.sku}-${index}`}>
                      <td className={styles.rowNumber}>{index + 1}</td>
                      <td>
                        {line.product_name} — {line.sku}
                      </td>
                      <td>
                        {line.quantity} {line.unit_of_measure}
                      </td>
                      <td>{line.min_selling_price}</td>
                      <td>{line.max_selling_price ?? "—"}</td>
                      <td>{line.suggested_selling_price ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {selectedTransfer.remarks && (
            <p className={styles.transferRemarks}>
              <strong>Remarks:</strong> {selectedTransfer.remarks}
            </p>
          )}
        </section>
      )}

      <section className={`${styles.reviewSummary} ${styles.hideWhenPrinting}`} aria-label="Transfer status summary">
        {(["DRAFT", "DISPATCHED", "RECEIVED"] as const).map(status => (
          <div className={styles.reviewStat} key={status}>
            <span>{status === "DISPATCHED" ? "In Transit" : status === "DRAFT" ? "Drafts" : "Received"}</span>
            <strong>{transfers.filter(t => t.status === status).length}</strong>
          </div>
        ))}
      </section>
      <section className={`${styles.card} ${styles.hideWhenPrinting}`}>
        <h2>{draft ? "Edit Stock Transfer Draft" : "New Stock Transfer"}</h2>
        <StockTransferDraftForm
          key={draft?.id ?? "new"}
          locations={locations}
          variants={variants}
          sourceBalances={sourceBalances.map(r => ({
            location_id: Number(r.location_id),
            variant_id: Number(r.variant_id),
            available_qty: String(r.available_qty),
            min_price: r.min_price == null ? null : String(r.min_price),
            max_price: r.max_price == null ? null : String(r.max_price),
          }))}
          today={today}
          draft={draft}
        />
      </section>

      <section className={`${styles.card} ${styles.hideWhenPrinting}`}>
        <h2>Stock Transfer History</h2>
        <p className={styles.muted}>Search and filter the latest 500 transfers. Open a transfer to print its challan.</p>
        <TransferHistoryTable
          transfers={transfers.map(t => ({
            id: Number(t.id),
            transfer_no: String(t.transfer_no),
            transfer_date: String(t.transfer_date),
            from_location: String(t.from_location),
            to_location: String(t.to_location),
            item_count: Number(t.item_count),
            total_quantity: Number(t.total_quantity),
            status: String(t.status),
          }))}
          today={today}
        />
      </section>
    </main>
  );
}

export default function StockTransfersPage(props: Props) {
  return (
    <Suspense fallback={<main>Loading stock transfers…</main>}>
      <TransferContent {...props} />
    </Suspense>
  );
}
