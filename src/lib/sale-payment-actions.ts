"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canGiveBillDiscount } from "@/lib/access";

const METHODS = new Set(["CASH", "UPI", "BANK_TRANSFER", "CARD"]);

function paise(value: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return -1n;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

const rupees = (p: bigint) =>
  `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

/**
 * Take a payment against an invoice that is already saved (credit sale or part
 * payment). It never lets the total collected go above the invoice total.
 */
export async function receiveSalePaymentAction(form: FormData): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;

  const saleId = Number(form.get("sale_id"));
  const back = `/accounting/sales/${saleId}`;
  const amount = paise(String(form.get("amount") ?? ""));
  const method = String(form.get("method") ?? "");
  const account = String(form.get("account") ?? "");
  const date = String(form.get("payment_date") ?? "");
  const reference = String(form.get("reference") ?? "").trim().slice(0, 150);
  const [kind, rawId] = account.split(":");
  const accountId = Number(rawId);

  if (
    !Number.isSafeInteger(saleId) || saleId <= 0 ||
    amount <= 0n ||
    !METHODS.has(method) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !["BANK", "CASH"].includes(kind) ||
    !Number.isSafeInteger(accountId) || accountId <= 0 ||
    (method === "CASH") !== (kind === "CASH")
  ) {
    redirect(`${back}?pay=invalid`);
  }

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [sales] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, status, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
              ROUND(grand_total * 100) AS total_paise
         FROM acct_sales_headers
        WHERE legal_business_id = ? AND id = ?
        FOR UPDATE`,
      [businessId, saleId]
    );
    const sale = sales[0];

    if (!sale) {
      result = "invalid";
    } else if (sale.status !== "POSTED") {
      result = "not-posted";
    } else {
      const [paid] = await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS paid_paise
           FROM acct_sales_payments
          WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`,
        [businessId, saleId]
      );
      const outstanding = BigInt(sale.total_paise) - BigInt(paid[0].paid_paise);

      let bankId: number | null = null;
      let cashId: number | null = null;
      let accountType = "CASH";
      let paymentAccount = "CASH";

      if (kind === "BANK") {
        const [bank] = await conn.execute<RowDataPacket[]>(
          `SELECT id, ownership_type FROM acct_bank_accounts
            WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'
              AND verification_status = 'VERIFIED' AND can_receive = 1`,
          [businessId, accountId]
        );
        if (bank.length === 1) {
          bankId = accountId;
          accountType = method === "UPI" ? "UPI" : method === "CARD" ? "CARD" : "BANK";
          paymentAccount =
            bank[0].ownership_type === "INVESTOR" ? "INVESTMENT_BANKING" : "ABHIRAM_GROUP";
        }
      } else {
        const [cash] = await conn.execute<RowDataPacket[]>(
          `SELECT id FROM acct_cash_accounts
            WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
          [businessId, accountId]
        );
        if (cash.length === 1) cashId = accountId;
      }

      if (bankId === null && cashId === null) {
        result = "invalid-account";
      } else if (amount > outstanding) {
        result = "too-much";
      } else if (date < String(sale.invoice_date)) {
        result = "invalid-date";
      } else {
        await conn.execute(
          `INSERT INTO acct_sales_payments (
             legal_business_id, division_id, sale_id, payment_date,
             payment_method, payment_account_type, bank_account_id,
             cash_account_id, payment_account, amount, payment_reference,
             status, created_by
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)`,
          [
            businessId, sale.division_id, saleId, date,
            method, accountType, bankId, cashId, paymentAccount,
            rupees(amount), reference || null, user.id,
          ]
        );
        await conn.commit();
        result = "ok";
      }
    }
    if (result !== "ok") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Receive sale payment failed:", error);
    result = "failed";
  } finally {
    conn.release();
  }

  if (result === "ok") {
    revalidatePath(back);
    revalidatePath("/accounting/invoices");
    revalidatePath("/accounting/sales");
  }
  redirect(`${back}?pay=${result}`);
}

/**
 * A small discount given to close a bill that the customer cannot pay in full
 * (for example 50 rupees short). It counts as paid on the bill, books to Sales
 * Discounts, and never touches cash or bank.
 */
export async function giveBillDiscountAction(form: FormData): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const saleId = Number(form.get("sale_id"));
  const back = `/accounting/sales/${saleId}`;
  const amount = paise(String(form.get("amount") ?? ""));
  const reason = String(form.get("reason") ?? "").trim().slice(0, 250);

  if (!canGiveBillDiscount(user.role)) redirect(`${back}?pay=discount-denied`);
  if (!Number.isSafeInteger(saleId) || saleId <= 0 || amount <= 0n) redirect(`${back}?pay=invalid`);
  if (reason.length < 3) redirect(`${back}?pay=discount-reason`);

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [sales] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, status, ROUND(grand_total * 100) AS total_paise
         FROM acct_sales_headers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, saleId]
    );
    const sale = sales[0];
    if (!sale) {
      result = "invalid";
    } else if (sale.status !== "POSTED") {
      result = "not-posted";
    } else {
      const [paid] = await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS paid_paise
           FROM acct_sales_payments WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`,
        [businessId, saleId]
      );
      const outstanding = BigInt(sale.total_paise) - BigInt(paid[0].paid_paise);
      if (amount > outstanding) {
        result = "too-much";
      } else {
        const [ins] = await conn.execute<import("mysql2").ResultSetHeader>(
          `INSERT INTO acct_sales_payments (
             legal_business_id, division_id, sale_id, payment_date, payment_method,
             payment_account_type, bank_account_id, cash_account_id, payment_account,
             amount, remarks, status, created_by
           ) VALUES (?, ?, ?, CURDATE(), 'DISCOUNT', 'OTHERS', NULL, NULL, NULL, ?, ?, 'RECORDED', ?)`,
          [businessId, sale.division_id, saleId, rupees(amount), reason, user.id]
        );
        await conn.execute(
          `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
           VALUES (?, ?, 'BILL_DISCOUNT_GIVEN', 'SALES_INVOICE', ?, ?)`,
          [businessId, user.id, saleId, JSON.stringify({ paymentId: ins.insertId, amount: rupees(amount), reason })]
        );
        await conn.commit();
        result = "discount-ok";
      }
    }
    if (result !== "discount-ok") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Bill discount failed:", error);
    result = "failed";
  } finally {
    conn.release();
  }
  revalidatePath(back);
  revalidatePath("/accounting/invoices");
  revalidatePath("/accounting/sales");
  redirect(`${back}?pay=${result}`);
}
