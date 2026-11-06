import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { seeOther } from "@/lib/redirect";
import { detectAudio, saveMedia, deleteMedia, MAX_AUDIO_BYTES } from "@/lib/media-storage";

const BACK = "/accounting/catalogue/reels/music";

/** Owner or staff with catalogue access adds a licence-free song for reels. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !canAccess(user.role, "products")) return new NextResponse("Unauthorized", { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim().slice(0, 120);
  if (!(file instanceof File) || file.size === 0 || !name) return seeOther(`${BACK}?error=missing`);
  if (form.get("licence") !== "1") return seeOther(`${BACK}?error=licence`);

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = detectAudio(buffer);
  if (!kind) return seeOther(`${BACK}?error=type`);
  if (buffer.length > MAX_AUDIO_BYTES) return seeOther(`${BACK}?error=size`);

  const key = await saveMedia(buffer, kind.ext);
  try {
    await db.execute(
      `INSERT INTO acct_reel_tracks (legal_business_id, track_name, storage_key, mime_type, size_bytes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, name, key, kind.mime, buffer.length, user.id]);
  } catch (error) {
    console.error("Track save failed:", error);
    await deleteMedia(key);
    return seeOther(`${BACK}?error=save`);
  }
  return seeOther(`${BACK}?saved=1`);
}
