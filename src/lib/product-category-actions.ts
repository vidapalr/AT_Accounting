
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const PAGE = "/accounting/product-categories";
const TEXTILES_DIVISION_ID = 1;

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numericId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function go(code: string): never {
  redirect(`${PAGE}?result=${code}`);
}

export async function createProductCategoryAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;

  const code = text(form, "category_code").toUpperCase();
  const name = text(form, "category_name");
  const parentText = text(form, "parent_category_id");
  const parentId = parentText ? numericId(parentText) : null;
  const orderText = text(form, "display_order") || "0";
  const order = Number(orderText);

  if (
    !/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(code) ||
    name.length < 2 ||
    name.length > 120 ||
    (parentText !== "" && parentId === null) ||
    !/^\d+$/.test(orderText) ||
    !Number.isSafeInteger(order) ||
    order > 1000000
  ) {
    go("invalid");
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    const [division] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_divisions
       WHERE id = ? AND legal_business_id = ?`,
      [TEXTILES_DIVISION_ID, businessId]
    );

    if (business.length !== 1 || division.length !== 1) {
      outcome = "division-missing";
    } else {
      let validParent = parentId === null;

      if (parentId !== null) {
        const [parents] = await conn.execute<RowDataPacket[]>(
          `SELECT id, parent_category_id, status
           FROM acct_product_categories
           WHERE id = ?
             AND legal_business_id = ?
             AND division_id = ?`,
          [parentId, businessId, TEXTILES_DIVISION_ID]
        );

        // We allow only two levels:
        // main category -> subcategory.
        validParent =
          parents.length === 1 &&
          parents[0].parent_category_id === null &&
          parents[0].status === "ACTIVE";
      }

      if (!validParent) {
        outcome = "invalid-parent";
      } else {
        const [duplicates] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_product_categories
           WHERE legal_business_id = ?
             AND division_id = ?
             AND category_code = ?`,
          [businessId, TEXTILES_DIVISION_ID, code]
        );

        if (duplicates.length > 0) {
          outcome = "duplicate";
        } else {
          const [inserted] = await conn.execute<ResultSetHeader>(
            `INSERT INTO acct_product_categories
             (
               legal_business_id, division_id,
               parent_category_id, category_code,
               category_name, display_order,
               status, created_by
             )
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
            [
              businessId,
              TEXTILES_DIVISION_ID,
              parentId,
              code,
              name,
              order,
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
              "PRODUCT_CATEGORY_CREATED",
              "PRODUCT_CATEGORY",
              inserted.insertId,
              JSON.stringify({
                code,
                name,
                parent_id: parentId,
                division_id: TEXTILES_DIVISION_ID,
              }),
            ]
          );

          await conn.commit();
          outcome = "created";
        }
      }
    }

    if (outcome !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Product category creation failed", error);
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(PAGE);
  }

  go(outcome);
}

const DEFAULT_CATEGORIES = [
  { code: "COTTON-SETS", name: "Cotton Sets", parent: null, order: 10 },
  { code: "COTTON-2PC", name: "2-Piece Sets", parent: "COTTON-SETS", order: 11 },
  { code: "COTTON-3PC", name: "3-Piece Sets", parent: "COTTON-SETS", order: 12 },
  { code: "TOPS", name: "Tops", parent: null, order: 20 },
  { code: "LEGGINGS", name: "Leggings", parent: null, order: 30 },
  { code: "NIGHTIES", name: "Nighties", parent: null, order: 40 },
  { code: "SAREES", name: "Sarees", parent: null, order: 50 },
  { code: "SAREE-COTTON", name: "Cotton Sarees", parent: "SAREES", order: 51 },
  { code: "SAREE-BANARAS", name: "Banaras", parent: "SAREES", order: 52 },
  { code: "SAREE-MANGALAGIRI", name: "Mangalagiri Pattu", parent: "SAREES", order: 53 },
  { code: "SAREE-UPPADA", name: "Uppada", parent: "SAREES", order: 54 },
  { code: "SAREE-KALAMKARI", name: "Kalamkari", parent: "SAREES", order: 55 },
] as const;

export async function seedTextileCategoriesAction(): Promise<void> {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const conn = await db.getConnection();

  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [division] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_divisions
       WHERE id = ? AND legal_business_id = ?`,
      [TEXTILES_DIVISION_ID, businessId]
    );

    if (business.length !== 1 || division.length !== 1) {
      outcome = "division-missing";
    } else {
      const [existing] = await conn.execute<RowDataPacket[]>(
        `SELECT id, category_code, parent_category_id
         FROM acct_product_categories
         WHERE legal_business_id = ?
           AND division_id = ?`,
        [businessId, TEXTILES_DIVISION_ID]
      );

      const ids = new Map<string, number>();
      const parentByCode = new Map<string, number | null>();

      for (const row of existing) {
        ids.set(String(row.category_code), Number(row.id));
        parentByCode.set(
          String(row.category_code),
          row.parent_category_id === null
            ? null
            : Number(row.parent_category_id)
        );
      }

      // Abort if previously created category codes
      // conflict with the intended hierarchy.
      let conflict = false;
      for (const item of DEFAULT_CATEGORIES) {
        const currentId = ids.get(item.code);
        if (currentId === undefined) continue;

        if (item.parent === null) {
          if (parentByCode.get(item.code) !== null) {
            conflict = true;
          }
        } else {
          const expectedParent = ids.get(item.parent);
          if (
            expectedParent !== undefined &&
            parentByCode.get(item.code) !== expectedParent
          ) {
            conflict = true;
          }
        }
      }

      if (conflict) {
        outcome = "hierarchy-conflict";
      } else {
        let insertedCount = 0;

        // Parents appear before children in the
        // ordered default list.
        for (const item of DEFAULT_CATEGORIES) {
          if (ids.has(item.code)) continue;

          const parentId =
            item.parent === null
              ? null
              : (ids.get(item.parent) ?? null);

          if (item.parent !== null && parentId === null) {
            throw new Error("Missing parent category");
          }

          const [inserted] = await conn.execute<ResultSetHeader>(
            `INSERT INTO acct_product_categories
             (
               legal_business_id, division_id,
               parent_category_id,
               category_code, category_name,
               display_order, status, created_by
             )
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
            [
              businessId,
              TEXTILES_DIVISION_ID,
              parentId,
              item.code,
              item.name,
              item.order,
              user.id,
            ]
          );

          ids.set(item.code, inserted.insertId);
          insertedCount++;
        }

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
            "TEXTILE_CATEGORIES_INITIALIZED",
            "DIVISION",
            TEXTILES_DIVISION_ID,
            JSON.stringify({
              division_id: TEXTILES_DIVISION_ID,
              inserted_count: insertedCount,
            }),
          ]
        );

        await conn.commit();
        outcome = insertedCount === 0
          ? "already-initialized"
          : "initialized";
      }
    }

    if (!["initialized", "already-initialized"].includes(outcome)) {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Category initialization failed", error);
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  go(outcome);
}
