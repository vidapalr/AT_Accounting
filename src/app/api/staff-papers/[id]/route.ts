import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { readStaffFile } from "@/lib/document-storage";

/** Shows one paper from a person's folder. Only staff who may see salaries can open it. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canAccess(user.role, "salary")) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await context.params;
  if (!/^[1-9]\d{0,17}$/.test(id)) return new NextResponse("Not Found", { status: 404 });

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT storage_key, mime_type, kind FROM acct_employee_documents
      WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id, Number(id)]
  ).catch(() => [[] as RowDataPacket[]]);
  if (rows.length !== 1) return new NextResponse("Not Found", { status: 404 });

  try {
    const file = await readStaffFile(String(rows[0].storage_key));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "content-type": String(rows[0].mime_type),
        "content-disposition": `inline; filename="${String(rows[0].kind).toLowerCase()}.${String(rows[0].mime_type).includes("pdf") ? "pdf" : String(rows[0].mime_type).includes("png") ? "png" : "jpg"}"`,
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; img-src 'self'; object-src 'none'; sandbox",
      },
    });
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
}
