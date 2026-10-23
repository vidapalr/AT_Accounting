import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { detectMedia, deleteMedia, saveMedia, MAX_IMAGE_BYTES } from "@/lib/media-storage";

/** One photo for each of many products in one go. Fields are named photo_<productId>. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canAccess(user.role, "products")) return new NextResponse("Unauthorized", { status: 401 });

  const form = await request.formData();
  let saved = 0;
  let skipped = 0;

  for (const [key, value] of form.entries()) {
    const m = /^photo_(\d+)$/.exec(key);
    if (!m || !(value instanceof File) || value.size === 0) continue;
    const productId = Number(m[1]);

    const [products] = await db.execute<RowDataPacket[]>(
      `SELECT id FROM acct_products WHERE legal_business_id = ? AND id = ?`,
      [user.legal_business_id, productId]
    );
    const buffer = Buffer.from(await value.arrayBuffer());
    const kind = detectMedia(buffer);
    if (products.length !== 1 || !kind || kind.type !== "IMAGE" || buffer.length > MAX_IMAGE_BYTES) {
      skipped += 1;
      continue;
    }

    const storageKey = await saveMedia(buffer, kind.ext);
    try {
      const [existing] = await db.execute<RowDataPacket[]>(
        `SELECT COALESCE(MAX(sort_order), 0) AS top, SUM(is_cover = 1) AS covers
           FROM acct_product_media WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE'`,
        [user.legal_business_id, productId]
      );
      await db.execute(
        `INSERT INTO acct_product_media
           (legal_business_id, product_id, media_type, storage_key, mime_type,
            original_name, size_bytes, is_cover, sort_order, created_by)
         VALUES (?, ?, 'IMAGE', ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id, productId, storageKey, kind.mime, value.name.slice(0, 200),
          buffer.length, Number(existing[0].covers ?? 0) === 0 ? 1 : 0, Number(existing[0].top) + 1, user.id,
        ]
      );
      saved += 1;
    } catch (error) {
      console.error("Bulk photo save failed:", error);
      await deleteMedia(storageKey);
      skipped += 1;
    }
  }

  return NextResponse.redirect(new URL(`/accounting/catalogue/photos?done=${saved}-${skipped}`, request.url), 303);
}
