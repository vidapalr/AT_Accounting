import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { creditBalance, type CreditEntry } from "@/lib/customer-credit-math";
import { isMissingTable } from "@/lib/db-errors";

type Queryable = Pick<PoolConnection, "execute">;

/** What we hold for a customer in credit, in paise. Zero when the credit table is not there yet. */
export async function customerCreditPaise(conn: Queryable, businessId: number, customerId: number, opts: { lock?: boolean } = {}): Promise<bigint> {
  try {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT entry_type, ROUND(amount * 100) AS p FROM acct_customer_credits
        WHERE legal_business_id = ? AND customer_id = ? AND status = 'RECORDED'${opts.lock ? " FOR UPDATE" : ""}`,
      [businessId, customerId]
    );
    const entries: CreditEntry[] = rows.map((r) => ({ type: String(r.entry_type) as CreditEntry["type"], amount: BigInt(String(r.p)) }));
    return creditBalance(entries);
  } catch (e) {
    if (isMissingTable(e)) return 0n;
    throw e;
  }
}

/** Takes the customer's row as a lock, so two people cannot change the same customer's credit at once. */
export async function lockCustomer(conn: Queryable, businessId: number, customerId: number): Promise<boolean> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM acct_customers WHERE legal_business_id = ? AND id = ? FOR UPDATE`, [businessId, customerId]);
  return rows.length === 1;
}
