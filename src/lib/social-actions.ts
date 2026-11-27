"use server";

import { revalidatePath } from "next/cache";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { mediaSize } from "@/lib/media-storage";
import { InstagramError, publishCarouselToInstagram, publishToInstagram } from "@/lib/instagram-publish";
import { FacebookError, publishToFacebook } from "@/lib/facebook-publish";

export type SocialResult = { ok: boolean; messages: string[] };

/**
 * Posts the chosen photos and/or one video of ONE product to Instagram and/or the Facebook Page.
 * Several photos become one post: a swipeable carousel on Instagram, a multi-photo post on Facebook.
 * A video goes out as a reel on both, as its own post in the same press.
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
    `SELECT m.id, m.product_id, m.media_type, m.mime_type, m.storage_key, p.status AS product_status, p.show_in_shop
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
  // Photos go out together as one post; a video (a reel) goes out as its own reel in the same press.
  const videos = chosen.filter((r) => r.media_type === "VIDEO").map((r) => Number(r.id));
  const photoIds = chosen.filter((r) => r.media_type !== "VIDEO").map((r) => Number(r.id));
  if (videos.length > 1) return { ok: false, messages: ["Choose one video (reel) at a time. Photos can go with it."] };
  const hasVideo = videos.length > 0;
  const url = (id: number) => `${site}/api/shop/media/${id}`;
  // Instagram gets a JPG copy in a shape it accepts (PNG / WebP / very tall photos are converted on the server).
  const igUrl = (id: number) => (videos.includes(id) ? url(id) : `${url(id)}?for=instagram`);

  const messages: string[] = [];
  let anyOk = false;

  // Check that each photo can really be fetched from the internet, the way Instagram/Facebook will.
  // A network error here is ignored (the server may not reach its own address); a clear problem stops the post.
  const problems: string[] = [];
  for (const [i, id] of ids.entries()) {
    try {
      const res = await fetch(url(id), { redirect: "manual", signal: AbortSignal.timeout(10000) });
      const type = res.headers.get("content-type") ?? "";
      const label = ids.length > 1 ? `Photo ${i + 1}` : "The photo";
      if (res.status >= 300 && res.status < 400) problems.push(`${label} is behind a redirect (${res.status}). Instagram cannot follow it. Check SHOP_PUBLIC_URL is the exact public address.`);
      else if (res.status === 404) {
        const row = byId.get(id);
        const onDisk = row ? await mediaSize(String(row.storage_key)) : null;
        if (row && row.product_status !== "ACTIVE") problems.push(`${label}: the product is not active, so its photos are not public.`);
        else if (onDisk === null) problems.push(`${label}: the photo file is missing on the server (it may have been deleted by a redeploy). Upload it again, and set MEDIA_DIR to a folder outside the app.`);
        else problems.push(`${label} is on the server but the address ${site} does not serve it (404). Open ${url(id)} in a browser: SHOP_PUBLIC_URL must be exactly your shop address, e.g. https://shop.example.com, with nothing after the address.`);
      }
      else if (res.status !== 200) problems.push(`${label} cannot be opened from the internet (answer ${res.status}).`);
      else if (!/^(image|video)\//.test(type)) problems.push(`${label} is not served as a photo (it came back as "${type.slice(0, 40) || "unknown"}"). Check SHOP_PUBLIC_URL.`);
      await res.body?.cancel();
    } catch { /* cannot test from here: carry on */ }
  }
  if (problems.length > 0) return { ok: false, messages: problems };
  const log = async (channel: "INSTAGRAM" | "FACEBOOK", ok: boolean, remoteId: string | null, error: string | null, partIds: number[]) => {
    const base = [user.legal_business_id, Number(chosen[0].product_id), partIds[0], text.slice(0, 2200), ok ? "POSTED" : "FAILED", remoteId, error ? error.slice(0, 300) : null, user.id];
    await db.execute(
      `INSERT INTO acct_instagram_posts (legal_business_id, product_id, media_id, caption, status, instagram_media_id, error_text, created_by, channel, media_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...base, channel, partIds.length]
    ).catch(() =>
      // Before migration 049: keep the old log shape.
      db.execute(
        `INSERT INTO acct_instagram_posts (legal_business_id, product_id, media_id, caption, status, instagram_media_id, error_text, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, base
      ).catch(() => {})
    );
  };

  const parts: Array<{ kind: "photos" | "reel"; ids: number[] }> = [];
  if (photoIds.length) parts.push({ kind: "photos", ids: photoIds });
  if (hasVideo) parts.push({ kind: "reel", ids: videos });
  const what = (part: { kind: string; ids: number[] }) =>
    part.kind === "reel" ? "reel" : part.ids.length > 1 ? `${part.ids.length} photos in one post` : "photo";

  if (wantIg) {
    if (!igUser || !igToken) messages.push("Instagram: automatic posting is not set up yet.");
    else for (const part of parts) {
      try {
        const out = part.kind === "reel" || part.ids.length === 1
          ? await publishToInstagram({ kind: part.kind === "reel" ? "VIDEO" : "IMAGE", url: igUrl(part.ids[0]), caption: text, userId: igUser, token: igToken })
          : await publishCarouselToInstagram({ urls: part.ids.map(igUrl), caption: text, userId: igUser, token: igToken });
        messages.push(`Instagram: posted (${what(part)}).`);
        anyOk = true;
        await log("INSTAGRAM", true, out.instagramMediaId, null, part.ids);
      } catch (error) {
        const reason = error instanceof InstagramError ? error.message : "Could not reach Instagram.";
        messages.push(`Instagram (${what(part)}): not posted. ${reason}`);
        await log("INSTAGRAM", false, null, reason, part.ids);
      }
    }
  }

  if (wantFb) {
    if (!fbPage || !fbToken) messages.push("Facebook: automatic posting is not set up yet.");
    else for (const part of parts) {
      try {
        const out = await publishToFacebook({
          pageId: fbPage, token: fbToken, caption: text,
          ...(part.kind === "reel" ? { videoUrl: url(part.ids[0]) } : { photoUrls: part.ids.map(url) }),
        });
        messages.push(part.kind === "reel" && out.asReel === false
          ? "Facebook: posted as a video (Facebook would not take it as a reel: it needs an upright 9:16 video of 3 to 90 seconds)."
          : `Facebook: posted (${what(part)}).`);
        anyOk = true;
        await log("FACEBOOK", true, out.facebookPostId, null, part.ids);
      } catch (error) {
        const reason = error instanceof FacebookError ? error.message : "Could not reach Facebook.";
        messages.push(`Facebook (${what(part)}): not posted. ${reason}`);
        await log("FACEBOOK", false, null, reason, part.ids);
      }
    }
  }

  revalidatePath("/accounting/catalogue/instagram");
  return { ok: anyOk, messages };
}
