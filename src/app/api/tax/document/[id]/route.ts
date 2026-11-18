import type { RowDataPacket } from "mysql2";

import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { readPrivateDocument } from "@/lib/document-storage";

/** Open a kept tax paper (only for the company it belongs to). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canAccess(user.role, "tax")) return new Response("Not allowed.", { status: 403 });
  const { id } = await context.params;
  if (!/^[1-9]\d{0,15}$/.test(id)) return new Response("Not found.", { status: 404 });
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT title, storage_key, mime_type FROM acct_tax_documents WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id, Number(id)]
  );
  const doc = rows[0];
  if (!doc) return new Response("Not found.", { status: 404 });
  const buffer = await readPrivateDocument(String(doc.storage_key));
  const ext = String(doc.storage_key).split(".").pop();
  const name = `${String(doc.title).replace(/[^A-Za-z0-9 ._-]+/g, "_").slice(0, 80)}.${ext}`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": String(doc.mime_type),
      "Content-Disposition": `inline; filename="${name}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
