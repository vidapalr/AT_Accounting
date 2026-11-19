"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canUseDivision } from "@/lib/scope";
import { customerCreditPaise, lockCustomer } from "@/lib/customer-credit";
import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { lockReturnCredit } from "@/lib/return-credit";

const METHODS = new Set(["CASH", "UPI", "BANK_TRANSFER", "CARD"]);

function paise(value: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return -1n;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}
const rupees = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

/** Shared by "receive money on account" and "refund credit". */
async function run(form: FormData, kind: "RECEIVED" | "REFUNDED"): Promise<void> {
  const user = await requireAccess("customers");
  const businessId = user.legal_business_id;
  const customerId = Number(form.get("customer_id"));
  const back = `/accounting/customers/${customerId}`;
  const amount = paise(String(form.get("amount") ?? ""));
  const method = String(form.get("method") ?? "");
  const account = String(form.get("account") ?? "");
  const date = String(form.get("entry_date") ?? "");
  const reference = String(form.get("reference") ?? "").trim().slice(0, 150);
  const [acctKind, rawId] = account.split(":");
  const accountId = Number(rawId);

  if (
    !Number.isSafeInteger(customerId) || customerId <= 0 || amount <= 0n ||
    !METHODS.has(method) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !["BANK", "CASH"].includes(acctKind) || !Number.isSafeInteger(accountId) || accountId <= 0 ||
    (method === "CASH") !== (acctKind === "CASH")
  ) redirect(`${back}?result=credit-invalid`);

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    if (!(await lockCustomer(conn, businessId, customerId))) {
      result = "credit-invalid";
    } else {
      const [divs] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_divisions WHERE legal_business_id = ? ORDER BY id LIMIT 1`, [businessId]);
      // Use the user's own division when they have one, otherwise the first.
      const divisionId = Number(user.scope_division_id ?? divs[0]?.id);
      const [acc] = acctKind === "BANK"
        ? await conn.execute<RowDataPacket[]>(
            `SELECT id FROM acct_bank_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'` +
            (kind === "RECEIVED" ? ` AND verification_status = 'VERIFIED' AND can_receive = 1` : ``),
            [businessId, accountId])
        : await conn.execute<RowDataPacket[]>(
            `SELECT id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
            [businessId, accountId]);

      if (!Number.isSafeInteger(divisionId) || !canUseDivision(user, divisionId)) {
        result = "credit-invalid";
      } else if (acc.length !== 1) {
        result = "credit-account";
      } else if (kind === "REFUNDED" && amount > (await customerCreditPaise(conn, businessId, customerId, { lock: true }))) {
        result = "credit-too-much";
      } else {
        await conn.execute(
          `INSERT INTO acct_customer_credits
             (legal_business_id, division_id, customer_id, entry_type, entry_date, amount, payment_method,
              bank_account_id, cash_account_id, reference, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [businessId, divisionId, customerId, kind, date, rupees(amount), method,
           acctKind === "BANK" ? accountId : null, acctKind === "CASH" ? accountId : null,
           reference || null, kind === "RECEIVED" ? "Money received on account" : "Credit paid back", user.id]
        );
        await conn.execute(
          `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
           VALUES (?, ?, ?, 'CUSTOMER', ?, ?)`,
          [businessId, user.id, kind === "RECEIVED" ? "CUSTOMER_CREDIT_RECEIVED" : "CUSTOMER_CREDIT_REFUNDED",
           customerId, JSON.stringify({ amount: rupees(amount), method })]
        );
        await conn.commit();
        result = kind === "RECEIVED" ? "credit-received" : "credit-refunded";
      }
    }
  } catch (e) {
    result = isMissingTable(e) ? "credit-setup" : "failed";
  } finally {
    if (result !== "credit-received" && result !== "credit-refunded") await conn.rollback().catch(() => undefined);
    conn.release();
  }
  revalidatePath(back);
  redirect(`${back}?result=${result}`);
}

export async function receiveCreditAction(form: FormData): Promise<void> { return run(form, "RECEIVED"); }
export async function refundCreditAction(form: FormData): Promise<void> { return run(form, "REFUNDED"); }

/** Use the customer's credit to pay (part of) a bill. No cash moves: the credit is already in the books. */
export async function useCreditOnSaleAction(form: FormData): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const saleId = Number(form.get("sale_id"));
  const back = `/accounting/sales/${saleId}`;
  if (!Number.isSafeInteger(saleId) || saleId <= 0) redirect(`${back}?pay=invalid`);

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [sales] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, customer_id, status, ROUND(grand_total * 100) AS total_paise,
              DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date
         FROM acct_sales_headers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, saleId]
    );
    const sale = canUseDivision(user, Number(sales[0]?.division_id)) ? sales[0] : undefined;
    if (!sale || sale.status !== "POSTED" || !sale.customer_id) {
      result = "invalid";
    } else {
      await lockCustomer(conn, businessId, Number(sale.customer_id));
      const [paid] = await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS p FROM acct_sales_payments
          WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`, [businessId, saleId]);
      const outstanding = BigInt(sale.total_paise) - BigInt(String(paid[0].p));
      const balance = await customerCreditPaise(conn, businessId, Number(sale.customer_id), { lock: true });
      const use = balance < outstanding ? balance : outstanding;
      if (use <= 0n) {
        result = "credit-none";
      } else {
        const today = new Date().toISOString().slice(0, 10);
        const date = today < String(sale.invoice_date) ? String(sale.invoice_date) : today;
        await conn.execute(
          `INSERT INTO acct_sales_payments (legal_business_id, division_id, sale_id, payment_date, payment_method,
             payment_account_type, bank_account_id, cash_account_id, payment_account, amount, payment_reference, remarks, status, created_by)
           VALUES (?, ?, ?, ?, 'CREDIT', 'OTHERS', NULL, NULL, NULL, ?, NULL, 'Customer credit used', 'RECORDED', ?)`,
          [businessId, sale.division_id, saleId, date, rupees(use), user.id]
        );
        await conn.execute(
          `INSERT INTO acct_customer_credits (legal_business_id, division_id, customer_id, entry_type, entry_date, amount, applied_sale_id, remarks, created_by)
           VALUES (?, ?, ?, 'USED', ?, ?, ?, 'Used on a bill', ?)`,
          [businessId, sale.division_id, Number(sale.customer_id), date, rupees(use), saleId, user.id]
        );
        await conn.commit();
        result = "ok-used";
      }
    }
  } catch (e) {
    result = isMissingTable(e) ? "credit-setup" : "failed";
  } finally {
    if (result !== "ok-used") await conn.rollback().catch(() => undefined);
    conn.release();
  }
  revalidatePath(back);
  redirect(`${back}?pay=${result}`);
}

/**
 * Use return value we still owe the customer (returns not yet paid back or used) to pay what is left on a bill.
 * Oldest return first. No cash moves and no journal: the return already reduced what the customer owes in the books.
 */
export async function useReturnValueOnSaleAction(form: FormData): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const saleId = Number(form.get("sale_id"));
  const back = `/accounting/sales/${saleId}`;
  if (!Number.isSafeInteger(saleId) || saleId <= 0) redirect(`${back}?pay=invalid`);

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [sales] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, customer_id, status, ROUND(grand_total * 100) AS total_paise,
              DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date
         FROM acct_sales_headers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, saleId]
    );
    const sale = canUseDivision(user, Number(sales[0]?.division_id)) ? sales[0] : undefined;
    if (!sale || sale.status !== "POSTED" || !sale.customer_id) {
      result = "invalid";
    } else {
      await lockCustomer(conn, businessId, Number(sale.customer_id));
      const [paid] = await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS p FROM acct_sales_payments
          WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`, [businessId, saleId]);
      let left = BigInt(sale.total_paise) - BigInt(String(paid[0].p));
      const [rets] = await conn.execute<RowDataPacket[]>(
        `SELECT r.id FROM acct_sales_returns r
           JOIN acct_sales_headers h ON h.id = r.sale_id AND h.legal_business_id = r.legal_business_id
          WHERE r.legal_business_id = ? AND r.status = 'POSTED' AND h.customer_id = ?
          ORDER BY r.return_date, r.id`,
        [businessId, Number(sale.customer_id)]
      );
      const today = new Date().toISOString().slice(0, 10);
      const date = today < String(sale.invoice_date) ? String(sale.invoice_date) : today;
      let used = 0n;
      for (const r of rets) {
        if (left <= 0n) break;
        const credit = await lockReturnCredit(conn, businessId, Number(r.id));
        if (!credit || credit.availablePaise <= 0n) continue;
        const take = credit.availablePaise < left ? credit.availablePaise : left;
        await conn.execute(
          `INSERT INTO acct_sales_payments (legal_business_id, division_id, sale_id, payment_date, payment_method,
             payment_account_type, bank_account_id, cash_account_id, payment_account, amount, payment_reference, remarks,
             status, created_by, exchange_return_id)
           VALUES (?, ?, ?, ?, 'EXCHANGE', 'OTHERS', NULL, NULL, NULL, ?, NULL, 'Return value used', 'RECORDED', ?, ?)`,
          [businessId, sale.division_id, saleId, date, rupees(take), user.id, Number(r.id)]
        );
        left -= take;
        used += take;
      }
      if (used <= 0n) {
        result = "return-none";
      } else {
        await conn.commit();
        result = "ok-return";
      }
    }
  } catch (e) {
    result = isMissingTable(e) || isMissingColumn(e) ? "return-setup" : "failed";
  } finally {
    if (result !== "ok-return") await conn.rollback().catch(() => undefined);
    conn.release();
  }
  revalidatePath(back);
  redirect(`${back}?pay=${result}`);
}
