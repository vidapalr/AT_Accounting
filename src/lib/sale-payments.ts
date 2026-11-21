import "server-only";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { lockCustomer } from "@/lib/customer-credit";
import { autoReverseForEdit } from "@/lib/ledger/reverse-in-tx";

/** Money methods: a payment the customer actually handed over (the others are set-offs, credit or returns). */
export const MONEY_METHODS = new Set(["CASH", "UPI", "BANK_TRANSFER", "CARD"]);

export const rupeesText = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

export type ReceivingAccount = { bankId: number | null; cashId: number | null; accountType: string; paymentAccount: string };

/**
 * Checks the account a sale payment went into ("CASH:3" or "BANK:5") against the way it was paid,
 * and returns the columns to store. Null when the account is not usable.
 */
export async function receivingAccount(conn: PoolConnection, businessId: number, method: string, account: string): Promise<ReceivingAccount | null> {
  const [kind, rawId] = account.split(":");
  const id = Number(rawId);
  if (!MONEY_METHODS.has(method) || !Number.isSafeInteger(id) || id <= 0 || (method === "CASH") !== (kind === "CASH")) return null;
  if (kind === "BANK") {
    const [bank] = await conn.execute<RowDataPacket[]>(
      `SELECT id, ownership_type FROM acct_bank_accounts
        WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE' AND verification_status = 'VERIFIED' AND can_receive = 1`,
      [businessId, id]
    );
    if (bank.length !== 1) return null;
    return {
      bankId: id, cashId: null,
      accountType: method === "UPI" ? "UPI" : method === "CARD" ? "CARD" : "BANK",
      paymentAccount: bank[0].ownership_type === "INVESTOR" ? "INVESTMENT_BANKING" : "BUSINESS",
    };
  }
  if (kind !== "CASH") return null;
  const [cash] = await conn.execute<RowDataPacket[]>(
    `SELECT id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [businessId, id]);
  return cash.length === 1 ? { bankId: null, cashId: id, accountType: "CASH", paymentAccount: "CASH" } : null;
}

/**
 * A bill was lowered below the money already received: the extra is kept as credit we owe the customer
 * (it can be paid back or used on the next bill). The newest payments are reduced first; each changed
 * payment's book entry is reversed so it posts again with the new amount. Inside the caller's transaction,
 * with the business row and the bill locked. Returns how much was moved, or why it could not be.
 */
export async function moveExcessToCustomerCredit(conn: PoolConnection, o: {
  businessId: number; userId: number; saleId: number; invoiceNo: string; divisionId: number; customerId: number; excess: bigint;
}): Promise<{ ok: true; moved: bigint } | { ok: false; reason: "period-closed" | "failed" }> {
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT id, ROUND(amount * 100) AS paise, payment_method, bank_account_id, cash_account_id,
            DATE_FORMAT(payment_date, '%Y-%m-%d') AS d, payment_reference
       FROM acct_sales_payments
      WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'
      ORDER BY payment_date DESC, id DESC FOR UPDATE`,
    [o.businessId, o.saleId]
  );
  let left = o.excess;
  let moved = 0n;
  await lockCustomer(conn, o.businessId, o.customerId);
  for (const p of rows) {
    if (left <= 0n) break;
    if (!MONEY_METHODS.has(String(p.payment_method))) continue;
    const amount = BigInt(String(p.paise));
    const take = amount < left ? amount : left;
    const undone = await autoReverseForEdit(conn, {
      businessId: o.businessId, userId: o.userId, sourceType: "SALES_RECEIPT", sourceId: Number(p.id),
      reason: `Edited: invoice ${o.invoiceNo} lowered below the money received`,
    });
    if (!undone.ok) return { ok: false, reason: undone.reason };
    if (take === amount) {
      await conn.execute(`UPDATE acct_sales_payments SET status = 'VOID', remarks = 'Moved to customer credit (bill lowered)' WHERE id = ?`, [Number(p.id)]);
    } else {
      await conn.execute(`UPDATE acct_sales_payments SET amount = ?, remarks = 'Part moved to customer credit (bill lowered)' WHERE id = ?`, [rupeesText(amount - take), Number(p.id)]);
    }
    await conn.execute(
      `INSERT INTO acct_customer_credits
         (legal_business_id, division_id, customer_id, entry_type, entry_date, amount, payment_method,
          bank_account_id, cash_account_id, reference, source_sale_id, remarks, created_by)
       VALUES (?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [o.businessId, o.divisionId, o.customerId, String(p.d), rupeesText(take), String(p.payment_method),
       p.bank_account_id, p.cash_account_id, p.payment_reference, o.saleId, `Bill ${o.invoiceNo} lowered after payment`, o.userId]
    );
    left -= take;
    moved += take;
  }
  return { ok: true, moved };
}
