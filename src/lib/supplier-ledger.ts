import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { parsePaise } from "@/lib/returns-math";
import type { StatementEvent } from "@/lib/supplier-statement";

type Queryable = Pool | PoolConnection;
type Row = RowDataPacket & Record<string, string | number | null>;

/**
 * SQL for "the credit the supplier gave us on this bill, not yet paid back to us":
 * the agreed value of every return made against the bill, less any refund
 * already received for those returns. Subtract it from the bill total to get
 * what is really payable on the bill.
 *
 * `alias` is the purchase header alias in the surrounding query and must
 * expose legal_business_id and id.
 */
export function billCreditSql(alias: string): string {
  return `COALESCE((
    SELECT SUM(sr.agreed_value - COALESCE((
             SELECT SUM(rf.amount) FROM acct_supplier_refunds rf
             WHERE rf.legal_business_id = sr.legal_business_id
               AND rf.return_id = sr.id AND rf.status = 'RECORDED'), 0))
    FROM acct_supplier_returns sr
    WHERE sr.legal_business_id = ${alias}.legal_business_id
      AND sr.purchase_id = ${alias}.id
      AND sr.status = 'POSTED'
  ), 0)`;
}

/** Every bill, payment, return and refund for one supplier, as statement events. */
export async function loadSupplierEvents(
  db: Queryable,
  businessId: number,
  supplierId: number
): Promise<StatementEvent[]> {
  const events: StatementEvent[] = [];

  const [bills] = await db.query<Row[]>(
    `SELECT h.purchase_no, DATE_FORMAT(COALESCE(h.received_date, h.invoice_date), '%Y-%m-%d') AS d,
            COALESCE(SUM(l.line_amount), 0) AS total
     FROM acct_purchase_headers h
     LEFT JOIN acct_purchase_lines l
       ON l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id
     WHERE h.legal_business_id = ? AND h.supplier_id = ? AND h.status = 'POSTED'
     GROUP BY h.id, h.purchase_no, h.received_date, h.invoice_date`,
    [businessId, supplierId]
  );
  for (const b of bills) {
    events.push({ date: String(b.d), kind: "BILL", ref: String(b.purchase_no), amount: parsePaise(String(b.total)) });
  }

  const [payments] = await db.query<Row[]>(
    `SELECT p.payment_no, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, p.amount
     FROM acct_purchase_payments p
     JOIN acct_purchase_headers h
       ON h.legal_business_id = p.legal_business_id AND h.id = p.purchase_id
     WHERE p.legal_business_id = ? AND h.supplier_id = ? AND p.status = 'VERIFIED'
       AND h.status = 'POSTED'`,
    [businessId, supplierId]
  );
  for (const p of payments) {
    events.push({ date: String(p.d), kind: "PAYMENT", ref: String(p.payment_no), amount: parsePaise(String(p.amount)) });
  }

  const [returns] = await db.query<Row[]>(
    `SELECT return_no, DATE_FORMAT(return_date, '%Y-%m-%d') AS d, agreed_value
     FROM acct_supplier_returns
     WHERE legal_business_id = ? AND supplier_id = ? AND status = 'POSTED'`,
    [businessId, supplierId]
  );
  for (const r of returns) {
    events.push({ date: String(r.d), kind: "RETURN", ref: String(r.return_no), amount: parsePaise(String(r.agreed_value)) });
  }

  const [refunds] = await db.query<Row[]>(
    `SELECT f.id, DATE_FORMAT(f.refund_date, '%Y-%m-%d') AS d, f.amount
     FROM acct_supplier_refunds f
     WHERE f.legal_business_id = ? AND f.supplier_id = ? AND f.status = 'RECORDED'`,
    [businessId, supplierId]
  );
  for (const f of refunds) {
    events.push({ date: String(f.d), kind: "REFUND", ref: `Refund ${f.id}`, amount: parsePaise(String(f.amount)) });
  }

  return events.filter((e) => e.amount > 0n);
}

export type SupplierBalance = {
  supplierId: number;
  billed: bigint;
  paid: bigint;
  returned: bigint;
  refunded: bigint;
  /** > 0 we owe him; < 0 he owes us. */
  balance: bigint;
};

/** One line per supplier: what we owe, or what he owes us. */
export async function loadSupplierBalances(db: Queryable, businessId: number): Promise<Map<number, SupplierBalance>> {
  const out = new Map<number, SupplierBalance>();
  const get = (id: number) => {
    let row = out.get(id);
    if (!row) {
      row = { supplierId: id, billed: 0n, paid: 0n, returned: 0n, refunded: 0n, balance: 0n };
      out.set(id, row);
    }
    return row;
  };

  const [bills] = await db.query<Row[]>(
    `SELECT h.supplier_id, COALESCE(SUM(l.line_amount), 0) AS v
     FROM acct_purchase_headers h
     JOIN acct_purchase_lines l
       ON l.legal_business_id = h.legal_business_id AND l.purchase_id = h.id
     WHERE h.legal_business_id = ? AND h.status = 'POSTED'
     GROUP BY h.supplier_id`,
    [businessId]
  );
  for (const r of bills) get(Number(r.supplier_id)).billed = parsePaise(String(r.v));

  const [payments] = await db.query<Row[]>(
    `SELECT h.supplier_id, COALESCE(SUM(p.amount), 0) AS v
     FROM acct_purchase_payments p
     JOIN acct_purchase_headers h
       ON h.legal_business_id = p.legal_business_id AND h.id = p.purchase_id
     WHERE p.legal_business_id = ? AND p.status = 'VERIFIED' AND h.status = 'POSTED'
     GROUP BY h.supplier_id`,
    [businessId]
  );
  for (const r of payments) get(Number(r.supplier_id)).paid = parsePaise(String(r.v));

  const [returns] = await db.query<Row[]>(
    `SELECT supplier_id, COALESCE(SUM(agreed_value), 0) AS v
     FROM acct_supplier_returns
     WHERE legal_business_id = ? AND status = 'POSTED' GROUP BY supplier_id`,
    [businessId]
  );
  for (const r of returns) get(Number(r.supplier_id)).returned = parsePaise(String(r.v));

  const [refunds] = await db.query<Row[]>(
    `SELECT supplier_id, COALESCE(SUM(amount), 0) AS v
     FROM acct_supplier_refunds
     WHERE legal_business_id = ? AND status = 'RECORDED' GROUP BY supplier_id`,
    [businessId]
  );
  for (const r of refunds) get(Number(r.supplier_id)).refunded = parsePaise(String(r.v));

  for (const row of out.values()) {
    row.balance = row.billed - row.paid - row.returned + row.refunded;
  }
  return out;
}
