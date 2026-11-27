import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { shopBusinessId } from "@/lib/shop";
import { mediaSize, readMediaRange } from "@/lib/media-storage";
import { instagramJpeg } from "@/lib/instagram-photo";

/** Public: photos and videos of products the owner switched on for the online shop. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return new NextResponse("Not found", { status: 404 });

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT m.storage_key, m.mime_type FROM acct_product_media m
       JOIN acct_products p ON p.id = m.product_id AND p.legal_business_id = m.legal_business_id
      WHERE m.legal_business_id = ? AND m.id = ? AND m.status = 'ACTIVE'
        AND p.status = 'ACTIVE' AND p.show_in_shop = 1`,
    [(await shopBusinessId()), Number(id)]
  );
  const media = rows[0];
  if (!media) return new NextResponse("Not found", { status: 404 });

  // ?for=instagram: a JPG copy in a shape Instagram accepts (made once, then kept).
  if (request.nextUrl.searchParams.get("for") === "instagram" && String(media.mime_type).startsWith("image/")) {
    const jpg = await instagramJpeg(String(media.storage_key));
    if (jpg) {
      return new NextResponse(new Uint8Array(jpg), {
        status: 200,
        headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpg.length), "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" },
      });
    }
  }

  const size = await mediaSize(String(media.storage_key));
  if (size === null) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": String(media.mime_type),
    "Cache-Control": "public, max-age=3600",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const part = await readMediaRange(String(media.storage_key), start, end);
    if (!part) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(part), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(part.length) },
    });
  }

  const all = await readMediaRange(String(media.storage_key));
  if (!all) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(all), { status: 200, headers: { ...headers, "Content-Length": String(all.length) } });
}
