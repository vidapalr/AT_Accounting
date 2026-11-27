"use server";

import { canUseDivision } from "@/lib/scope";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canGiveBillDiscount } from "@/lib/access";
import { splitPayment } from "@/lib/customer-credit-math";
import { lockCustomer } from "@/lib/customer-credit";
import { isMissingTable } from "@/lib/db-errors";
import { fixSalePayment, insertSalePayment, MONEY_METHODS, receivingAccount, rupeesText } from "@/lib/sale-payments";


function paise(value: string): bigint {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return -1n;
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

const rupees = rupeesText;

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

  if (
    !Number.isSafeInteger(saleId) || saleId <= 0 ||
    amount <= 0n ||
    !MONEY_METHODS.has(method) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^(CASH|BANK):\d{1,10}$/.test(account)
  ) {
    redirect(`${back}?pay=invalid`);
  }

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [sales] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, customer_id, status, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
              ROUND(grand_total * 100) AS total_paise
         FROM acct_sales_headers
        WHERE legal_business_id = ? AND id = ?
        FOR UPDATE`,
      [businessId, saleId]
    );
    const sale = canUseDivision(user, Number(sales[0]?.division_id)) ? sales[0] : undefined;

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

      const acc = await receivingAccount(conn, businessId, method, account);
      const bankId = acc?.bankId ?? null;
      const cashId = acc?.cashId ?? null;

      if (bankId === null && cashId === null) {
        result = "invalid-account";
      } else if (amount > outstanding && !sale.customer_id) {
        // Extra money can only be kept as credit for a known customer.
        result = "too-much";
      } else if (date < String(sale.invoice_date)) {
        result = "invalid-date";
      } else {
        const split = splitPayment(amount, outstanding);
        if (split.toBill > 0n && acc) {
          await insertSalePayment(conn, {
            businessId, userId: user.id, divisionId: Number(sale.division_id), saleId, date, method, acc, amount: split.toBill, reference,
          });
        }
        if (split.toCredit > 0n) {
          // The extra is kept as money we owe the customer (customer credit).
          await lockCustomer(conn, businessId, Number(sale.customer_id));
          await conn.execute(
            `INSERT INTO acct_customer_credits
               (legal_business_id, division_id, customer_id, entry_type, entry_date, amount, payment_method,
                bank_account_id, cash_account_id, reference, source_sale_id, remarks, created_by)
             VALUES (?, ?, ?, 'RECEIVED', ?, ?, ?, ?, ?, ?, ?, 'Paid more than the bill', ?)`,
            [businessId, sale.division_id, Number(sale.customer_id), date, rupees(split.toCredit), method,
             bankId, cashId, reference || null, saleId, user.id]
          );
        }
        await conn.commit();
        result = split.toCredit > 0n ? "ok-credit" : "ok";
      }
    }
    if (result !== "ok" && result !== "ok-credit") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isMissingTable(error)) {
      result = "credit-setup";
    } else {
      console.error("Receive sale payment failed:", error);
      result = "failed";
    }
  } finally {
    conn.release();
  }

  if (result === "ok" || result === "ok-credit") {
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
    const sale = canUseDivision(user, Number(sales[0]?.division_id)) ? sales[0] : undefined;
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

/**
 * Correct a payment on a saved bill: change its amount, method, account, date or reference, or remove it
 * (entered by mistake). Its book entry is reversed (kept as reversed, nothing deleted) and the corrected
 * payment posts again. Exchange credit from a return can only be removed: it goes back to the return.
 */
export async function correctSalePaymentAction(form: FormData): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const saleId = Number(form.get("sale_id"));
  const paymentId = Number(form.get("payment_id"));
  const op = String(form.get("op") ?? "");
  const back = `/accounting/sales/${saleId}`;
  if (!Number.isSafeInteger(saleId) || saleId <= 0 || !Number.isSafeInteger(paymentId) || paymentId <= 0 || !["change", "remove"].includes(op)) {
    redirect(`${back}?pay=invalid#payments`);
  }
  const why = String(form.get("why") ?? "").trim().slice(0, 200);

  let result = "failed";
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
    const [sales] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, status, invoice_no, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date, ROUND(grand_total * 100) AS total_paise
         FROM acct_sales_headers WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, saleId]
    );
    const sale = canUseDivision(user, Number(sales[0]?.division_id)) ? sales[0] : undefined;
    if (!sale || sale.status !== "POSTED") {
      result = "invalid";
    } else if (op === "remove" && why.length < 3) {
      result = "why-needed";
    } else {
      let newAmount = 0n;
      if (op === "change") {
        const [rows] = await conn.execute<RowDataPacket[]>(
          `SELECT COALESCE(SUM(ROUND(amount * 100)), 0) AS p,
                  COALESCE(SUM(CASE WHEN id = ? THEN ROUND(amount * 100) ELSE 0 END), 0) AS mine
             FROM acct_sales_payments WHERE legal_business_id = ? AND sale_id = ? AND status = 'RECORDED'`,
          [paymentId, businessId, saleId]
        );
        const room = BigInt(sale.total_paise) - BigInt(String(rows[0].p)) + BigInt(String(rows[0].mine));
        newAmount = paise(String(form.get("amount") ?? ""));
        if (newAmount <= 0n || newAmount > room) result = "change-too-much";
      }
      if (result === "failed") {
        const fixed = await fixSalePayment(conn, {
          businessId, userId: user.id, saleId, invoiceNo: String(sale.invoice_no), invoiceDate: String(sale.invoice_date), paymentId,
          op: op as "change" | "remove", method: String(form.get("method") ?? ""), account: String(form.get("account") ?? ""),
          amount: newAmount, date: String(form.get("payment_date") ?? ""), reference: String(form.get("reference") ?? "").trim().slice(0, 150), why,
        });
        if (fixed.ok) {
          await conn.commit();
          result = op === "remove" ? "removed" : "changed";
        } else result = fixed.reason;
      }
    }
    if (result !== "removed" && result !== "changed") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Correct sale payment failed:", error);
    result = "failed";
  } finally {
    conn.release();
  }
  revalidatePath(back);
  revalidatePath("/accounting/invoices");
  redirect(`${back}?pay=${result}#payments`);
}
