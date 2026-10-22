

"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "next/navigation";

import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/stock-transfers";

const DIVISION_ID = 1;

const MAX_ITEM_COUNT = 100;

type TransferItem = {

  variantId: number;

  quantity: string;

  minPrice: string;

  maxPrice: string | null;

  suggestedPrice: string | null;

};

function positiveNumber(value: string): boolean {

  return /^\d+(\.\d{1,3})?$/.test(value)

    && Number(value) > 0;

}

function money(value: string): boolean {

  return /^\d+(\.\d{1,2})?$/.test(value)

    && Number.isFinite(Number(value))

    && Number(value) >= 0;

}

function toTwoLetters(value: string): string {

  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");

  if (letters.length < 2) {

    throw new Error("Branch name cannot generate a code");

  }

  return letters.slice(0, 2);

}

export async function saveStockTransferDraftAction(

  form: FormData

): Promise<void> {

  const user = await requireGroupOwner();

  const businessId = user.legal_business_id;

  const rawTransferId = String(form.get("transfer_id") ?? "").trim();

  const parsedTransferId = Number(rawTransferId);

  const transferId =

    rawTransferId && Number.isSafeInteger(parsedTransferId) &&

    parsedTransferId > 0

      ? parsedTransferId

      : null;

  const fromId = Number(form.get("from_location_id"));

  const toId = Number(form.get("to_location_id"));

  const date = String(form.get("transfer_date") ?? "");

  const remarks = String(form.get("remarks") ?? "").trim();

  const items: TransferItem[] = [];

  let malformedItem = false;

  for (let i = 0; i < MAX_ITEM_COUNT; i++) {

    const rawVariantId = String(form.get(`variant_${i}`) ?? "").trim();

    const quantity = String(form.get(`quantity_${i}`) ?? "").trim();

    const minPrice = String(form.get(`min_${i}`) ?? "").trim();

    const maxPrice = String(form.get(`max_${i}`) ?? "").trim();

    const suggestedPrice = String(

      form.get(`suggested_${i}`) ?? ""

    ).trim();

    if (!rawVariantId) {

      if (quantity || minPrice || maxPrice || suggestedPrice) {

        malformedItem = true;

      }

      continue;

    }

    const variantId = Number(rawVariantId);

    items.push({

      variantId,

      quantity,

      minPrice,

      maxPrice: maxPrice || null,

      suggestedPrice: suggestedPrice || null,

    });

  }

  if (

    (rawTransferId !== "" && transferId === null) ||

    !Number.isSafeInteger(fromId) ||

    !Number.isSafeInteger(toId) ||

    fromId <= 0 ||

    toId <= 0 ||

    fromId === toId ||

    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||

    remarks.length > 500 ||

    malformedItem ||

    items.length === 0 ||

    items.length > MAX_ITEM_COUNT ||

    new Set(items.map(x => x.variantId)).size !== items.length

  ) {

    redirect(`${PAGE}?result=invalid`);

  }

  for (const item of items) {

    if (

      !Number.isSafeInteger(item.variantId) ||

      item.variantId <= 0 ||

      !positiveNumber(item.quantity) ||

      (item.minPrice !== "" && !money(item.minPrice)) ||

      (item.maxPrice !== null && !money(item.maxPrice)) ||

      (

        item.suggestedPrice !== null &&

        !money(item.suggestedPrice)

      ) ||

      false

    ) {

      redirect(`${PAGE}?result=invalid-item`);

    }

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

    if (business.length !== 1) {

      throw new Error("Legal business not found");

    }

    let editable = true;

    if (transferId !== null) {

      const [existing] = await conn.execute<RowDataPacket[]>(

        `SELECT id

         FROM acct_stock_transfers

         WHERE id = ?

           AND legal_business_id = ?

           AND division_id = ?

           AND status = 'DRAFT'

         FOR UPDATE`,

        [transferId, businessId, DIVISION_ID]

      );

      editable = existing.length === 1;

    }

    if (!editable) {

      outcome = "not-editable";

    } else {

      const [locations] = await conn.execute<RowDataPacket[]>(

        `SELECT

           l.id,

           l.location_type,

           l.branch_id,

           b.branch_name,

           b.branch_code

         FROM acct_inventory_locations l

         LEFT JOIN acct_branches b

           ON b.legal_business_id = l.legal_business_id

          AND b.division_id = l.division_id

          AND b.id = l.branch_id

         WHERE l.legal_business_id = ?

           AND l.division_id = ?

           AND l.status = 'ACTIVE'

           AND l.id IN (?, ?)

         FOR UPDATE`,

        [businessId, DIVISION_ID, fromId, toId]

      );

      const source = locations.find(x => Number(x.id) === fromId);

      const destination = locations.find(x => Number(x.id) === toId);

      if (

        !source ||

        !destination ||

        ![

          "CENTRAL_WAREHOUSE",

          "WAREHOUSE",

          "RETAIL",

          "STOCKROOM",

        ].includes(String(source.location_type)) ||

        destination.location_type !== "RETAIL" ||

        !destination.branch_id ||

        !destination.branch_name ||

        !destination.branch_code

      ) {

        outcome = "location-invalid";

      } else {

      const ids = items.map(x => x.variantId);

      const placeholders = ids.map(() => "?").join(",");

      const [variants] = await conn.execute<RowDataPacket[]>(

        `SELECT

           v.id,

           v.status,

           p.status AS product_status,

           COALESCE(

             SUM(

               CASE

                 WHEN m.location_id = ?

                 THEN m.quantity_change

                 ELSE 0

               END

             ), 0

           ) AS available_quantity,
           COALESCE(SUM(CASE WHEN m.location_id = ?
              THEN CASE WHEN m.quantity_change > 0
                   THEN m.total_cost ELSE -m.total_cost END
              ELSE 0 END), 0) AS available_value

         FROM acct_product_variants v

         JOIN acct_products p

           ON p.id = v.product_id

          AND p.legal_business_id = v.legal_business_id

          AND p.division_id = v.division_id

         LEFT JOIN acct_stock_movements m

           ON m.legal_business_id = v.legal_business_id

          AND m.division_id = v.division_id

          AND m.variant_id = v.id

         WHERE v.legal_business_id = ?

           AND v.division_id = ?

           AND v.id IN (${placeholders})

         GROUP BY v.id, v.status, p.status`,

        [fromId, fromId, businessId, DIVISION_ID, ...ids]

      );

      if (

        variants.length !== items.length ||

        variants.some(v =>

          v.status !== "ACTIVE" ||

          v.product_status !== "ACTIVE"

        )

      ) {

        outcome = "product-invalid";

      } else if (

        items.some(item => {

          const variant = variants.find(

            v => Number(v.id) === item.variantId

          );

          return (

            !variant ||

            Number(item.quantity) >

              Number(variant.available_quantity)

          );

        })

      ) {

        outcome = "insufficient-stock";

      } else {

        let savedTransferId = transferId;

        if (savedTransferId === null) {

          const branchSegment = toTwoLetters(

            String(destination.branch_code)

          );

          const prefix = `AB_AT_${branchSegment}_TF`;

          await conn.execute(

            `INSERT INTO acct_document_sequences (

               legal_business_id,

               document_type,

               code_prefix,

               last_number

             ) VALUES (?, 'TRANSFER', ?, 0)

             ON DUPLICATE KEY UPDATE id = id`,

            [businessId, prefix]

          );

          const [sequences] =

            await conn.execute<RowDataPacket[]>(

              `SELECT id, last_number

               FROM acct_document_sequences

               WHERE legal_business_id = ?

                 AND document_type = 'TRANSFER'

                 AND code_prefix = ?

               FOR UPDATE`,

              [businessId, prefix]

            );

          if (sequences.length !== 1) {

            throw new Error("Transfer sequence not found");

          }

          const next = BigInt(sequences[0].last_number) + 1n;

          await conn.execute(

            `UPDATE acct_document_sequences

             SET last_number = ?

             WHERE id = ?`,

            [next.toString(), sequences[0].id]

          );

          const transferNo =

            `${prefix}_${next.toString().padStart(2, "0")}`;

          const [header] =

            await conn.execute<ResultSetHeader>(

              `INSERT INTO acct_stock_transfers (

                 legal_business_id,

                 division_id,

                 transfer_no,

                 from_location_id,

                 to_location_id,

                 transfer_date,

                 status,

                 remarks,

                 created_by

               ) VALUES (

                 ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?

               )`,

              [

                businessId,

                DIVISION_ID,

                transferNo,

                fromId,

                toId,

                date,

                remarks || null,

                user.id,

              ]

            );

          savedTransferId = header.insertId;

        } else {

          const [updated] =

            await conn.execute<ResultSetHeader>(

              `UPDATE acct_stock_transfers

               SET

                 from_location_id = ?,

                 to_location_id = ?,

                 transfer_date = ?,

                 remarks = ?

               WHERE id = ?

                 AND legal_business_id = ?

                 AND division_id = ?

                 AND status = 'DRAFT'`,

              [

                fromId,

                toId,

                date,

                remarks || null,

                savedTransferId,

                businessId,

                DIVISION_ID,

              ]

            );

          if (updated.affectedRows !== 1) {

            throw new Error("Draft transfer update failed");

          }

          await conn.execute(

            `DELETE FROM acct_stock_transfer_lines

             WHERE transfer_id = ?

               AND legal_business_id = ?

               AND division_id = ?`,

            [savedTransferId, businessId, DIVISION_ID]

          );

        }

        for (const item of items) {
          const stock = variants.find(v => Number(v.id) === item.variantId);
          if (!stock || Number(stock.available_quantity) <= 0 ||
              Number(stock.available_value) <= 0) {
            throw new Error("Unable to calculate selling prices: missing valid stock cost");
          }
          const [autoPrices] = await conn.execute<RowDataPacket[]>(
            `SELECT
               CAST(ROUND((? / ?) * 1.01 * 1.30, 2) AS CHAR) AS minimum,
               CAST(ROUND((? / ?) * 1.01 * 2.00, 2) AS CHAR) AS maximum`,
            [String(stock.available_value), String(stock.available_quantity),
             String(stock.available_value), String(stock.available_quantity)]
          );
          const calculatedMin = String(autoPrices[0].minimum);
          const calculatedMax = String(autoPrices[0].maximum);

          await conn.execute(

            `INSERT INTO acct_stock_transfer_lines (

               legal_business_id,

               division_id,

               transfer_id,

               variant_id,

               quantity,

               min_selling_price,

               max_selling_price,

               suggested_selling_price

             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,

            [

              businessId,

              DIVISION_ID,

              savedTransferId,

              item.variantId,

              item.quantity,

              calculatedMin,

              calculatedMax,

              item.suggestedPrice,

            ]

          );

        }

        await conn.commit();

        outcome = transferId === null ? "created" : "updated";

      }

      }

    }

    if (outcome !== "created" && outcome !== "updated") {

      await conn.rollback();

    }

  } catch (error) {

    await conn.rollback().catch(() => {});

    console.error("Stock transfer draft failed:", error);

  } finally {

    conn.release();

  }

  if (outcome === "created" || outcome === "updated") {

    revalidatePath(PAGE);

  }

  redirect(`${PAGE}?result=${outcome}`);

}

type TransferRow = RowDataPacket & {

  id: number;

  division_id: number;

  from_location_id: number;

  to_location_id: number;

  transfer_date: string;

  status: string;

};

type TransferLineRow = RowDataPacket & {

  id: number;

  variant_id: number;

  quantity: string;

};

function validIsoDate(value: string): boolean {

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [y, m, d] = value.split("-").map(Number);

  const date = new Date(Date.UTC(y, m - 1, d));

  return (

    date.getUTCFullYear() === y &&

    date.getUTCMonth() + 1 === m &&

    date.getUTCDate() === d

  );

}

function validId(value: FormDataEntryValue | null): number {

  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : 0;

}

export async function dispatchStockTransferAction(

  form: FormData

): Promise<void> {

  const user = await requireGroupOwner();

  const businessId = user.legal_business_id;

  const transferId = validId(form.get("transfer_id"));

  if (!transferId) {

    redirect(`${PAGE}?result=invalid`);

  }

  const conn = await db.getConnection();

  let result = "failed";

  try {

    await conn.beginTransaction();

    await conn.execute(

      `SELECT id FROM acct_legal_businesses

       WHERE id = ? FOR UPDATE`,

      [businessId]

    );

    const [transfers] = await conn.execute<TransferRow[]>(

      `SELECT

         id, division_id, from_location_id,

         to_location_id,

         DATE_FORMAT(transfer_date, '%Y-%m-%d')

           AS transfer_date,

         status

       FROM acct_stock_transfers

       WHERE legal_business_id = ?

         AND division_id = ?

         AND id = ?

       FOR UPDATE`,

      [businessId, DIVISION_ID, transferId]

    );

    const transfer = transfers[0];

    if (!transfer || transfer.status !== "DRAFT") {

      result = "not-draft";

    } else {

      const [locations] = await conn.execute<RowDataPacket[]>(

        `SELECT id, location_type, branch_id, status

         FROM acct_inventory_locations

         WHERE legal_business_id = ?

           AND division_id = ?

           AND id IN (?, ?)

         FOR UPDATE`,

        [

          businessId,

          DIVISION_ID,

          transfer.from_location_id,

          transfer.to_location_id,

        ]

      );

      const source = locations.find(

        (location) =>

          Number(location.id) === Number(transfer.from_location_id)

      );

      const target = locations.find(

        (location) =>

          Number(location.id) === Number(transfer.to_location_id)

      );

      if (

        source?.status !== "ACTIVE" ||

        ![

          "CENTRAL_WAREHOUSE",

          "WAREHOUSE",

          "RETAIL",

          "STOCKROOM",

        ].includes(String(source.location_type)) ||

        target?.status !== "ACTIVE" ||

        target.location_type !== "RETAIL" ||

        !target.branch_id

      ) {

        result = "location-invalid";

      } else {

        const [lines] = await conn.execute<TransferLineRow[]>(

          `SELECT id, variant_id, quantity

           FROM acct_stock_transfer_lines

           WHERE legal_business_id = ?

             AND division_id = ?

             AND transfer_id = ?

           ORDER BY id

           FOR UPDATE`,

          [businessId, DIVISION_ID, transferId]

        );

        if (lines.length === 0) {

          result = "invalid-item";

        } else {

          for (const line of lines) {

            const [balances] = await conn.execute<RowDataPacket[]>(

              `SELECT

                 COALESCE(SUM(quantity_change), 0)

                   AS available_qty,

                 COALESCE(SUM(

                   CASE

                     WHEN quantity_change > 0

                       THEN total_cost

                     ELSE -total_cost

                   END

                 ), 0) AS available_value

               FROM acct_stock_movements

               WHERE legal_business_id = ?

                 AND division_id = ?

                 AND location_id = ?

                 AND variant_id = ?`,

              [

                businessId,

                DIVISION_ID,

                transfer.from_location_id,

                line.variant_id,

              ]

            );

            const balance = balances[0];

            if (

              Number(balance.available_qty) < Number(line.quantity)

            ) {

              result = "insufficient-stock";

              break;

            }

            const [valuations] = await conn.execute<RowDataPacket[]>(

              `SELECT

                 ROUND(? / ?, 4) AS unit_cost`,

              [

                String(balance.available_value),

                String(balance.available_qty),

              ]

            );

            const unitCost = String(valuations[0].unit_cost);

            if (

              Number(balance.available_value) < 0 ||

              !Number.isFinite(Number(unitCost)) ||

              Number(unitCost) < 0

            ) {

              result = "valuation-invalid";

              break;

            }

            const [amounts] = await conn.execute<RowDataPacket[]>(

              `SELECT ROUND(? * ?, 2) AS total_cost`,

              [String(line.quantity), unitCost]

            );

            const totalCost = String(amounts[0].total_cost);

            await conn.execute(

              `UPDATE acct_stock_transfer_lines

               SET dispatched_unit_cost = ?

               WHERE id = ?

                 AND legal_business_id = ?

                 AND division_id = ?

                 AND transfer_id = ?`,

              [

                unitCost,

                line.id,

                businessId,

                DIVISION_ID,

                transferId,

              ]

            );

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

                 'TRANSFER_OUT',

                 'STOCK_TRANSFER',

                 ?, ?,

                 -?,

                 ?, ?,

                 'Warehouse dispatch',

                 ?

               )`,

              [

                businessId,

                DIVISION_ID,

                transfer.from_location_id,

                line.variant_id,

                transfer.transfer_date,

                transferId,

                line.id,

                String(line.quantity),

                unitCost,

                totalCost,

                user.id,

              ]

            );

          }

          if (

            result !== "insufficient-stock" &&

            result !== "valuation-invalid"

          ) {

            const [update] =

              await conn.execute<ResultSetHeader>(

                `UPDATE acct_stock_transfers

                 SET status = 'DISPATCHED',

                     dispatched_by = ?,

                     dispatched_at = CURRENT_TIMESTAMP

                 WHERE legal_business_id = ?

                   AND division_id = ?

                   AND id = ?

                   AND status = 'DRAFT'`,

                [user.id, businessId, DIVISION_ID, transferId]

              );

            if (update.affectedRows !== 1) {

              throw new Error("Dispatch status conflict");

            }

            await conn.commit();

            result = "dispatched";

          }

        }

      }

    }

    if (result !== "dispatched") {

      await conn.rollback();

    }

  } catch (error) {

    await conn.rollback().catch(() => {});

    console.error("Stock dispatch failed:", error);

    result = "failed";

  } finally {

    conn.release();

  }

  if (result === "dispatched") {

    revalidatePath(PAGE);

  }

  redirect(`${PAGE}?result=${result}`);

}

export async function receiveStockTransferAction(

  form: FormData

): Promise<void> {

  const user = await requireGroupOwner();

  const businessId = user.legal_business_id;

  const transferId = validId(form.get("transfer_id"));

  const receivedDate = String(

    form.get("received_date") ?? ""

  );

  if (!transferId || !validIsoDate(receivedDate)) {

    redirect(`${PAGE}?result=invalid`);

  }

  const conn = await db.getConnection();

  let result = "failed";

  try {

    await conn.beginTransaction();

    await conn.execute(

      `SELECT id FROM acct_legal_businesses

       WHERE id = ? FOR UPDATE`,

      [businessId]

    );

    const [transfers] = await conn.execute<TransferRow[]>(

      `SELECT

         id, division_id, from_location_id,

         to_location_id,

         DATE_FORMAT(transfer_date, '%Y-%m-%d')

           AS transfer_date,

         status

       FROM acct_stock_transfers

       WHERE legal_business_id = ?

         AND division_id = ?

         AND id = ?

       FOR UPDATE`,

      [businessId, DIVISION_ID, transferId]

    );

    const transfer = transfers[0];

    if (!transfer || transfer.status !== "DISPATCHED") {

      result = "not-dispatched";

    } else if (receivedDate < transfer.transfer_date) {

      result = "date-invalid";

    } else {

      const [destination] = await conn.execute<RowDataPacket[]>(

        `SELECT id

         FROM acct_inventory_locations

         WHERE legal_business_id = ?

           AND division_id = ?

           AND id = ?

           AND location_type = 'RETAIL'

           AND branch_id IS NOT NULL

           AND status = 'ACTIVE'

         FOR UPDATE`,

        [businessId, DIVISION_ID, transfer.to_location_id]

      );

      const [lines] = await conn.execute<TransferLineRow[]>(

        `SELECT id, variant_id, quantity

         FROM acct_stock_transfer_lines

         WHERE legal_business_id = ?

           AND division_id = ?

           AND transfer_id = ?

         ORDER BY id

         FOR UPDATE`,

        [businessId, DIVISION_ID, transferId]

      );

      if (destination.length !== 1 || lines.length === 0) {

        result = "location-invalid";

      } else {

        for (const line of lines) {

          const [outgoing] = await conn.execute<RowDataPacket[]>(

            `SELECT

               quantity_change,

               unit_cost,

               total_cost

             FROM acct_stock_movements

             WHERE legal_business_id = ?

               AND division_id = ?

               AND location_id = ?

               AND variant_id = ?

               AND movement_type = 'TRANSFER_OUT'

               AND source_type = 'STOCK_TRANSFER'

               AND source_id = ?

               AND source_line_id = ?`,

            [

              businessId,

              DIVISION_ID,

              transfer.from_location_id,

              line.variant_id,

              transferId,

              line.id,

            ]

          );

          if (

            outgoing.length !== 1 ||

            Number(outgoing[0].quantity_change) !==

              -Number(line.quantity)

          ) {

            throw new Error(

              `Dispatch movement missing for line ${line.id}`

            );

          }

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

               'TRANSFER_IN',

               'STOCK_TRANSFER',

               ?, ?, ?,

               ?, ?,

               'Branch receipt',

               ?

             )`,

            [

              businessId,

              DIVISION_ID,

              transfer.to_location_id,

              line.variant_id,

              receivedDate,

              transferId,

              line.id,

              String(line.quantity),

              String(outgoing[0].unit_cost),

              String(outgoing[0].total_cost),

              user.id,

            ]

          );

        }

        const [update] =

          await conn.execute<ResultSetHeader>(

            `UPDATE acct_stock_transfers

             SET status = 'RECEIVED',

                 received_by = ?,

                 received_at = CURRENT_TIMESTAMP

             WHERE legal_business_id = ?

               AND division_id = ?

               AND id = ?

               AND status = 'DISPATCHED'`,

            [user.id, businessId, DIVISION_ID, transferId]

          );

        if (update.affectedRows !== 1) {

          throw new Error("Receipt status conflict");

        }

        await conn.commit();

        result = "received";

      }

    }

    if (result !== "received") {

      await conn.rollback();

    }

  } catch (error) {

    await conn.rollback().catch(() => {});

    console.error("Stock receipt failed:", error);

    result = "failed";

  } finally {

    conn.release();

  }

  if (result === "received") {

    revalidatePath(PAGE);

  }

  redirect(`${PAGE}?result=${result}`);

}
