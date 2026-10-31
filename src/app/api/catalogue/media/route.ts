import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { seeOther } from "@/lib/redirect";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import {
  detectMedia,
  deleteMedia,
  saveMedia,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "@/lib/media-storage";


/** Upload one or more photos / videos for a product. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canAccess(user.role, "products")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const productId = Number(form.get("product_id"));
  const back = (extra: string) =>
    seeOther(`/accounting/catalogue/${productId}?${extra}`);

  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const [products] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_products WHERE legal_business_id = ? AND id = ?`,
    [user.legal_business_id, productId]
  );
  if (products.length !== 1) return new NextResponse("Not found", { status: 404 });

  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return back("upload=none");
  if (files.length > 12) return back("upload=toomany");

  let saved = 0;
  let skipped = 0;

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectMedia(buffer);
    const limit = kind?.type === "VIDEO" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (!kind || buffer.length > limit) {
      skipped += 1;
      continue;
    }

    const key = await saveMedia(buffer, kind.ext);
    try {
      const [existing] = await db.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS n,
                COALESCE(MAX(sort_order), 0) AS top,
                SUM(is_cover = 1) AS covers
           FROM acct_product_media
          WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE'`,
        [user.legal_business_id, productId]
      );
      const makeCover = kind.type === "IMAGE" && Number(existing[0].covers ?? 0) === 0;
      await db.execute(
        `INSERT INTO acct_product_media
           (legal_business_id, product_id, media_type, storage_key, mime_type,
            original_name, size_bytes, is_cover, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id, productId, kind.type, key, kind.mime,
          file.name.slice(0, 200), buffer.length, makeCover ? 1 : 0,
          Number(existing[0].top) + 1, user.id,
        ]
      );
      saved += 1;
    } catch (error) {
      console.error("Media save failed:", error);
      await deleteMedia(key);
      skipped += 1;
    }
  }

  return back(`upload=${saved}-${skipped}`);
}
