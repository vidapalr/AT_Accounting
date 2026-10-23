import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import InventoryReportClient, {
  type InventoryRow,
  type TransitItem,
} from "./InventoryReportClient";
import "./inventory-report.css";

type InventoryScope = "CENTRAL" | "BRANCH" | "ALL";
type InventoryFilters = { q?: string; location?: string; availability?: string };
type Props = { scope: InventoryScope; filters?: InventoryFilters };

type StockDbRow = RowDataPacket & InventoryRow;
type TransitDbRow = RowDataPacket & TransitItem;

export default async function LocationInventoryReport({
  scope,
  filters = {},
}: Props) {
  const user = await requireAccess("stock");
  const businessId = user.legal_business_id;

  const locationCondition = scope === "ALL"
    ? "1 = 1"
    : scope === "CENTRAL"
      ? "l.location_type IN ('CENTRAL_WAREHOUSE', 'WAREHOUSE') AND l.branch_id IS NULL"
      : "l.branch_id IS NOT NULL";

  // Stock values come exclusively from posted movements, not transfers still in transit.
  const [rows] = await db.execute<StockDbRow[]>(
    `SELECT
       l.id AS location_id, l.location_name, l.location_code,
       b.branch_name, v.id AS variant_id, v.sku, p.product_name,
       v.size_label, v.color_name, v.unit_of_measure,
       COALESCE(SUM(CASE WHEN m.movement_type = 'PURCHASE_RECEIPT' THEN m.quantity_change ELSE 0 END),0) AS purchased_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'TRANSFER_IN' THEN m.quantity_change ELSE 0 END),0) AS transfer_in_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'TRANSFER_OUT' THEN -m.quantity_change ELSE 0 END),0) AS transfer_out_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'SALE' THEN -m.quantity_change ELSE 0 END),0) AS sales_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'SALES_RETURN' THEN m.quantity_change ELSE 0 END),0) AS sales_return_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'PURCHASE_RETURN' THEN -m.quantity_change ELSE 0 END),0) AS purchase_return_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'ADJUSTMENT_IN' THEN m.quantity_change ELSE 0 END),0) AS adjustment_in_qty,
       COALESCE(SUM(CASE WHEN m.movement_type = 'ADJUSTMENT_OUT' THEN -m.quantity_change ELSE 0 END),0) AS adjustment_out_qty,
       COALESCE(SUM(m.quantity_change),0) AS available_qty
     FROM acct_stock_movements m
     JOIN acct_inventory_locations l
       ON l.legal_business_id = m.legal_business_id
      AND l.division_id = m.division_id AND l.id = m.location_id
     LEFT JOIN acct_branches b
       ON b.legal_business_id = l.legal_business_id
      AND b.division_id = l.division_id AND b.id = l.branch_id
     JOIN acct_product_variants v
       ON v.legal_business_id = m.legal_business_id
      AND v.division_id = m.division_id AND v.id = m.variant_id
     JOIN acct_products p
       ON p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id AND p.id = v.product_id
     WHERE m.legal_business_id = ?
       AND ${locationCondition}
     GROUP BY l.id, l.location_name, l.location_code,
       b.branch_name, v.id, v.sku, p.product_name,
       v.size_label, v.color_name, v.unit_of_measure
     ORDER BY b.branch_name, l.location_name, p.product_name, v.sku`,
    [businessId],
  );

  const transitCondition = scope === "ALL"
    ? "1 = 1"
    : scope === "CENTRAL"
      ? "src.location_type IN ('CENTRAL_WAREHOUSE', 'WAREHOUSE') AND src.branch_id IS NULL"
      : "dst.branch_id IS NOT NULL";

  const [transitRows] = await db.execute<TransitDbRow[]>(
    `SELECT t.transfer_no, src.location_name AS source_location,
       dst.location_name AS destination_location,
       v.sku, p.product_name, v.unit_of_measure, tl.quantity
     FROM acct_stock_transfers t
     JOIN acct_stock_transfer_lines tl
       ON tl.transfer_id = t.id
      AND tl.legal_business_id = t.legal_business_id
      AND tl.division_id = t.division_id
     JOIN acct_inventory_locations src
       ON src.legal_business_id = t.legal_business_id
      AND src.id = t.from_location_id
     JOIN acct_inventory_locations dst
       ON dst.legal_business_id = t.legal_business_id
      AND dst.id = t.to_location_id
     JOIN acct_product_variants v
       ON v.legal_business_id = tl.legal_business_id
      AND v.division_id = tl.division_id
      AND v.id = tl.variant_id
     JOIN acct_products p
       ON p.legal_business_id = v.legal_business_id
      AND p.division_id = v.division_id
      AND p.id = v.product_id
     WHERE t.legal_business_id = ?
       AND t.status = 'DISPATCHED' AND ${transitCondition}
     ORDER BY t.id DESC, tl.id`,
    [businessId],
  );

  // mysql2 returns DECIMAL as strings; convert to plain serializable props.
  const stock: InventoryRow[] = rows.map((r) => ({
    location_id: Number(r.location_id),
    location_name: String(r.location_name),
    location_code: String(r.location_code),
    branch_name: r.branch_name ?? null,
    variant_id: Number(r.variant_id),
    sku: String(r.sku),
    product_name: String(r.product_name),
    size_label: r.size_label ?? null,
    color_name: r.color_name ?? null,
    unit_of_measure: r.unit_of_measure,
    purchased_qty: String(r.purchased_qty),
    transfer_in_qty: String(r.transfer_in_qty),
    transfer_out_qty: String(r.transfer_out_qty),
    sales_qty: String(r.sales_qty),
    sales_return_qty: String(r.sales_return_qty),
    purchase_return_qty: String(r.purchase_return_qty),
    adjustment_in_qty: String(r.adjustment_in_qty),
    adjustment_out_qty: String(r.adjustment_out_qty),
    available_qty: String(r.available_qty),
  }));

  const transit: TransitItem[] = transitRows.map((r) => ({
    transfer_no: String(r.transfer_no),
    source_location: String(r.source_location),
    destination_location: String(r.destination_location),
    sku: String(r.sku),
    product_name: String(r.product_name),
    unit_of_measure: String(r.unit_of_measure),
    quantity: String(r.quantity),
  }));

  return <InventoryReportClient
    scope={scope}
    stock={stock}
    transit={transit}
    initialFilters={filters}
  />;
}
