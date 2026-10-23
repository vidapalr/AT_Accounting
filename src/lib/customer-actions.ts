"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";
import { normalizePhone } from "@/lib/customer-phone";

const PAGE = "/accounting/customers";

type Parsed = {
  name: string;
  phone: string | null;
  type: "RETAIL" | "WHOLESALE";
  address: string | null;
  city: string | null;
  gstin: string | null;
  limitRupees: string;
  optIn: 0 | 1;
  notes: string | null;
};

function read(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function parse(form: FormData, phoneRequired: boolean): Parsed | null {
  const name = read(form, "full_name");
  const phoneText = read(form, "phone");
  const phone = normalizePhone(phoneText);
  const type = read(form, "customer_type");
  const gstin = read(form, "gstin").toUpperCase();
  const limit = read(form, "credit_limit") || "0";

  if (
    name.length < 2 || name.length > 150 ||
    (phoneText !== "" && phone === null) ||
    (phoneRequired && phone === null) ||
    !["RETAIL", "WHOLESALE"].includes(type) ||
    (gstin !== "" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) ||
    !/^\d{1,10}(\.\d{1,2})?$/.test(limit) ||
    read(form, "address").length > 300 ||
    read(form, "city").length > 100 ||
    read(form, "notes").length > 500
  ) {
    return null;
  }

  return {
    name,
    phone,
    type: type as "RETAIL" | "WHOLESALE",
    address: read(form, "address") || null,
    city: read(form, "city") || null,
    gstin: gstin || null,
    limitRupees: limit,
    optIn: form.get("whatsapp_opt_in") === "yes" ? 1 : 0,
    notes: read(form, "notes") || null,
  };
}

export async function createCustomerAction(form: FormData): Promise<void> {
  const user = await requireAccess("customers");
  const businessId = user.legal_business_id;

  const data = parse(form, true);
  if (!data) redirect(`${PAGE}?result=invalid`);

  const [existing] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_customers WHERE legal_business_id = ? AND phone = ?`,
    [businessId, data.phone]
  );
  if (existing.length > 0) {
    redirect(`${PAGE}/${existing[0].id}?result=exists`);
  }

  const code = await nextCode(db, {
    table: "acct_customers",
    column: "customer_code",
    prefix: "CUS-",
    width: 4,
    where: "legal_business_id = ?",
    params: [businessId],
  });

  let newId = 0;
  try {
    const [res] = await db.execute<import("mysql2").ResultSetHeader>(
      `INSERT INTO acct_customers
         (legal_business_id, customer_code, full_name, phone, customer_type,
          address, city, gstin, credit_limit, whatsapp_opt_in, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId, code, data.name, data.phone, data.type,
        data.address, data.city, data.gstin, data.limitRupees,
        data.optIn, data.notes, user.id,
      ]
    );
    newId = res.insertId;
  } catch (error) {
    console.error("Customer create failed:", error);
    redirect(`${PAGE}?result=failed`);
  }

  revalidatePath(PAGE);
  redirect(`${PAGE}/${newId}?result=created`);
}

export async function updateCustomerAction(form: FormData): Promise<void> {
  const user = await requireAccess("customers");
  const businessId = user.legal_business_id;

  const id = Number(form.get("customer_id"));
  if (!Number.isSafeInteger(id) || id <= 0) redirect(`${PAGE}?result=invalid`);
  const back = `${PAGE}/${id}`;

  const data = parse(form, false);
  if (!data) redirect(`${back}?result=invalid`);

  const [dup] = data.phone
    ? await db.execute<RowDataPacket[]>(
        `SELECT id FROM acct_customers
          WHERE legal_business_id = ? AND phone = ? AND id <> ?`,
        [businessId, data.phone, id]
      )
    : [[] as RowDataPacket[]];
  if (dup.length > 0) redirect(`${back}?result=phone-used`);

  // Only the owner changes the credit limit.
  const [current] = await db.execute<RowDataPacket[]>(
    `SELECT credit_limit FROM acct_customers WHERE legal_business_id = ? AND id = ?`,
    [businessId, id]
  );
  if (current.length === 0) redirect(`${PAGE}?result=invalid`);
  const limit =
    user.role === "GROUP_OWNER" ? data.limitRupees : String(current[0].credit_limit);

  try {
    await db.execute(
      `UPDATE acct_customers
          SET full_name = ?, phone = ?, customer_type = ?, address = ?, city = ?,
              gstin = ?, credit_limit = ?, whatsapp_opt_in = ?, notes = ?
        WHERE legal_business_id = ? AND id = ?`,
      [
        data.name, data.phone, data.type, data.address, data.city,
        data.gstin, limit, data.optIn, data.notes, businessId, id,
      ]
    );
  } catch (error) {
    console.error("Customer update failed:", error);
    redirect(`${back}?result=failed`);
  }

  revalidatePath(PAGE);
  revalidatePath(back);
  redirect(`${back}?result=updated`);
}
