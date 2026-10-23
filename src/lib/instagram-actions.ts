"use server";

import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { InstagramError, publishToInstagram } from "@/lib/instagram-publish";

export type PostResult = { ok: boolean; message: string };

/** Posts one of a product's photos/videos to Instagram. Owner/accountant only. */
export async function postToInstagramAction(mediaId: number, caption: string): Promise<PostResult> {
  const user = await requireAccess("products");
  const userId = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const site = (process.env.SHOP_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (!userId || !token || !site) {
    return { ok: false, message: "Automatic posting is not set up yet. Use Share or Save instead." };
  }
  const text = String(caption ?? "").trim();
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0 || text.length === 0) {
    return { ok: false, message: "Please check the caption and the photo." };
  }

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT m.id, m.product_id, m.media_type, m.mime_type, p.show_in_shop
       FROM acct_product_media m
       JOIN acct_products p ON p.id = m.product_id AND p.legal_business_id = m.legal_business_id
      WHERE m.legal_business_id = ? AND m.id = ? AND m.status = 'ACTIVE'`,
    [user.legal_business_id, mediaId]
  );
  const m = rows[0];
  if (!m) return { ok: false, message: "That photo was not found." };
  if (Number(m.show_in_shop) !== 1) {
    return { ok: false, message: "Switch on “Show on online shop” for this product first. Instagram needs a public link to the photo." };
  }
  const isVideo = m.media_type === "VIDEO";
  if (!isVideo && m.mime_type !== "image/jpeg") {
    return { ok: false, message: "Instagram accepts JPG photos only. Upload a JPG, or use Share/Save." };
  }

  let result: PostResult;
  let igId: string | null = null;
  try {
    const out = await publishToInstagram({
      kind: isVideo ? "VIDEO" : "IMAGE",
      url: `${site}/api/shop/media/${mediaId}`,
      caption: text,
      userId,
      token,
    });
    igId = out.instagramMediaId;
    result = { ok: true, message: "Posted to Instagram." };
  } catch (error) {
    const reason = error instanceof InstagramError ? error.message : "Could not reach Instagram.";
    result = { ok: false, message: `Not posted: ${reason}` };
  }

  await db
    .execute(
      `INSERT INTO acct_instagram_posts
         (legal_business_id, product_id, media_id, caption, status, instagram_media_id, error_text, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.legal_business_id, Number(m.product_id), mediaId, text.slice(0, 2200),
        result.ok ? "POSTED" : "FAILED", igId, result.ok ? null : result.message.slice(0, 300), user.id,
      ]
    )
    .catch(() => {});
  revalidatePath("/accounting/catalogue/instagram");
  return result;
}
