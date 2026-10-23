import "server-only";
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { nextCode } from "@/lib/codes";

type Conn = Pool | PoolConnection;

export type CustomerRef = {
  id: number;
  full_name: string;
  phone: string | null;
  credit_limit_paise: bigint;
};

/**
 * Find the customer for a phone number, or add one. Called while saving a sale,
 * so staff never have to open a separate "add customer" screen first.
 */
export async function findOrCreateCustomer(
  conn: Conn,
  input: { businessId: number; userId: number; name: string; phone10: string }
): Promise<CustomerRef> {
  const read = async () => {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, full_name, phone, ROUND(credit_limit * 100) AS limit_paise
         FROM acct_customers
        WHERE legal_business_id = ? AND phone = ?`,
      [input.businessId, input.phone10]
    );
    return rows[0];
  };

  let row = await read();
  if (!row) {
    const code = await nextCode(conn, {
      table: "acct_customers",
      column: "customer_code",
      prefix: "CUS-",
      width: 4,
      where: "legal_business_id = ?",
      params: [input.businessId],
    });
    try {
      await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_customers
           (legal_business_id, customer_code, full_name, phone, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          input.businessId,
          code,
          input.name.trim() || `Customer ${input.phone10}`,
          input.phone10,
          input.userId,
        ]
      );
    } catch {
      // Someone else added the same phone a moment ago: use theirs.
    }
    row = await read();
  }

  return {
    id: Number(row.id),
    full_name: String(row.full_name),
    phone: row.phone as string | null,
    credit_limit_paise: BigInt(row.limit_paise ?? 0),
  };
}

/** What this customer still owes on posted invoices, in paise. */
export async function customerDuesPaise(
  conn: Conn,
  businessId: number,
  customerId: number,
  excludeSaleId = 0
): Promise<bigint> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(ROUND(s.grand_total * 100)), 0) AS billed,
       COALESCE(SUM((SELECT COALESCE(SUM(ROUND(p.amount * 100)), 0)
                       FROM acct_sales_payments p
                      WHERE p.legal_business_id = s.legal_business_id
                        AND p.sale_id = s.id AND p.status = 'RECORDED')), 0) AS paid
       FROM acct_sales_headers s
      WHERE s.legal_business_id = ? AND s.customer_id = ?
        AND s.status = 'POSTED' AND s.id <> ?`,
    [businessId, customerId, excludeSaleId]
  );
  return BigInt(rows[0].billed) - BigInt(rows[0].paid);
}
