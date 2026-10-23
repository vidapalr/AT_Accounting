"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { deleteMedia } from "@/lib/media-storage";

function id(form: FormData, key: string): number {
  const n = Number(form.get(key));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/** Choose the photo that represents the product everywhere. */
export async function setCoverAction(form: FormData): Promise<void> {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const mediaId = id(form, "media_id");
  const productId = id(form, "product_id");
  const back = `/accounting/catalogue/${productId}`;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_product_media
      WHERE legal_business_id = ? AND id = ? AND product_id = ?
        AND media_type = 'IMAGE' AND status = 'ACTIVE'`,
    [businessId, mediaId, productId]
  );
  if (rows.length === 1) {
    await db.execute(
      `UPDATE acct_product_media SET is_cover = (id = ?)
        WHERE legal_business_id = ? AND product_id = ?`,
      [mediaId, businessId, productId]
    );
  }
  revalidatePath(back);
  revalidatePath("/accounting/catalogue");
  redirect(back);
}

export async function removeMediaAction(form: FormData): Promise<void> {
  const user = await requireAccess("products");
  const businessId = user.legal_business_id;
  const mediaId = id(form, "media_id");
  const productId = id(form, "product_id");
  const back = `/accounting/catalogue/${productId}`;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT storage_key, is_cover FROM acct_product_media
      WHERE legal_business_id = ? AND id = ? AND product_id = ? AND status = 'ACTIVE'`,
    [businessId, mediaId, productId]
  );
  if (rows.length === 1) {
    await db.execute(
      `UPDATE acct_product_media SET status = 'REMOVED', is_cover = 0
        WHERE legal_business_id = ? AND id = ?`,
      [businessId, mediaId]
    );
    await deleteMedia(String(rows[0].storage_key));

    // If the cover went, the next photo takes its place.
    if (Number(rows[0].is_cover) === 1) {
      await db.execute(
        `UPDATE acct_product_media SET is_cover = 1
          WHERE legal_business_id = ? AND product_id = ? AND media_type = 'IMAGE'
            AND status = 'ACTIVE'
          ORDER BY sort_order LIMIT 1`,
        [businessId, productId]
      );
    }
  }
  revalidatePath(back);
  revalidatePath("/accounting/catalogue");
  redirect(back);
}

/** Mark a "new stock" notice as shared or dismissed. */
export async function updateStockEventAction(form: FormData): Promise<void> {
  const user = await requireAccess("products");
  const eventIds = String(form.get("event_ids") ?? "")
    .split(",")
    .map(Number)
    .filter(n => Number.isSafeInteger(n) && n > 0)
    .slice(0, 200);
  const status = String(form.get("status") ?? "");

  if (eventIds.length > 0 && ["SHARED", "DISMISSED"].includes(status)) {
    await db.query(
      `UPDATE acct_stock_events
          SET status = ?, shared_at = IF(? = 'SHARED', NOW(), shared_at)
        WHERE legal_business_id = ? AND id IN (?)`,
      [status, status, user.legal_business_id, eventIds]
    );
  }
  revalidatePath("/accounting/catalogue/new-stock");
  redirect("/accounting/catalogue/new-stock");
}
