
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { nextCode, nextBarcode } from "@/lib/codes";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { insertProduct, insertVariant } from "@/lib/product-master-core";

const PAGE = "/accounting/products";

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function id(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}


function go(result: string): never {
  redirect(`${PAGE}?result=${encodeURIComponent(result)}`);
}

export async function createProductAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("products");
  const DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const categoryId = id(field(form, "category_id"));
  const code = await nextCode(db, { table: "acct_products", column: "product_code", prefix: "PRD-", width: 4, where: "legal_business_id = ?", params: [businessId] });
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
        await insertProduct(conn, {
          businessId, divisionId: DIVISION_ID, userId: user.id, categoryId: categoryId!, name,
          brand, fabric, design, description,
        });
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
  const user = await requireAccess("products");
  const DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const productId = id(field(form, "product_id"));
  const sku = await nextCode(db, { table: "acct_product_variants", column: "sku", prefix: "SKU-", width: 5, where: "legal_business_id = ?", params: [businessId] });
  const barcode = await nextBarcode(db);
  const size = field(form, "size_label");
  const color = field(form, "color_name");
  const designCode = field(form, "design_code") || (await nextCode(db, { table: "acct_product_variants", column: "design_code", prefix: "DSN-", width: 4, where: "legal_business_id = ?", params: [businessId] }));
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
        await insertVariant(conn, {
          businessId, divisionId: DIVISION_ID, userId: user.id, productId: productId!,
          size, color, unit: unit as "PCS" | "SET" | "METER", designCode,
        });
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
