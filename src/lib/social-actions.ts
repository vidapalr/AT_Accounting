"use server";

import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { InstagramError, publishCarouselToInstagram, publishToInstagram } from "@/lib/instagram-publish";
import { FacebookError, publishToFacebook } from "@/lib/facebook-publish";

export type SocialResult = { ok: boolean; messages: string[] };

/**
 * Posts the chosen photos (or one video) of ONE product to Instagram and/or the Facebook Page.
 * Several photos become one post: a swipeable carousel on Instagram, a multi-photo post on Facebook.
 */
export async function postToSocialAction(input: { mediaIds: number[]; caption: string; instagram: boolean; facebook: boolean }): Promise<SocialResult> {
  const user = await requireAccess("products");
  const site = (process.env.SHOP_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const igUser = process.env.INSTAGRAM_USER_ID;
  const igToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const fbPage = process.env.FACEBOOK_PAGE_ID;
  const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const wantIg = Boolean(input.instagram);
  const wantFb = Boolean(input.facebook);
  const text = String(input.caption ?? "").trim();
  const ids = [...new Set((input.mediaIds ?? []).map(Number))].filter((n) => Number.isSafeInteger(n) && n > 0);

  if (!site) return { ok: false, messages: ["The shop address is not set on the server, so photos cannot be posted automatically."] };
  if (!wantIg && !wantFb) return { ok: false, messages: ["Choose Instagram, Facebook, or both."] };
  if (ids.length === 0 || text.length === 0) return { ok: false, messages: ["Choose at least one photo and write a caption."] };
  if (ids.length > 10) return { ok: false, messages: ["At most 10 photos in one post."] };

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT m.id, m.product_id, m.media_type, m.mime_type, p.show_in_shop
       FROM acct_product_media m
       JOIN acct_products p ON p.id = m.product_id AND p.legal_business_id = m.legal_business_id
      WHERE m.legal_business_id = ? AND m.id IN (?) AND m.status = 'ACTIVE'`,
    [user.legal_business_id, ids]
  );
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const chosen = ids.map((id) => byId.get(id)).filter((r): r is RowDataPacket => Boolean(r));
  if (chosen.length !== ids.length) return { ok: false, messages: ["One of the photos was not found."] };
  if (new Set(chosen.map((r) => Number(r.product_id))).size !== 1) return { ok: false, messages: ["Post photos of one product at a time."] };
  if (chosen.some((r) => Number(r.show_in_shop) !== 1)) {
    return { ok: false, messages: ["Switch on “Show on online shop” for this product first. Instagram and Facebook need a public link to the photos."] };
  }
  const hasVideo = chosen.some((r) => r.media_type === "VIDEO");
  if (hasVideo && chosen.length > 1) return { ok: false, messages: ["A video is posted on its own. Choose the video alone, or only photos."] };
  const url = (id: number) => `${site}/api/shop/media/${id}`;

  const messages: string[] = [];
  let anyOk = false;

  // Check that each photo can really be fetched from the internet, the way Instagram/Facebook will.
  // A network error here is ignored (the server may not reach its own address); a clear problem stops the post.
  const problems: string[] = [];
  for (const [i, id] of ids.entries()) {
    try {
      const res = await fetch(url(id), { redirect: "manual", signal: AbortSignal.timeout(10000) });
      const type = res.headers.get("content-type") ?? "";
      const len = Number(res.headers.get("content-length") ?? 0);
      const label = ids.length > 1 ? `Photo ${i + 1}` : "The photo";
      if (res.status >= 300 && res.status < 400) problems.push(`${label} is behind a redirect (${res.status}). Instagram cannot follow it. Check SHOP_PUBLIC_URL is the exact public address.`);
      else if (res.status !== 200) problems.push(`${label} cannot be opened from the internet (answer ${res.status}).`);
      else if (!/^(image|video)\//.test(type)) problems.push(`${label} is not served as a photo (it came back as "${type.slice(0, 40) || "unknown"}"). Check SHOP_PUBLIC_URL.`);
      else if (!hasVideo && len > 8 * 1024 * 1024) problems.push(`${label} is larger than 8 MB. Instagram refuses it. Upload a smaller copy.`);
      await res.body?.cancel();
    } catch { /* cannot test from here: carry on */ }
  }
  if (problems.length > 0) return { ok: false, messages: problems };
  const log = async (channel: "INSTAGRAM" | "FACEBOOK", ok: boolean, remoteId: string | null, error: string | null) => {
    const base = [user.legal_business_id, Number(chosen[0].product_id), ids[0], text.slice(0, 2200), ok ? "POSTED" : "FAILED", remoteId, error ? error.slice(0, 300) : null, user.id];
    await db.execute(
      `INSERT INTO acct_instagram_posts (legal_business_id, product_id, media_id, caption, status, instagram_media_id, error_text, created_by, channel, media_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...base, channel, ids.length]
    ).catch(() =>
      // Before migration 049: keep the old log shape.
      db.execute(
        `INSERT INTO acct_instagram_posts (legal_business_id, product_id, media_id, caption, status, instagram_media_id, error_text, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, base
      ).catch(() => {})
    );
  };

  if (wantIg) {
    if (!igUser || !igToken) messages.push("Instagram: automatic posting is not set up yet.");
    else if (chosen.some((r) => r.media_type !== "VIDEO" && r.mime_type !== "image/jpeg")) messages.push("Instagram: it accepts JPG photos only. Choose JPG photos, or untick Instagram.");
    else {
      try {
        const out = chosen.length === 1
          ? await publishToInstagram({ kind: hasVideo ? "VIDEO" : "IMAGE", url: url(ids[0]), caption: text, userId: igUser, token: igToken })
          : await publishCarouselToInstagram({ urls: ids.map(url), caption: text, userId: igUser, token: igToken });
        messages.push(`Instagram: posted${chosen.length > 1 ? ` (${chosen.length} photos in one post)` : ""}.`);
        anyOk = true;
        await log("INSTAGRAM", true, out.instagramMediaId, null);
      } catch (error) {
        const reason = error instanceof InstagramError ? error.message : "Could not reach Instagram.";
        messages.push(`Instagram: not posted. ${reason}`);
        await log("INSTAGRAM", false, null, reason);
      }
    }
  }

  if (wantFb) {
    if (!fbPage || !fbToken) messages.push("Facebook: automatic posting is not set up yet.");
    else {
      try {
        const out = await publishToFacebook({
          pageId: fbPage, token: fbToken, caption: text,
          ...(hasVideo ? { videoUrl: url(ids[0]) } : { photoUrls: ids.map(url) }),
        });
        messages.push(`Facebook: posted${chosen.length > 1 ? ` (${chosen.length} photos in one post)` : ""}.`);
        anyOk = true;
        await log("FACEBOOK", true, out.facebookPostId, null);
      } catch (error) {
        const reason = error instanceof FacebookError ? error.message : "Could not reach Facebook.";
        messages.push(`Facebook: not posted. ${reason}`);
        await log("FACEBOOK", false, null, reason);
      }
    }
  }

  revalidatePath("/accounting/catalogue/instagram");
  return { ok: anyOk, messages };
}
