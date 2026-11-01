import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export type ReturnCredit = {
  divisionId: number;
  refundValuePaise: bigint;
  refundedPaise: bigint;
  exchangedPaise: bigint;
  /** What the customer is still owed for this return, in paise (never below zero). */
  availablePaise: bigint;
};

/**
 * The credit still owed to a customer for a posted return, read so that two people
 * using it at the same moment can never both get it.
 * It locks the return first, then reads refunds and exchange payments with locking
 * reads, which always see the newest saved figures (a plain read inside a running
 * transaction can show older figures). Call it inside the transaction that will use the credit.
 */
export async function lockReturnCredit(conn: PoolConnection, businessId: number, returnId: number): Promise<ReturnCredit | null> {
  const [rets] = await conn.execute<RowDataPacket[]>(
    `SELECT division_id, ROUND(refund_value * 100) AS value_paise
       FROM acct_sales_returns
      WHERE id = ? AND legal_business_id = ? AND status = 'POSTED' FOR UPDATE`,
    [returnId, businessId]
  );
  if (!rets[0]) return null;
  const [refunds] = await conn.execute<RowDataPacket[]>(
    `SELECT ROUND(amount * 100) AS p FROM acct_sales_refunds
      WHERE return_id = ? AND status = 'RECORDED' FOR UPDATE`,
    [returnId]
  );
  const [exchanged] = await conn.execute<RowDataPacket[]>(
    `SELECT ROUND(amount * 100) AS p FROM acct_sales_payments
      WHERE exchange_return_id = ? AND status = 'RECORDED' FOR UPDATE`,
    [returnId]
  );
  const sum = (rows: RowDataPacket[]) => rows.reduce((s, r) => s + BigInt(String(r.p)), 0n);
  const refundValuePaise = BigInt(String(rets[0].value_paise));
  const refundedPaise = sum(refunds);
  const exchangedPaise = sum(exchanged);
  const left = refundValuePaise - refundedPaise - exchangedPaise;
  return {
    divisionId: Number(rets[0].division_id),
    refundValuePaise, refundedPaise, exchangedPaise,
    availablePaise: left > 0n ? left : 0n,
  };
}
