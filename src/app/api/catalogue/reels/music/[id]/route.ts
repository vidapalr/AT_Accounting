import { NextRequest, NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { readMediaRange } from "@/lib/media-storage";

/** Plays an uploaded track (signed-in staff only). */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !canAccess(user.role, "products")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT storage_key, mime_type FROM acct_reel_tracks WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id, Number(id)]);
  if (!rows[0]) return new NextResponse("Not found", { status: 404 });
  const data = await readMediaRange(String(rows[0].storage_key));
  if (!data) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: { "Content-Type": String(rows[0].mime_type), "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
