
"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";

const PAGE = "/accounting/purchases";
const MAX_LINE_COUNT = 100;

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function positiveId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

// Strict decimal parser. Never use floating point
// for inventory cost or quantity calculations.
function decimalScaled(
  value: string,
  scale: number,
  maxWholeDigits: number
): bigint | null {
  const pattern = new RegExp(
    `^\\d{1,${maxWholeDigits}}(?:\\.\\d{1,${scale}})?$`
  );

  if (!pattern.test(value)) return null;

  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0"))
  );
}

function scaledString(value: bigint, scale: number): string {
  const unit = 10n ** BigInt(scale);

  return (
    `${value / unit}.` +
    String(value % unit).padStart(scale, "0")
  );
}

type PurchaseLine = {
  variantId: number;
  quantity: string;
  unitCost: string;
  lineAmount: string;
};

function parseLines(form: FormData): PurchaseLine[] | null {
  const lines: PurchaseLine[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < MAX_LINE_COUNT; i++) {
    const variantText = field(form, `line_${i}_variant`);
    const qtyText = field(form, `line_${i}_quantity`);
    const costText = field(form, `line_${i}_cost`);

    if (!variantText && !qtyText && !costText) {
      continue;
    }

    const variantId = positiveId(variantText);
    const quantity = decimalScaled(qtyText, 3, 11);
    const cost = decimalScaled(costText, 4, 14);

    if (
      variantId === null ||
      quantity === null ||
      quantity <= 0n ||
      cost === null ||
      seen.has(variantId)
    ) {
      return null;
    }

    seen.add(variantId);

    // Quantity scale = 3; unit-cost scale = 4.
    // Product scale = 7. Convert to paise by
    // dividing by 100000, rounding half up.
    const linePaise =
      (quantity * cost + 50000n) / 100000n;

    if (linePaise > 999999999999999999n) {
      return null;
    }

    lines.push({
      variantId,
      quantity: scaledString(quantity, 3),
      unitCost: scaledString(cost, 4),
      lineAmount: scaledString(linePaise, 2),
    });
  }

  return lines.length > 0 ? lines : null;
}

function go(code: string, id?: number): never {
  const query = new URLSearchParams({ result: code });

  if (id !== undefined) {
    query.set("purchase", String(id));
  }

  redirect(`${PAGE}?${query.toString()}`);
}

export async function createPurchaseDraftAction(
  form: FormData
): Promise<void> {
  return savePurchaseDraft(form);
}

export async function updatePurchaseDraftAction(
  form: FormData
): Promise<void> {
  const purchaseId = positiveId(field(form, "purchase_id"));

  if (purchaseId === null) {
    go("not-editable");
  }

  return savePurchaseDraft(form, purchaseId);
}

async function savePurchaseDraft(
  form: FormData,
  purchaseId?: number
): Promise<void> {
  const user = await requireAccess("purchases");
  const DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const supplierId = positiveId(field(form, "supplier_id"));
  const locationId = positiveId(field(form, "location_id"));
  const invoiceNo = field(form, "supplier_invoice_no");
  const invoiceDate = field(form, "invoice_date");
  const remarks = field(form, "remarks");
  const lines = parseLines(form);

  if (
    supplierId === null ||
    locationId === null ||
    !validDate(invoiceDate) ||
    invoiceNo.length > 100 ||
    remarks.length > 500 ||
    lines === null
  ) {
    go("invalid", purchaseId);
  }

  const conn = await db.getConnection();

  let outcome = "failed";
  let savedPurchaseId = purchaseId;
  let purchaseNo = "";

  try {
    await conn.beginTransaction();

    // Serialize inventory administrative writes
    // using the established business lock.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      outcome = "business-not-found";
    } else {
      let editable = true;

      if (purchaseId !== undefined) {
        const [existingPurchase] =
          await conn.execute<RowDataPacket[]>(
            `SELECT id, purchase_no
             FROM acct_purchase_headers
             WHERE id = ?
               AND legal_business_id = ?
               AND division_id = ?
               AND status = 'DRAFT'
             FOR UPDATE`,
            [purchaseId, businessId, DIVISION_ID]
          );

        editable = existingPurchase.length === 1;
        purchaseNo =
          String(existingPurchase[0]?.purchase_no ?? "");
      }

      if (!editable) {
        outcome = "not-editable";
      } else {
        const [division] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_divisions
           WHERE legal_business_id = ?
             AND id = ?`,
          [businessId, DIVISION_ID]
        );

        const [suppliers] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_suppliers
           WHERE legal_business_id = ?
             AND id = ?
             AND status = 'ACTIVE'`,
          [businessId, supplierId]
        );

        const [locations] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_inventory_locations
           WHERE legal_business_id = ?
             AND division_id = ?
             AND id = ?
             AND location_type = 'CENTRAL_WAREHOUSE'
             AND status = 'ACTIVE'`,
          [businessId, DIVISION_ID, locationId]
        );

        if (
          division.length !== 1 ||
          suppliers.length !== 1 ||
          locations.length !== 1
        ) {
          outcome = "master-invalid";
        } else {
          const [variants] =
            await conn.execute<RowDataPacket[]>(
              `SELECT
                 v.id,
                 v.unit_of_measure
               FROM acct_product_variants v
               JOIN acct_products p
                 ON p.id = v.product_id
                AND p.legal_business_id =
                    v.legal_business_id
                AND p.division_id = v.division_id
               WHERE v.legal_business_id = ?
                 AND v.division_id = ?
                 AND v.id IN (
                   ${lines.map(() => "?").join(", ")}
                 )
                 AND v.status = 'ACTIVE'
                 AND p.status = 'ACTIVE'`,
              [
                businessId,
                DIVISION_ID,
                ...lines.map((line) => line.variantId),
              ]
            );

          const variantsById = new Map(
            variants.map((variant) => [
              Number(variant.id),
              String(variant.unit_of_measure),
            ])
          );
          const variantsValid = lines.every((line) => {
            const unit = variantsById.get(line.variantId);

            return (
              unit !== undefined &&
              (
                !["PCS", "SET"].includes(unit) ||
                line.quantity.endsWith(".000")
              )
            );
          });

          if (!variantsValid) {
            outcome = "variant-invalid";
          } else {
          // Supplier invoice number is optional, but
          // if supplied it must be unique per supplier.
          if (invoiceNo) {
            const [existing] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_purchase_headers
                 WHERE legal_business_id = ?
                   AND supplier_id = ?
                   AND supplier_invoice_no = ?
                   AND id <> ?
                 LIMIT 1`,
                [
                  businessId,
                  supplierId,
                  invoiceNo,
                  purchaseId ?? 0,
                ]
              );

            if (existing.length > 0) {
              outcome = "duplicate-invoice";
            }
          }

          if (outcome !== "duplicate-invoice") {
            if (purchaseId === undefined) {
              purchaseNo =
                "ATX-PUR-" +
                randomBytes(8).toString("hex").toUpperCase();

              const [header] =
                await conn.execute<ResultSetHeader>(
                  `INSERT INTO acct_purchase_headers
                   (
                     legal_business_id,
                     division_id,
                     purchase_no,
                     supplier_id,
                     supplier_invoice_no,
                     invoice_date,
                     receiving_location_id,
                     status,
                     remarks,
                     created_by
                   )
                   VALUES (
                     ?, ?, ?, ?, ?, ?, ?,
                     'DRAFT', ?, ?
                   )`,
                  [
                    businessId,
                    DIVISION_ID,
                    purchaseNo,
                    supplierId,
                    invoiceNo || null,
                    invoiceDate,
                    locationId,
                    remarks || null,
                    user.id,
                  ]
                );

              savedPurchaseId = header.insertId;
            } else {
              const [updated] =
                await conn.execute<ResultSetHeader>(
                  `UPDATE acct_purchase_headers
                   SET
                     supplier_id = ?,
                     supplier_invoice_no = ?,
                     invoice_date = ?,
                     receiving_location_id = ?,
                     remarks = ?
                   WHERE id = ?
                     AND legal_business_id = ?
                     AND division_id = ?
                     AND status = 'DRAFT'`,
                  [
                    supplierId,
                    invoiceNo || null,
                    invoiceDate,
                    locationId,
                    remarks || null,
                    purchaseId,
                    businessId,
                    DIVISION_ID,
                  ]
                );

              if (updated.affectedRows !== 1) {
                outcome = "not-editable";
              } else {
                await conn.execute(
                  `DELETE FROM acct_purchase_lines
                   WHERE purchase_id = ?
                     AND legal_business_id = ?
                     AND division_id = ?`,
                  [purchaseId, businessId, DIVISION_ID]
                );
              }
            }

            if (outcome !== "not-editable") {
              if (savedPurchaseId === undefined) {
                throw new Error(
                  "Purchase draft save did not produce an ID."
                );
              }

              for (const [index, line] of lines.entries()) {
                await conn.execute(
                  `INSERT INTO acct_purchase_lines
                   (
                     legal_business_id,
                     division_id,
                     purchase_id,
                     line_no,
                     variant_id,
                     quantity,
                     unit_cost,
                     line_amount
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    businessId,
                    DIVISION_ID,
                    savedPurchaseId,
                    index + 1,
                    line.variantId,
                    line.quantity,
                    line.unitCost,
                    line.lineAmount,
                  ]
                );
              }

              await conn.execute(
                `INSERT INTO acct_audit_events
                 (
                   legal_business_id,
                   actor_user_id,
                   action,
                   subject_type,
                   subject_id,
                   details_json
                 )
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  businessId,
                  user.id,
                  purchaseId === undefined
                    ? "PURCHASE_DRAFT_CREATED"
                    : "PURCHASE_DRAFT_UPDATED",
                  "PURCHASE",
                  savedPurchaseId,
                  JSON.stringify({
                    purchase_no: purchaseNo,
                    supplier_id: supplierId,
                    invoice_date: invoiceDate,
                    receiving_location_id: locationId,
                    line_count: lines.length,
                  }),
                ]
              );

              if (purchaseId === undefined) {
                const reportIds = field(form, "report_ids")
                  .split(",")
                  .map((v) => positiveId(v.trim()))
                  .filter((v): v is number => v !== null)
                  .slice(0, 50);
                if (reportIds.length > 0) {
                  await conn.execute(
                    `UPDATE acct_stock_drafts
                        SET status = 'DONE', decided_by = ?, decided_at = NOW(),
                            result_note = ?
                      WHERE legal_business_id = ? AND action = 'RECEIVED'
                        AND status IN ('PENDING', 'DONE')
                        AND id IN (${reportIds.map(() => "?").join(",")})`,
                    [user.id, `Purchase draft ${purchaseNo || savedPurchaseId} created.`, businessId, ...reportIds]
                  );
                }
              }

              await conn.commit();
              outcome =
                purchaseId === undefined ? "created" : "updated";
            }
          }
        }
      }
      }
    }

    if (outcome !== "created" && outcome !== "updated") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Purchase draft save failed", error);
  } finally {
    conn.release();
  }

  if (outcome === "created" || outcome === "updated") {
    revalidatePath(PAGE);
    if (savedPurchaseId !== undefined) {
      revalidatePath(`${PAGE}/${savedPurchaseId}`);
    }
  }

  go(outcome, savedPurchaseId);
}
