import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Where product photos and videos live. Set MEDIA_DIR on the hosting service to
 * a folder OUTSIDE the app folder, so a redeploy from git never deletes them.
 */
export const MEDIA_DIR =
  process.env.MEDIA_DIR || path.join(process.cwd(), "private_uploads", "media");

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

export type DetectedMedia = {
  type: "IMAGE" | "VIDEO";
  mime: string;
  ext: string;
};

/** Decide what a file really is from its first bytes, never from its name. */
export function detectMedia(b: Buffer): DetectedMedia | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { type: "IMAGE", mime: "image/jpeg", ext: "jpg" };
  }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return { type: "IMAGE", mime: "image/png", ext: "png" };
  }
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString("ascii") === "RIFF" &&
    b.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { type: "IMAGE", mime: "image/webp", ext: "webp" };
  }
  if (b.length >= 12 && b.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = b.subarray(8, 12).toString("ascii");
    if (brand === "qt  ") return { type: "VIDEO", mime: "video/quicktime", ext: "mov" };
    return { type: "VIDEO", mime: "video/mp4", ext: "mp4" };
  }
  if (b.length >= 4 && b.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"))) {
    return { type: "VIDEO", mime: "video/webm", ext: "webm" };
  }
  return null;
}

export async function saveMedia(buffer: Buffer, ext: string): Promise<string> {
  await mkdir(MEDIA_DIR, { recursive: true, mode: 0o700 });
  const key = `${randomUUID()}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, key), buffer, { flag: "wx", mode: 0o600 });
  return key;
}

function safePath(key: string): string | null {
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|mp4|mov|webm)$/.test(key)) return null;
  return path.join(MEDIA_DIR, key);
}

export async function mediaSize(key: string): Promise<number | null> {
  const full = safePath(key);
  if (!full) return null;
  try {
    return (await stat(full)).size;
  } catch {
    return null;
  }
}

export async function readMediaRange(key: string, start?: number, end?: number): Promise<Buffer | null> {
  const full = safePath(key);
  if (!full) return null;
  try {
    const data = await readFile(full);
    return start === undefined ? data : data.subarray(start, (end ?? data.length - 1) + 1);
  } catch {
    return null;
  }
}

export async function deleteMedia(key: string): Promise<void> {
  const full = safePath(key);
  if (!full) return;
  try {
    await unlink(full);
  } catch {
    // Already gone.
  }
}
