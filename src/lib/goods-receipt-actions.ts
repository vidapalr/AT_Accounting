
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";

const LIST_PAGE = "/accounting/purchases";

const MAX_MONEY = 999999999999999999n;

function positiveId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  );
}

function scaled(
  value: unknown,
  decimals: number,
  wholeDigits: number
): bigint | null {
  const s = String(value ?? "");
  const pattern = new RegExp(
    `^\\d{1,${wholeDigits}}(?:\\.\\d{1,${decimals}})?$`
  );

  if (!pattern.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0"))
  );
}

interface PurchaseRow extends RowDataPacket {
  id: number;
  status: string;
  supplier_id: number;
  receiving_location_id: number;
  invoice_date: string;
  location_type: string;
  location_status: string;
  supplier_status: string;
}

interface LineRow extends RowDataPacket {
  id: number;
  line_no: number;
  variant_id: number;
  quantity: string;
  unit_cost: string;
  line_amount: string;
  remarks: string | null;
  unit_of_measure: string;
  variant_status: string;
  product_status: string;
}

export async function postGoodsReceiptAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("purchases");
  const DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const purchaseId = positiveId(form.get("purchase_id"));
  const receivedValue = form.get("received_date");
  const receivedDate =
    typeof receivedValue === "string"
      ? receivedValue.trim()
      : "";

  const confirm = form.get("confirm") === "RECEIVE";

  const detailUrl = purchaseId
    ? `${LIST_PAGE}/${purchaseId}`
    : LIST_PAGE;

  if (!purchaseId || !confirm || !validDate(receivedDate)) {
    redirect(`${detailUrl}?result=invalid`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    // Follow the locking convention used by our
    // other accounting and inventory services.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      outcome = "not-found";
    } else {
      const [purchases] =
        await conn.execute<PurchaseRow[]>(
          `SELECT
             h.id,
             h.status,
             h.supplier_id,
             h.receiving_location_id,
             DATE_FORMAT(h.invoice_date, '%Y-%m-%d')
               AS invoice_date,
             w.location_type,
             w.status AS location_status,
             s.status AS supplier_status
           FROM acct_purchase_headers h
           JOIN acct_inventory_locations w
             ON w.id = h.receiving_location_id
            AND w.legal_business_id = h.legal_business_id
            AND w.division_id = h.division_id
           JOIN acct_suppliers s
             ON s.id = h.supplier_id
            AND s.legal_business_id = h.legal_business_id
           WHERE h.id = ?
             AND h.legal_business_id = ?
             AND h.division_id = ?
           FOR UPDATE`,
          [purchaseId, businessId, DIVISION_ID]
        );

      const purchase = purchases[0];

      if (!purchase) {
        outcome = "not-found";
      } else if (purchase.status !== "DRAFT") {
        outcome = "not-draft";
      } else if (
        purchase.location_type !== "CENTRAL_WAREHOUSE" ||
        purchase.location_status !== "ACTIVE" ||
        purchase.supplier_status !== "ACTIVE"
      ) {
        outcome = "master-invalid";
      } else if (receivedDate < purchase.invoice_date) {
        outcome = "date-invalid";
      } else {
        const [existing] =
          await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_stock_movements
             WHERE legal_business_id = ?
               AND source_type = 'PURCHASE'
               AND source_id = ?
             LIMIT 1`,
            [businessId, purchaseId]
          );

        if (existing.length > 0) {
          outcome = "already-received";
        } else {
          const [lines] =
            await conn.execute<LineRow[]>(
              `SELECT
                 l.id,
                 l.line_no,
                 l.variant_id,
                 CAST(l.quantity AS CHAR) AS quantity,
                 CAST(l.unit_cost AS CHAR) AS unit_cost,
                 CAST(l.line_amount AS CHAR) AS line_amount,
                 l.remarks,
                 v.unit_of_measure,
                 v.status AS variant_status,
                 p.status AS product_status
               FROM acct_purchase_lines l
               JOIN acct_product_variants v
                 ON v.id = l.variant_id
                AND v.legal_business_id = l.legal_business_id
                AND v.division_id = l.division_id
               JOIN acct_products p
                 ON p.id = v.product_id
                AND p.legal_business_id = v.legal_business_id
                AND p.division_id = v.division_id
               WHERE l.purchase_id = ?
                 AND l.legal_business_id = ?
                 AND l.division_id = ?
               ORDER BY l.line_no
               FOR UPDATE`,
              [purchaseId, businessId, DIVISION_ID]
            );

          const seenSkus = new Set<number>();
          let valid = lines.length > 0;
          let purchaseTotal = 0n;

          for (const line of lines) {
            const quantity = scaled(line.quantity, 3, 11);
            const cost = scaled(line.unit_cost, 4, 14);
            const amount = scaled(line.line_amount, 2, 16);

            if (
              quantity === null ||
              quantity <= 0n ||
              cost === null ||
              amount === null ||
              line.variant_status !== "ACTIVE" ||
              line.product_status !== "ACTIVE" ||
              !["PCS", "SET", "METER"].includes(
                line.unit_of_measure
              ) ||
              (
                line.unit_of_measure !== "METER" &&
                quantity % 1000n !== 0n
              ) ||
              seenSkus.has(Number(line.variant_id))
            ) {
              valid = false;
              break;
            }

            const calculatedPaise =
              (quantity * cost + 50000n) / 100000n;

            if (
              calculatedPaise !== amount ||
              calculatedPaise > MAX_MONEY
            ) {
              valid = false;
              break;
            }

            seenSkus.add(Number(line.variant_id));
            purchaseTotal += amount;

            if (purchaseTotal > MAX_MONEY) {
              valid = false;
              break;
            }
          }

          if (!valid || purchaseTotal <= 0n) {
            outcome = "lines-invalid";
          } else {
            // Every stock movement uses the received
            // date, original quantity and purchase cost.
            for (const line of lines) {
              await conn.execute(
                `INSERT INTO acct_stock_movements (
                   legal_business_id,
                   division_id,
                   location_id,
                   variant_id,
                   movement_date,
                   movement_type,
                   source_type,
                   source_id,
                   source_line_id,
                   quantity_change,
                   unit_cost,
                   total_cost,
                   remarks,
                   created_by
                 ) VALUES (
                   ?, ?, ?, ?, ?,
                   'PURCHASE_RECEIPT',
                   'PURCHASE', ?, ?,
                   ?, ?, ?, ?, ?
                 )`,
                [
                  businessId,
                  DIVISION_ID,
                  purchase.receiving_location_id,
                  line.variant_id,
                  receivedDate,
                  purchaseId,
                  line.id,
                  line.quantity,
                  line.unit_cost,
                  line.line_amount,
                  line.remarks,
                  user.id,
                ]
              );

              // Tell the catalogue that new stock has arrived (shown on the
              // New stock page; later used for WhatsApp and social posts).
              await conn.execute(
                `INSERT IGNORE INTO acct_stock_events (
                   legal_business_id, division_id, source_type, source_id,
                   product_id, variant_id, location_id, quantity
                 )
                 SELECT v.legal_business_id, v.division_id, 'PURCHASE', ?,
                        v.product_id, v.id, ?, ?
                   FROM acct_product_variants v
                  WHERE v.legal_business_id = ? AND v.id = ?`,
                [
                  purchaseId,
                  purchase.receiving_location_id,
                  line.quantity,
                  businessId,
                  line.variant_id,
                ]
              );
            }

            const [updated] =
              await conn.execute<ResultSetHeader>(
                `UPDATE acct_purchase_headers
                 SET
                   status = 'POSTED',
                   received_date = ?,
                   posted_by = ?,
                   posted_at = CURRENT_TIMESTAMP
                 WHERE id = ?
                   AND legal_business_id = ?
                   AND division_id = ?
                   AND status = 'DRAFT'`,
                [
                  receivedDate,
                  user.id,
                  purchaseId,
                  businessId,
                  DIVISION_ID,
                ]
              );

            if (updated.affectedRows !== 1) {
              outcome = "posting-conflict";
            } else {
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
                  "PURCHASE_RECEIPT_POSTED",
                  "PURCHASE",
                  purchaseId,
                  JSON.stringify({
                    received_date: receivedDate,
                    warehouse_id:
                      purchase.receiving_location_id,
                    line_count: lines.length,
                    purchase_total:
                      `${purchaseTotal / 100n}.` +
                      String(purchaseTotal % 100n)
                        .padStart(2, "0"),
                  }),
                ]
              );

              await conn.commit();
              outcome = "posted";
            }
          }
        }
      }
    }

    if (outcome !== "posted") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Goods receipt posting failed", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "posted") {
    revalidatePath(LIST_PAGE);
    revalidatePath(detailUrl);
  }

  redirect(`${detailUrl}?result=${outcome}`);
}
