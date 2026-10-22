
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type SupplierType =
  | "MANUFACTURER"
  | "WHOLESALER"
  | "WEAVER"
  | "DISTRIBUTOR"
  | "OTHER";

export type QuickSupplierInput = {
  supplierName: string;
  supplierType: SupplierType;
  contactPerson: string;
  mobile: string;
  city: string;
  gstin: string;
};

export type QuickSupplierResult =
  | {
      ok: true;
      supplier: {
        id: number;
        code: string;
        name: string;
      };
    }
  | {
      ok: false;
      message: string;
    };

const TYPES: SupplierType[] = [
  "MANUFACTURER",
  "WHOLESALER",
  "WEAVER",
  "DISTRIBUTOR",
  "OTHER",
];

export async function quickCreateSupplierAction(
  input: QuickSupplierInput
): Promise<QuickSupplierResult> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const name = input.supplierName?.trim() ?? "";
  const type = input.supplierType;
  const contact = input.contactPerson?.trim() ?? "";
  const mobile = input.mobile?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const gstin = (input.gstin?.trim() ?? "").toUpperCase();

  if (
    name.length < 2 ||
    name.length > 180 ||
    !TYPES.includes(type) ||
    contact.length > 150 ||
    city.length > 100 ||
    (mobile !== "" && !/^[+]?[0-9 -]{7,20}$/.test(mobile)) ||
    (
      gstin !== "" &&
      !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)
    )
  ) {
    return {
      ok: false,
      message: "Enter valid supplier details.",
    };
  }

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      await conn.rollback();

      return {
        ok: false,
        message: "Legal business not found.",
      };
    }

    // Avoid accidental duplicate registration.
    // Same name with the same mobile, including
    // both mobile fields blank, is treated as
    // a potential duplicate.
    const [duplicates] = await conn.execute<RowDataPacket[]>(
      `SELECT id, supplier_code, supplier_name
       FROM acct_suppliers
       WHERE legal_business_id = ?
         AND LOWER(supplier_name) = LOWER(?)
         AND COALESCE(mobile, '') = ?
       LIMIT 1`,
      [businessId, name, mobile]
    );

    if (duplicates.length > 0) {
      await conn.rollback();

      return {
        ok: false,
        message:
          "A supplier with this name and mobile already exists. " +
          "Please select the existing supplier.",
      };
    }

    const supplierCode =
      "SUP-Q-" + randomBytes(6).toString("hex").toUpperCase();

    const [saved] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_suppliers (
         legal_business_id,
         supplier_code,
         supplier_name,
         supplier_type,
         contact_person,
         mobile,
         city,
         gstin,
         payment_terms,
         credit_days,
         status,
         created_by
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?,
         'CASH', 0, 'ACTIVE', ?
       )`,
      [
        businessId,
        supplierCode,
        name,
        type,
        contact || null,
        mobile || null,
        city || null,
        gstin || null,
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
        saved.insertId,
        JSON.stringify({
          supplier_code: supplierCode,
          supplier_name: name,
          supplier_type: type,
          created_from: "PURCHASE_QUICK_ADD",
        }),
      ]
    );

    await conn.commit();

    revalidatePath("/accounting/suppliers");
    revalidatePath("/accounting/purchases");

    return {
      ok: true,
      supplier: {
        id: saved.insertId,
        code: supplierCode,
        name,
      },
    };
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Quick supplier creation failed:", error);

    return {
      ok: false,
      message:
        "Unable to create supplier. Check the server logs.",
    };
  } finally {
    conn.release();
  }
}
