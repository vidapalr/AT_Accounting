import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Owner only: a compressed copy of uploaded documents and product photos/videos (the database backup does not hold these). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (user.role !== "GROUP_OWNER") return new Response("Not allowed.", { status: 403 });

  const root = process.cwd();
  const folders = [path.join(root, "private_uploads")];
  if (process.env.MEDIA_DIR) folders.push(path.resolve(process.env.MEDIA_DIR));
  const present = folders.filter((f) => existsSync(f));
  if (present.length === 0) return new Response("There are no uploaded files to back up yet.", { status: 404 });

  const tar = spawn("tar", ["-czf", "-", ...present.map((f) => `-C${path.dirname(f)}`).flatMap((c, i) => [c, path.basename(present[i])])], { stdio: ["ignore", "pipe", "pipe"] });
  const failed = new Promise<boolean>((resolve) => { tar.on("error", () => resolve(true)); });
  const first = await Promise.race([failed, new Promise<boolean>((r) => setTimeout(() => r(false), 300))]);
  if (first) return new Response("This server cannot make a file backup. Download the files from Hostinger File Manager instead.", { status: 501 });

  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'FILES_BACKUP_DOWNLOADED', 'BACKUP', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify({ folders: present.map((f) => path.basename(f)) })]
  ).catch(() => undefined);

  const stamp = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  return new Response(Readable.toWeb(tar.stdout) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="abhiram-files-${stamp}.tar.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
