import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { MEDIA_DIR, readMediaRange } from "@/lib/media-storage";
import { igCanvas } from "@/lib/instagram-photo-math";

/**
 * A copy of a product photo that Instagram accepts: JPG, turned the right way up, at most 1440 px wide, with
 * white bars when the photo is taller than 4:5 or wider than 1.91:1. Made once and kept beside the photos.
 * Returns null when the photo cannot be converted (the original is then used).
 */
export async function instagramJpeg(storageKey: string): Promise<Buffer | null> {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(storageKey)) return null;
  const cached = path.join(MEDIA_DIR, "instagram", `${storageKey.slice(0, 36)}.jpg`);
  try {
    return await readFile(cached);
  } catch { /* not made yet */ }
  const original = await readMediaRange(storageKey);
  if (!original) return null;
  try {
    const sharp = (await import("sharp")).default;
    const turned = await sharp(original).rotate().toBuffer({ resolveWithObject: true });
    const c = igCanvas(turned.info.width, turned.info.height);
    const out = await sharp(turned.data)
      .resize(c.scaledWidth, c.scaledHeight)
      .extend({
        top: Math.floor((c.height - c.scaledHeight) / 2), bottom: Math.ceil((c.height - c.scaledHeight) / 2),
        left: Math.floor((c.width - c.scaledWidth) / 2), right: Math.ceil((c.width - c.scaledWidth) / 2),
        background: "#ffffff",
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    await mkdir(path.dirname(cached), { recursive: true, mode: 0o700 });
    await writeFile(cached, out, { mode: 0o600 }).catch(() => {});
    return out;
  } catch (error) {
    console.error("Instagram photo copy failed:", error);
    return null;
  }
}
