import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { billCreditSql } from "@/lib/supplier-ledger";
import { totalDue, type DueBill } from "@/lib/setoff-math";

type Queryable = Pool | PoolConnection;
type Row = RowDataPacket & Record<string, string | number | null>;

export type NamedBill = DueBill & { ref: string; total: bigint; divisionId: number };

/** Posted invoices of one customer that still have something unpaid (total minus payments). */
export async function loadCustomerBills(db: Queryable, businessId: number, customerId: number, lock = false): Promise<NamedBill[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT s.id, s.invoice_no, s.division_id, DATE_FORMAT(s.invoice_date, '%Y-%m-%d') AS d,
            ROUND(s.grand_total * 100) AS total_paise,
            COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
                       WHERE p.legal_business_id = s.legal_business_id AND p.sale_id = s.id
                         AND p.status = 'RECORDED'), 0) AS paid_paise
       FROM acct_sales_headers s
      WHERE s.legal_business_id = ? AND s.status = 'POSTED' AND s.customer_id = ?
      ORDER BY s.invoice_date, s.id${lock ? " FOR UPDATE" : ""}`,
    [businessId, customerId]
  );
  return rows
    .map((r) => ({
      id: Number(r.id), ref: String(r.invoice_no), date: String(r.d), divisionId: Number(r.division_id),
      total: BigInt(r.total_paise as number | string), due: BigInt(r.total_paise as number | string) - BigInt(r.paid_paise as number | string),
    }))
    .filter((b) => b.due > 0n);
}

/** Posted supplier bills that still have something to pay (total, less return credit, less payments). */
export async function loadSupplierBills(db: Queryable, businessId: number, supplierId: number, lock = false): Promise<NamedBill[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT h.id, h.purchase_no, h.supplier_invoice_no, h.division_id,
            DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%Y-%m-%d') AS d,
            ROUND((COALESCE((SELECT SUM(l.line_amount) FROM acct_purchase_lines l
                              WHERE l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id), 0)
                   - ${billCreditSql("h")}) * 100) AS total_paise,
            COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_purchase_payments p
                       WHERE p.legal_business_id = h.legal_business_id AND p.purchase_id = h.id
                         AND p.status = 'VERIFIED'), 0) AS paid_paise
       FROM acct_purchase_headers h
      WHERE h.legal_business_id = ? AND h.status = 'POSTED' AND h.supplier_id = ?
      ORDER BY COALESCE(h.received_date, h.invoice_date), h.id${lock ? " FOR UPDATE" : ""}`,
    [businessId, supplierId]
  );
  return rows
    .map((r) => ({
      id: Number(r.id), ref: String(r.supplier_invoice_no || r.purchase_no), date: String(r.d), divisionId: Number(r.division_id),
      total: BigInt(r.total_paise as number | string), due: BigInt(r.total_paise as number | string) - BigInt(r.paid_paise as number | string),
    }))
    .filter((b) => b.due > 0n);
}

export type LinkedPerson = {
  supplierId: number;
  customerId: number;
  supplierName: string;
  customerName: string;
  theyOweUs: bigint;
  weOweThem: bigint;
};

export async function loadLinkedPeople(db: Queryable, businessId: number): Promise<LinkedPerson[]> {
  const [links] = await db.query<Row[]>(
    `SELECT s.id AS supplier_id, c.id AS customer_id, s.supplier_name, c.full_name
       FROM acct_suppliers s
       JOIN acct_customers c ON c.legal_business_id = s.legal_business_id AND c.id = s.linked_customer_id
      WHERE s.legal_business_id = ? AND c.linked_supplier_id = s.id
      ORDER BY s.supplier_name`,
    [businessId]
  );
  const out: LinkedPerson[] = [];
  for (const l of links) {
    const [sb, cb] = await Promise.all([
      loadSupplierBills(db, businessId, Number(l.supplier_id)),
      loadCustomerBills(db, businessId, Number(l.customer_id)),
    ]);
    out.push({
      supplierId: Number(l.supplier_id), customerId: Number(l.customer_id),
      supplierName: String(l.supplier_name), customerName: String(l.full_name),
      theyOweUs: totalDue(cb), weOweThem: totalDue(sb),
    });
  }
  return out;
}

/** For the small note on a supplier or customer page: the other side of this person, if linked. */
export async function loadOtherSide(
  db: Queryable, businessId: number, who: { supplierId: number } | { customerId: number }
): Promise<LinkedPerson | null> {
  const [rows] = await db.query<Row[]>(
    "supplierId" in who
      ? `SELECT s.id AS supplier_id, c.id AS customer_id FROM acct_suppliers s
           JOIN acct_customers c ON c.legal_business_id = s.legal_business_id AND c.id = s.linked_customer_id
          WHERE s.legal_business_id = ? AND s.id = ? AND c.linked_supplier_id = s.id`
      : `SELECT s.id AS supplier_id, c.id AS customer_id FROM acct_customers c
           JOIN acct_suppliers s ON s.legal_business_id = c.legal_business_id AND s.id = c.linked_supplier_id
          WHERE c.legal_business_id = ? AND c.id = ? AND s.linked_customer_id = c.id`,
    [businessId, "supplierId" in who ? who.supplierId : who.customerId]
  );
  if (!rows[0]) return null;
  const all = await loadLinkedPeople(db, businessId);
  return all.find((p) => p.supplierId === Number(rows[0].supplier_id)) ?? null;
}
