
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/products";
const DIVISION_ID = 1;

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function id(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function optional(value: string): string | null {
  return value === "" ? null : value;
}

function go(result: string): never {
  redirect(`${PAGE}?result=${encodeURIComponent(result)}`);
}

export async function createProductAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const categoryId = id(field(form, "category_id"));
  const code = field(form, "product_code").toUpperCase();
  const name = field(form, "product_name");
  const brand = field(form, "brand_name");
  const fabric = field(form, "fabric");
  const design = field(form, "design_name");
  const description = field(form, "description");

  if (
    categoryId === null ||
    !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code) ||
    name.length < 2 ||
    name.length > 180 ||
    brand.length > 120 ||
    fabric.length > 100 ||
    design.length > 120 ||
    description.length > 500
  ) {
    go("invalid-product");
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [categories] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_product_categories
       WHERE id = ?
         AND legal_business_id = ?
         AND division_id = ?
         AND status = 'ACTIVE'`,
      [categoryId, businessId, DIVISION_ID]
    );

    if (business.length !== 1 || categories.length !== 1) {
      outcome = "invalid-category";
    } else {
      const [duplicates] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_products
         WHERE legal_business_id = ?
           AND division_id = ?
           AND product_code = ?`,
        [businessId, DIVISION_ID, code]
      );

      if (duplicates.length > 0) {
        outcome = "duplicate-product";
      } else {
        const [created] = await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_products
           (
             legal_business_id, division_id, category_id,
             product_code, product_name, brand_name,
             fabric, design_name, description,
             status, created_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
          [
            businessId,
            DIVISION_ID,
            categoryId,
            code,
            name,
            optional(brand),
            optional(fabric),
            optional(design),
            optional(description),
            user.id,
          ]
        );

        await conn.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id, actor_user_id,
             action, subject_type,
             subject_id, details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "PRODUCT_CREATED",
            "PRODUCT",
            created.insertId,
            JSON.stringify({
              division_id: DIVISION_ID,
              category_id: categoryId,
              product_code: code,
              product_name: name,
            }),
          ]
        );

        await conn.commit();
        outcome = "product-created";
      }
    }

    if (outcome !== "product-created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Create product failed", error);
  } finally {
    conn.release();
  }

  if (outcome === "product-created") {
    revalidatePath(PAGE);
  }

  go(outcome);
}

export async function createProductVariantAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const productId = id(field(form, "product_id"));
  const sku = field(form, "sku").toUpperCase();
  const barcode = field(form, "barcode");
  const size = field(form, "size_label");
  const color = field(form, "color_name");
  const designCode = field(form, "design_code");
  const unit = field(form, "unit_of_measure");

  if (
    productId === null ||
    !/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(sku) ||
    barcode.length > 80 ||
    size.length > 40 ||
    color.length > 80 ||
    designCode.length > 80 ||
    !["PCS", "SET", "METER"].includes(unit)
  ) {
    go("invalid-variant");
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [products] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_products
       WHERE id = ?
         AND legal_business_id = ?
         AND division_id = ?
         AND status = 'ACTIVE'`,
      [productId, businessId, DIVISION_ID]
    );

    if (business.length !== 1 || products.length !== 1) {
      outcome = "invalid-product";
    } else {
      const [duplicates] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_product_variants
         WHERE legal_business_id = ?
           AND (
             sku = ?
             OR (barcode IS NOT NULL AND barcode = ?)
           )
         LIMIT 1`,
        [businessId, sku, barcode]
      );

      if (duplicates.length > 0) {
        outcome = "duplicate-sku";
      } else {
        const [created] = await conn.execute<ResultSetHeader>(
          `INSERT INTO acct_product_variants
           (
             legal_business_id, division_id, product_id,
             sku, barcode, size_label, color_name,
             design_code, unit_of_measure,
             status, created_by
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
          [
            businessId,
            DIVISION_ID,
            productId,
            sku,
            optional(barcode),
            optional(size),
            optional(color),
            optional(designCode),
            unit,
            user.id,
          ]
        );

        await conn.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id, actor_user_id,
             action, subject_type, subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "PRODUCT_VARIANT_CREATED",
            "PRODUCT_VARIANT",
            created.insertId,
            JSON.stringify({
              product_id: productId,
              sku,
              size: optional(size),
              color: optional(color),
              unit,
            }),
          ]
        );

        await conn.commit();
        outcome = "variant-created";
      }
    }

    if (outcome !== "variant-created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Create product variant failed", error);
  } finally {
    conn.release();
  }

  if (outcome === "variant-created") {
    revalidatePath(PAGE);
  }

  go(outcome);
}
