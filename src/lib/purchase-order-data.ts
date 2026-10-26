import "server-only";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

type Row = RowDataPacket & Record<string, string | number | null>;

/** Suppliers, warehouses and items for the order form. */
export async function loadOrderChoices(businessId: number, divisionId: number) {
  const [suppliers] = await db.execute<Row[]>(
    `SELECT id, supplier_code, supplier_name FROM acct_suppliers WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY supplier_name`,
    [businessId]
  );
  const [locations] = await db.execute<Row[]>(
    `SELECT id, location_code, location_name FROM acct_inventory_locations
      WHERE legal_business_id = ? AND division_id = ? AND location_type = 'CENTRAL_WAREHOUSE' AND status = 'ACTIVE' ORDER BY location_name`,
    [businessId, divisionId]
  );
  const [skus] = await db.execute<Row[]>(
    `SELECT v.id, v.sku, p.product_name, v.size_label, v.color_name, v.unit_of_measure
       FROM acct_product_variants v
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id AND p.division_id = v.division_id
      WHERE v.legal_business_id = ? AND v.division_id = ? AND v.status = 'ACTIVE' AND p.status = 'ACTIVE'
      ORDER BY p.product_name, v.sku`,
    [businessId, divisionId]
  );
  return {
    suppliers: suppliers.map((s) => ({ id: Number(s.id), supplier_code: String(s.supplier_code), supplier_name: String(s.supplier_name) })),
    locations: locations.map((l) => ({ id: Number(l.id), location_code: String(l.location_code), location_name: String(l.location_name) })),
    skus: skus.map((s) => ({
      id: Number(s.id), sku: String(s.sku), product_name: String(s.product_name),
      size_label: s.size_label as string | null, color_name: s.color_name as string | null, unit_of_measure: String(s.unit_of_measure),
    })),
  };
}
