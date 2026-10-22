
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type Props = {
  params: Promise<{ id: string }>;
};

interface Evidence extends RowDataPacket {
  storage_key: string;
  mime_type: string;
  sha256: string;
}

export async function GET(
  _request: Request,
  { params }: Props
) {
  const user = await requireGroupOwner();
  const { id } = await params;

  if (!/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id))) {
    return Response.json(
      { error: "Invalid evidence ID" },
      { status: 400 }
    );
  }

  const [rows] = await db.execute<Evidence[]>(
    `SELECT e.storage_key, e.mime_type, e.sha256
     FROM acct_bank_evidence e
     JOIN acct_bank_accounts b
       ON b.id = e.bank_account_id
      AND b.legal_business_id = e.legal_business_id
     WHERE e.id = ?
       AND e.legal_business_id = ?
       AND e.status = 'ACTIVE'
     LIMIT 1`,
    [Number(id), user.legal_business_id]
  );

  const evidence = rows[0];

  if (!evidence) {
    return Response.json(
      { error: "Evidence not found" },
      { status: 404 }
    );
  }

  const root = path.resolve(
    process.cwd(),
    "private_uploads",
    "bank_evidence"
  );

  const filepath = path.resolve(
    process.cwd(),
    "private_uploads",
    evidence.storage_key
  );

  if (!filepath.startsWith(root + path.sep)) {
    return Response.json(
      { error: "Invalid stored evidence path" },
      { status: 400 }
    );
  }

  let file: Buffer;
  try {
    file = await readFile(filepath);
  } catch {
    return Response.json(
      { error: "Evidence unavailable" },
      { status: 404 }
    );
  }

  const actualHash = createHash("sha256")
    .update(file).digest("hex");

  if (actualHash !== evidence.sha256) {
    return Response.json(
      { error: "Evidence integrity check failed" },
      { status: 409 }
    );
  }

  const mime = evidence.mime_type;
  const signature = file.subarray(0, 12);

  const valid =
    (mime === "application/pdf" &&
      file.subarray(0, 5).toString() === "%PDF-") ||
    (mime === "image/png" &&
      signature.toString("hex").startsWith(
        "89504e470d0a1a0a"
      )) ||
    (mime === "image/jpeg" &&
      signature.toString("hex").startsWith("ffd8ff")) ||
    (mime === "image/webp" &&
      signature.subarray(0, 4).toString() === "RIFF" &&
      signature.subarray(8, 12).toString() === "WEBP");

  if (!valid) {
    return Response.json(
      { error: "Invalid evidence file" },
      { status: 415 }
    );
  }

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self' blob:; " +
        "object-src 'self' blob:; " +
        "frame-src 'self' blob:; " +
        "frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
