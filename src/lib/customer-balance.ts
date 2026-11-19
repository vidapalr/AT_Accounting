import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { creditBalance, type CreditEntry } from "@/lib/customer-credit-math";
import { withNet, ZERO_PARTS, type Balance, type BalanceParts } from "@/lib/customer-balance-math";
import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { loadLinkedPeople } from "@/lib/party-link";

type Queryable = Pool | PoolConnection;
type Row = RowDataPacket & Record<string, string | number | null>;

/** Key used for bills with no customer on them (walk-ins). */
export const WALK_IN = 0;

/**
 * Every customer's balance, worked out the same way for every screen (customer page, customer list,
 * new-sale lookup, dashboard). Only customers with something not zero are in the map.
 * Bills with no customer are under WALK_IN.
 * includeSupplier: set off what we owe the same person as a supplier (only for roles that may see both sides).
 */
export async function customerBalances(
  db: Queryable,
  businessId: number,
  opts: { customerIds?: number[]; includeSupplier: boolean }
): Promise<Map<number, Balance>> {
  const ids = opts.customerIds?.filter((n) => Number.isSafeInteger(n) && n > 0);
  if (ids && ids.length === 0) return new Map();
  const only = (col: string) => (ids ? ` AND ${col} IN (${ids.map(() => "?").join(",")})` : "");
  const args = ids ?? [];

  const parts = new Map<number, BalanceParts>();
  const bump = (id: number, key: keyof BalanceParts, v: bigint) => {
    if (v === 0n) return;
    const p = parts.get(id) ?? { ...ZERO_PARTS };
    p[key] += v;
    parts.set(id, p);
  };

  const [bills] = await db.query<Row[]>(
    `SELECT COALESCE(h.customer_id, 0) AS cid,
            SUM(ROUND(h.grand_total * 100)
                - COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
                             WHERE p.legal_business_id = h.legal_business_id AND p.sale_id = h.id
                               AND p.status = 'RECORDED'), 0)) AS due
       FROM acct_sales_headers h
      WHERE h.legal_business_id = ? AND h.status = 'POSTED'${only("h.customer_id")}
      GROUP BY COALESCE(h.customer_id, 0)`,
    [businessId, ...args]
  );
  for (const r of bills) bump(Number(r.cid), "billsDue", BigInt(String(r.due ?? 0)));

  try {
    const [rets] = await db.query<Row[]>(
      `SELECT COALESCE(h.customer_id, 0) AS cid,
              SUM(GREATEST(0, ROUND(r.refund_value * 100)
                  - COALESCE((SELECT SUM(ROUND(f.amount * 100)) FROM acct_sales_refunds f
                               WHERE f.return_id = r.id AND f.status = 'RECORDED'), 0)
                  - COALESCE((SELECT SUM(ROUND(x.amount * 100)) FROM acct_sales_payments x
                               WHERE x.exchange_return_id = r.id AND x.status = 'RECORDED'), 0))) AS owed
         FROM acct_sales_returns r
         JOIN acct_sales_headers h ON h.id = r.sale_id AND h.legal_business_id = r.legal_business_id
        WHERE r.legal_business_id = ? AND r.status = 'POSTED'${only("h.customer_id")}
        GROUP BY COALESCE(h.customer_id, 0)`,
      [businessId, ...args]
    );
    for (const r of rets) bump(Number(r.cid), "returnOwed", BigInt(String(r.owed ?? 0)));
  } catch (e) {
    if (!isMissingTable(e) && !isMissingColumn(e)) throw e; // returns or exchange not set up yet
  }

  try {
    const [credits] = await db.query<Row[]>(
      `SELECT customer_id AS cid, entry_type, SUM(ROUND(amount * 100)) AS p
         FROM acct_customer_credits
        WHERE legal_business_id = ? AND status = 'RECORDED'${only("customer_id")}
        GROUP BY customer_id, entry_type`,
      [businessId, ...args]
    );
    const byCustomer = new Map<number, CreditEntry[]>();
    for (const r of credits) {
      const list = byCustomer.get(Number(r.cid)) ?? [];
      list.push({ type: String(r.entry_type) as CreditEntry["type"], amount: BigInt(String(r.p ?? 0)) });
      byCustomer.set(Number(r.cid), list);
    }
    for (const [cid, entries] of byCustomer) bump(cid, "creditHeld", creditBalance(entries));
  } catch (e) {
    if (!isMissingTable(e)) throw e; // migration 082 not run yet
  }

  if (opts.includeSupplier) {
    for (const p of await loadLinkedPeople(db, businessId)) {
      if (!ids || ids.includes(p.customerId)) bump(p.customerId, "supplierOwed", p.weOweThem);
    }
  }

  const out = new Map<number, Balance>();
  for (const [id, p] of parts) out.set(id, withNet(p));
  return out;
}

/** One customer's balance (zero parts when nothing is owed either way). */
export async function customerBalance(db: Queryable, businessId: number, customerId: number, includeSupplier: boolean): Promise<Balance> {
  const map = await customerBalances(db, businessId, { customerIds: [customerId], includeSupplier });
  return map.get(customerId) ?? withNet(ZERO_PARTS);
}
