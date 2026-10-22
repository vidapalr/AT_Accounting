
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const ROOT = path.join(
  process.cwd(),
  "private_uploads",
  "agreement_documents"
);

const MAX_SIZE = 10 * 1024 * 1024;

const allowedTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function read(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isId(value: string) {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function validSignature(
  buffer: Buffer,
  extension: string
) {
  if (extension === ".pdf") {
    return buffer.subarray(0, 5).toString() === "%PDF-";
  }

  if (extension === ".png") {
    return buffer.subarray(0, 8).toString("hex") ===
      "89504e470d0a1a0a";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return buffer.subarray(0, 3).toString("hex") ===
      "ffd8ff";
  }

  if (extension === ".webp") {
    return (
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
    );
  }

  if (extension === ".docx") {
    return buffer.subarray(0, 4).toString("hex") ===
      "504b0304";
  }

  return false;
}

export async function uploadAgreementDocumentAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const agreementText = read(form, "agreement_id");
  const versionText = read(form, "agreement_version_id");
  const role = read(form, "agreement_document_role");

  if (!isId(agreementText) || !isId(versionText)) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(agreementText);
  const versionId = Number(versionText);
  const back = `/funding/agreements/${agreementId}`;

  if (
    !["DRAFT", "SIGNED", "SUPPORTING", "AMENDMENT"].includes(role)
  ) {
    redirect(`${back}?document=invalid`);
  }

  const incoming = form.get("document");

  if (!(incoming instanceof File)) {
    redirect(`${back}?document=missing-file`);
  }

  const filename = incoming.name.trim();
  const extension = path.extname(filename).toLowerCase();
  const expectedMime = allowedTypes[extension];

  if (
    filename.length < 3 ||
    filename.length > 200 ||
    !expectedMime ||
    incoming.type !== expectedMime ||
    incoming.size <= 0 ||
    incoming.size > MAX_SIZE
  ) {
    redirect(`${back}?document=invalid-file`);
  }

  const buffer = Buffer.from(
    await incoming.arrayBuffer()
  );

  if (!validSignature(buffer, extension)) {
    redirect(`${back}?document=invalid-file`);
  }

  const hash = createHash("sha256")
    .update(buffer)
    .digest("hex");

  const storageName = `${randomUUID()}${extension}`;
  const storageKey =
    `agreement_documents/${storageName}`;
  const fullPath = path.join(ROOT, storageName);

  const connection = await db.getConnection();
  let result = "failed";
  let fileWritten = false;

  try {
    await connection.beginTransaction();

    const [agreements] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id, division_id
         FROM acct_funding_agreements
         WHERE id = ?
           AND legal_business_id = ?
         FOR UPDATE`,
        [agreementId, businessId]
      );

    const agreement = agreements[0];

    if (!agreement) {
      result = "not-found";
    } else {
      const [versions] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_agreement_versions
           WHERE id = ?
             AND agreement_id = ?
             AND legal_business_id = ?
           LIMIT 1`,
          [versionId, agreementId, businessId]
        );

      if (!versions.length) {
        result = "invalid-version";
      } else {
        await mkdir(ROOT, { recursive: true });

        await writeFile(fullPath, buffer, {
          flag: "wx",
          mode: 0o600,
        });

        fileWritten = true;

        const [inserted] =
          await connection.execute<ResultSetHeader>(
            `INSERT INTO acct_business_documents
             (
               legal_business_id,
               division_id,
               document_type,
               document_name,
               storage_key,
               mime_type,
               file_size,
               uploaded_by,
               funding_agreement_id,
               agreement_version_id,
               agreement_document_role,
               document_sha256,
               status
             )
             VALUES (
               ?, ?, 'AGREEMENT', ?, ?, ?, ?, ?,
               ?, ?, ?, ?, 'ACTIVE'
             )`,
            [
              businessId,
              agreement.division_id,
              filename,
              storageKey,
              expectedMime,
              buffer.length,
              user.id,
              agreementId,
              versionId,
              role,
              hash,
            ]
          );

        await connection.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId,
            user.id,
            "AGREEMENT_DOCUMENT_UPLOADED",
            "FUNDING_AGREEMENT",
            agreementId,
            JSON.stringify({
              document_id: inserted.insertId,
              version_id: versionId,
              role,
              sha256: hash,
            }),
          ]
        );

        await connection.commit();
        result = "uploaded";
      }
    }

    if (result !== "uploaded") {
      await connection.rollback();
    }
  } catch (error) {
    try {
      await connection.rollback();
    } catch {}

    console.error(
      "Agreement document upload failed:",
      error
    );

    result = "failed";
  } finally {
    connection.release();
  }

  if (result !== "uploaded" && fileWritten) {
    await unlink(fullPath).catch(() => {});
  }

  if (result === "uploaded") {
    revalidatePath(back);
  }

  redirect(`${back}?document=${result}`);
}
