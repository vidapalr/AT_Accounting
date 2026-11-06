import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { detectMedia, saveMedia, deleteMedia, MAX_VIDEO_BYTES } from "@/lib/media-storage";

/** Saves a reel made in the browser as an MP4 video on the product, ready to post. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canAccess(user.role, "products")) return new NextResponse("Unauthorized", { status: 401 });

  const form = await request.formData();
  const productId = Number(form.get("product_id"));
  const file = form.get("file");
  if (!Number.isSafeInteger(productId) || productId <= 0 || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
  }
  const [products] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_products WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, productId]);
  if (products.length !== 1) return NextResponse.json({ ok: false, error: "Product not found." }, { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = detectMedia(buffer);
  // Instagram only accepts MP4, so nothing else is kept as a reel.
  if (!kind || kind.mime !== "video/mp4") return NextResponse.json({ ok: false, error: "The reel must be an MP4 video." }, { status: 400 });
  // Instagram needs H.264 video; a browser can put VP9 in an MP4 file, which Instagram refuses.
  if (!buffer.includes("avc1") || buffer.includes("vp09")) {
    return NextResponse.json({ ok: false, error: "This video is not in the format Instagram takes (H.264). Make the reel in Chrome or Safari, updated." }, { status: 400 });
  }
  if (buffer.length > MAX_VIDEO_BYTES) return NextResponse.json({ ok: false, error: "The reel is too big (over 60 MB)." }, { status: 400 });

  const key = await saveMedia(buffer, kind.ext);
  try {
    const [existing] = await db.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(sort_order), 0) AS top FROM acct_product_media WHERE legal_business_id = ? AND product_id = ? AND status = 'ACTIVE'`,
      [user.legal_business_id, productId]);
    await db.execute(
      `INSERT INTO acct_product_media (legal_business_id, product_id, media_type, storage_key, mime_type, original_name, size_bytes, is_cover, sort_order, created_by)
       VALUES (?, ?, 'VIDEO', ?, 'video/mp4', 'reel.mp4', ?, 0, ?, ?)`,
      [user.legal_business_id, productId, key, buffer.length, Number(existing[0].top) + 1, user.id]);
  } catch (error) {
    console.error("Reel save failed:", error);
    await deleteMedia(key);
    return NextResponse.json({ ok: false, error: "Could not save the reel." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, next: `/accounting/catalogue/instagram?product=${productId}` });
}
