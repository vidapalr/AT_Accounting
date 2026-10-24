"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { canMergeCustomers } from "@/lib/access";
import { findOrCreateCustomer } from "@/lib/customers";
import { normalizePhone } from "@/lib/customer-phone";

type Row = RowDataPacket & Record<string, string | number | null>;

// ------------------------------------------------- mobile on a saved bill

/**
 * Adds or changes the mobile number on a bill (draft or confirmed) and links
 * the bill to the customer who has that number, creating one if needed.
 * Items, stock and accounts are not touched.
 */
export async function setInvoiceMobileAction(formData: FormData): Promise<void> {
  const user = await requireAccess("sales");
  const businessId = user.legal_business_id;
  const saleId = Number(formData.get("sale_id"));
  const phone10 = normalizePhone(String(formData.get("phone") ?? ""));
  const back = `/accounting/sales/${Number.isSafeInteger(saleId) ? saleId : ""}`;

  if (!Number.isSafeInteger(saleId) || saleId <= 0) redirect("/accounting/invoices");
  if (phone10 === null) redirect(`${back}?mobile=invalid`);

  let outcome = "failed";
  const conn: PoolConnection = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<Row[]>(
      `SELECT id, status, customer_name FROM acct_sales_headers
       WHERE id = ? AND legal_business_id = ? FOR UPDATE`,
      [saleId, businessId]
    );
    const sale = rows[0];
    if (!sale || !["DRAFT", "POSTED"].includes(String(sale.status))) {
      outcome = "not-allowed";
    } else {
      const customer = await findOrCreateCustomer(conn, {
        businessId, userId: user.id, name: String(sale.customer_name ?? ""), phone10,
      });
      await conn.execute(
        `UPDATE acct_sales_headers
            SET customer_phone = ?, customer_id = ?,
                customer_name = COALESCE(NULLIF(customer_name, ''), ?)
          WHERE id = ? AND legal_business_id = ?`,
        [phone10, customer.id, customer.full_name, saleId, businessId]
      );
      await conn.execute(
        `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'INVOICE_MOBILE_SET', 'SALE', ?, ?)`,
        [businessId, user.id, saleId, JSON.stringify({ customerId: customer.id })]
      );
      await conn.commit();
      outcome = "saved";
    }
    if (outcome !== "saved") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Setting invoice mobile failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath(back);
  revalidatePath("/accounting/customers");
  redirect(`${back}?mobile=${outcome}`);
}

// ------------------------------------------------------- merge customers

/**
 * Moves everything from one customer record into another and hides the first.
 * Used when the same person ended up with two records, for example one made
 * without a number and one made later with it.
 */
export async function mergeCustomersAction(formData: FormData): Promise<void> {
  const user = await requireAccess("customers");
  const sourceId = Number(formData.get("source_id"));
  const targetId = Number(formData.get("target_id"));
  const ok = Number.isSafeInteger(sourceId) && Number.isSafeInteger(targetId) && sourceId > 0 && targetId > 0;
  const page = (id: number, q: string) => `/accounting/customers/${id}?${q}`;
  if (!ok || sourceId === targetId) redirect("/accounting/customers?result=invalid");
  if (!canMergeCustomers(user.role)) redirect(page(sourceId, "result=merge-denied"));
  const businessId = user.legal_business_id;

  let done = false;
  const conn: PoolConnection = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<Row[]>(
      `SELECT id, customer_code, full_name, phone, address, city, gstin, notes, whatsapp_opt_in, status
         FROM acct_customers
        WHERE legal_business_id = ? AND id IN (?, ?) ORDER BY id FOR UPDATE`,
      [businessId, sourceId, targetId]
    );
    const source = rows.find((r) => Number(r.id) === sourceId);
    const target = rows.find((r) => Number(r.id) === targetId);
    if (!source || !target || source.status !== "ACTIVE" || target.status !== "ACTIVE") {
      await conn.rollback();
      redirect(page(sourceId, "result=invalid"));
    }

    // Bills, messages and anything else pointing at the old record now point at the kept one.
    await conn.execute(
      `UPDATE acct_sales_headers
          SET customer_id = ?, customer_phone = COALESCE(customer_phone, ?)
        WHERE legal_business_id = ? AND customer_id = ?`,
      [targetId, target.phone, businessId, sourceId]
    );
    await conn.execute(
      `UPDATE acct_customer_messages SET customer_id = ? WHERE legal_business_id = ? AND customer_id = ?`,
      [targetId, businessId, sourceId]
    );
    await conn.execute(
      `UPDATE acct_free_stock SET customer_id = ? WHERE legal_business_id = ? AND customer_id = ?`,
      [targetId, businessId, sourceId]
    );
    await conn.execute(
      `UPDATE IGNORE acct_approval_items SET customer_id = ? WHERE legal_business_id = ? AND customer_id = ?`,
      [targetId, businessId, sourceId]
    ).catch(() => {}); // table comes from migration 019; harmless if that is not run yet

    // Keep the target's details, but fill in anything it is missing from the old record.
    const placeholder = `Customer ${String(target.phone ?? "")}`;
    const keepName = String(target.full_name) === placeholder ? String(source.full_name) : String(target.full_name);
    await conn.execute(
      `UPDATE acct_customers
          SET full_name = ?,
              address = COALESCE(NULLIF(address, ''), ?),
              city = COALESCE(NULLIF(city, ''), ?),
              gstin = COALESCE(NULLIF(gstin, ''), ?),
              notes = COALESCE(NULLIF(notes, ''), ?),
              whatsapp_opt_in = GREATEST(whatsapp_opt_in, ?)
        WHERE legal_business_id = ? AND id = ?`,
      [
        keepName, source.address, source.city, source.gstin, source.notes,
        Number(source.whatsapp_opt_in ?? 0), businessId, targetId,
      ]
    );

    // Bills that carried the "Customer <number>" placeholder now show the real name.
    if (keepName !== placeholder) {
      await conn.execute(
        `UPDATE acct_sales_headers SET customer_name = ?
          WHERE legal_business_id = ? AND customer_id = ? AND customer_name = ?`,
        [keepName, businessId, targetId, placeholder]
      );
    }

    // Hide the old record. Its number is released so it can never clash again.
    const stamp = new Date().toISOString().slice(0, 10);
    await conn.execute(
      `UPDATE acct_customers
          SET status = 'INACTIVE', phone = NULL,
              notes = LEFT(CONCAT('Merged into ', ?, ' on ', ?, '. ', COALESCE(notes, '')), 500)
        WHERE legal_business_id = ? AND id = ?`,
      [target.customer_code, stamp, businessId, sourceId]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events
         (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'CUSTOMER_MERGED', 'CUSTOMER', ?, ?)`,
      [businessId, user.id, targetId, JSON.stringify({ from: source.customer_code, into: target.customer_code })]
    );
    await conn.commit();
    done = true;
  } catch (error) {
    await conn.rollback().catch(() => {});
    // redirect() throws a control-flow error; let it through.
    if (error instanceof Error && /NEXT_REDIRECT/.test(error.message)) throw error;
    console.error("Customer merge failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath("/accounting/customers");
  if (done) redirect(page(targetId, "result=merged"));
  redirect(page(sourceId, "result=failed"));
}
