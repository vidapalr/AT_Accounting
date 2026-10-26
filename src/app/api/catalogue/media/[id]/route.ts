import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { mediaSize, readMediaRange } from "@/lib/media-storage";


/** Show a photo or play a video. Signed-in staff only; supports seeking in videos. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role === "INVESTOR") return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return new NextResponse("Not found", { status: 404 });

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT storage_key, mime_type FROM acct_product_media
      WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id, Number(id)]
  );
  const media = rows[0];
  if (!media) return new NextResponse("Not found", { status: 404 });

  const size = await mediaSize(String(media.storage_key));
  if (size === null) return new NextResponse("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": String(media.mime_type),
    "Cache-Control": "private, max-age=86400",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };

  if (request.nextUrl.searchParams.get("download") === "1") {
    const ext = String(media.mime_type).split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "bin";
    headers["Content-Disposition"] = `attachment; filename="abhiram-${id}.${ext}"`;
  }

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
