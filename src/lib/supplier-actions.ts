
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/suppliers";

const TYPES = [
  "MANUFACTURER",
  "WHOLESALER",
  "WEAVER",
  "DISTRIBUTOR",
  "OTHER",
];

const TERMS = ["ADVANCE", "CASH", "CREDIT"];

function get(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: string): string | null {
  return value === "" ? null : value;
}

export async function createSupplierAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const code = get(form, "supplier_code").toUpperCase();
  const name = get(form, "supplier_name");
  const type = get(form, "supplier_type");
  const contact = get(form, "contact_person");
  const mobile = get(form, "mobile");
  const whatsapp = get(form, "whatsapp_number");
  const email = get(form, "email");
  const address = get(form, "address");
  const city = get(form, "city");
  const state = get(form, "state_name");
  const pin = get(form, "postal_code");
  const gstin = get(form, "gstin").toUpperCase();
  const terms = get(form, "payment_terms");
  const daysText = get(form, "credit_days") || "0";
  const notes = get(form, "notes");

  const creditDays = Number(daysText);

  const valid =
    /^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(code) &&
    name.length >= 2 &&
    name.length <= 180 &&
    TYPES.includes(type) &&
    contact.length <= 150 &&
    mobile.length <= 20 &&
    whatsapp.length <= 20 &&
    email.length <= 190 &&
    address.length <= 500 &&
    city.length <= 100 &&
    state.length <= 100 &&
    pin.length <= 12 &&
    notes.length <= 1000 &&
    (gstin === "" ||
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) &&
    TERMS.includes(terms) &&
    /^\d+$/.test(daysText) &&
    Number.isSafeInteger(creditDays) &&
    creditDays >= 0 &&
    creditDays <= 65535 &&
    (terms === "CREDIT" || creditDays === 0);

  if (!valid) {
    redirect(`${PAGE}?result=invalid`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    // Serialize administrative writes by business.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      result = "business-not-found";
    } else {
      const [duplicate] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_suppliers
         WHERE legal_business_id = ?
           AND supplier_code = ?
         LIMIT 1`,
        [businessId, code]
      );

      if (duplicate.length > 0) {
        result = "duplicate";
      } else {
        const [inserted] = await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_suppliers (
             legal_business_id,
             supplier_code,
             supplier_name,
             supplier_type,
             contact_person,
             mobile,
             whatsapp_number,
             email,
             address,
             city,
             state_name,
             postal_code,
             gstin,
             payment_terms,
             credit_days,
             notes,
             created_by
           ) VALUES (
             ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?, ?
           )`,
          [
            businessId,
            code,
            name,
            type,
            optional(contact),
            optional(mobile),
            optional(whatsapp),
            optional(email),
            optional(address),
            optional(city),
            optional(state),
            optional(pin),
            optional(gstin),
            terms,
            creditDays,
            optional(notes),
            user.id,
          ]
        );

        await conn.execute(
          `INSERT INTO acct_audit_events (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "SUPPLIER_CREATED",
            "SUPPLIER",
            inserted.insertId,
            JSON.stringify({
              supplier_code: code,
              supplier_name: name,
              supplier_type: type,
            }),
          ]
        );

        await conn.commit();
        result = "created";
      }
    }

    if (result !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Supplier creation failed", error);
  } finally {
    conn.release();
  }

  if (result === "created") {
    revalidatePath(PAGE);
  }

  redirect(`${PAGE}?result=${result}`);
}
