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

export type PaymentFix = { ok: true } | { ok: false; reason: "invalid" | "not-correctable" | "invalid-account" | "invalid-date" | "period-closed" | "failed" };

/**
 * Change or remove one payment on a posted bill, inside the caller's transaction (business row already locked).
 * The old receipt's journal is reversed (kept in the books); the changed payment posts again later.
 * Used by the bill page (one payment) and the edit-bill screen (several at once).
 */
export async function fixSalePayment(conn: PoolConnection, o: {
  businessId: number; userId: number; saleId: number; invoiceNo: string; invoiceDate: string; paymentId: number;
  op: "change" | "remove"; method?: string; account?: string; amount?: bigint; date?: string; reference?: string; why: string;
}): Promise<PaymentFix> {
  const [pays] = await conn.execute<RowDataPacket[]>(
    `SELECT id, payment_method, ROUND(amount * 100) AS paise FROM acct_sales_payments
      WHERE legal_business_id = ? AND id = ? AND sale_id = ? AND status = 'RECORDED' FOR UPDATE`,
    [o.businessId, o.paymentId, o.saleId]
  );
  const pay = pays[0];
  if (!pay) return { ok: false, reason: "invalid" };
  const method = String(pay.payment_method);
  if (!MONEY_METHODS.has(method) && !(method === "EXCHANGE" && o.op === "remove")) return { ok: false, reason: "not-correctable" };
  let acc: ReceivingAccount | null = null;
  if (o.op === "change") {
    if (!o.amount || o.amount <= 0n || !MONEY_METHODS.has(o.method ?? "")) return { ok: false, reason: "invalid" };
    acc = await receivingAccount(conn, o.businessId, o.method!, o.account ?? "");
    if (!acc) return { ok: false, reason: "invalid-account" };
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    if (!o.date || !/^\d{4}-\d{2}-\d{2}$/.test(o.date) || o.date < o.invoiceDate || o.date > today) return { ok: false, reason: "invalid-date" };
  }
  if (method !== "EXCHANGE") {
    const undone = await autoReverseForEdit(conn, {
      businessId: o.businessId, userId: o.userId, sourceType: "SALES_RECEIPT", sourceId: o.paymentId,
      reason: `${o.op === "remove" ? "Removed" : "Edited"}: payment ${o.paymentId} on invoice ${o.invoiceNo}`,
    });
    if (!undone.ok) return { ok: false, reason: undone.reason === "period-closed" ? "period-closed" : "failed" };
  }
  if (o.op === "remove") {
    await conn.execute(`UPDATE acct_sales_payments SET status = 'VOID', remarks = ? WHERE id = ?`, [`Removed: ${o.why}`.slice(0, 250), o.paymentId]);
  } else {
    await conn.execute(
      `UPDATE acct_sales_payments SET amount = ?, payment_method = ?, payment_account_type = ?, bank_account_id = ?, cash_account_id = ?,
              payment_account = ?, payment_date = ?, payment_reference = ? WHERE id = ?`,
      [rupeesText(o.amount!), o.method ?? null, acc!.accountType, acc!.bankId, acc!.cashId, acc!.paymentAccount, o.date ?? null, o.reference || null, o.paymentId]
    );
  }
  await conn.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, ?, 'SALE', ?, ?)`,
    [o.businessId, o.userId, o.op === "remove" ? "SALE_PAYMENT_REMOVED" : "SALE_PAYMENT_CHANGED", o.saleId,
     JSON.stringify({ paymentId: o.paymentId, from: rupeesText(BigInt(String(pay.paise))), to: o.op === "change" ? rupeesText(o.amount!) : "0", why: o.why })]
  );
  return { ok: true };
}

/** Records money received on a posted bill (the caller decides how much goes to the bill). */
export async function insertSalePayment(conn: PoolConnection, o: {
  businessId: number; userId: number; divisionId: number; saleId: number; date: string; method: string; acc: ReceivingAccount; amount: bigint; reference?: string;
}): Promise<void> {
  await conn.execute(
    `INSERT INTO acct_sales_payments (
       legal_business_id, division_id, sale_id, payment_date,
       payment_method, payment_account_type, bank_account_id,
       cash_account_id, payment_account, amount, payment_reference,
       status, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)`,
    [o.businessId, o.divisionId, o.saleId, o.date, o.method, o.acc.accountType, o.acc.bankId, o.acc.cashId, o.acc.paymentAccount,
     rupeesText(o.amount), o.reference || null, o.userId] as Array<string | number | null>
  );
}
