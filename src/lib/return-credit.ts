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

const rupees = (p: bigint) => `${p / 100n}.${(p % 100n).toString().padStart(2, "0")}`;

/**
 * Uses a return's value to pay what is still unpaid on a bill (an EXCHANGE payment linked to the
 * return). No cash moves and no journal: the return already reduced what the customer owes in the
 * books. Returns the amount used (0 when nothing is unpaid or nothing is left on the return).
 * Call inside the transaction, with the bill locked.
 */
export async function settleBillFromReturn(conn: PoolConnection, input: {
  businessId: number; saleId: number; returnId: number; date: string; userId: number; remarks: string; maxPaise?: bigint;
}): Promise<bigint> {
  const [bills] = await conn.execute<RowDataPacket[]>(
    `SELECT division_id, ROUND(grand_total * 100) AS total_paise,
            (SELECT COALESCE(SUM(ROUND(p.amount * 100)), 0) FROM acct_sales_payments p
              WHERE p.legal_business_id = h.legal_business_id AND p.sale_id = h.id AND p.status = 'RECORDED') AS paid_paise
       FROM acct_sales_headers h WHERE h.legal_business_id = ? AND h.id = ? AND h.status = 'POSTED'`,
    [input.businessId, input.saleId]
  );
  if (!bills[0]) return 0n;
  const unpaid = BigInt(String(bills[0].total_paise)) - BigInt(String(bills[0].paid_paise));
  const credit = await lockReturnCredit(conn, input.businessId, input.returnId);
  if (!credit || unpaid <= 0n || credit.availablePaise <= 0n) return 0n;
  let take = credit.availablePaise < unpaid ? credit.availablePaise : unpaid;
  if (input.maxPaise !== undefined && input.maxPaise < take) take = input.maxPaise;
  if (take <= 0n) return 0n;
  await conn.execute(
    `INSERT INTO acct_sales_payments (legal_business_id, division_id, sale_id, payment_date, payment_method,
       payment_account_type, bank_account_id, cash_account_id, payment_account, amount, payment_reference, remarks,
       status, created_by, exchange_return_id)
     VALUES (?, ?, ?, ?, 'EXCHANGE', 'OTHERS', NULL, NULL, NULL, ?, NULL, ?, 'RECORDED', ?, ?)`,
    [input.businessId, bills[0].division_id, input.saleId, input.date, rupees(take), input.remarks.slice(0, 250), input.userId, input.returnId]
  );
  return take;
}
