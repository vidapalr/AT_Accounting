import { createGzip } from "node:zlib";
import { Readable } from "node:stream";

import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dumpSql } from "@/lib/backup-dump";

/** Owner only: a full copy of the accounting data as a compressed SQL file. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (user.role !== "GROUP_OWNER") return new Response("Not allowed.", { status: 403 });

  const stamp = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  const source = Readable.from(
    dumpSql(db, async (summary) => {
      await db.execute(
        `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'BACKUP_DOWNLOADED', 'BACKUP', 0, ?)`,
        [user.legal_business_id, user.id, JSON.stringify(summary)]
      );
    }),
    { objectMode: false, encoding: "utf8" }
  );
  const gzip = source.pipe(createGzip());
  source.on("error", (e) => {
    console.error("Backup failed:", e);
    gzip.destroy(e);
  });

  return new Response(Readable.toWeb(gzip) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="abhiram-backup-${stamp}.sql.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
