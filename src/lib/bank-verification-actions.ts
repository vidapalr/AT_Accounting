
"use server";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  getBankResultQueryKey,
  getBankReturnPath,
} from "@/lib/bank-action-navigation";

const PAGE = "/accounting/bank-accounts";
const ROOT = path.resolve(
  process.cwd(),
  "private_uploads",
  "bank_evidence"
);
const MAX_FILE = 8 * 1024 * 1024;

const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function id(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function matchesType(buffer: Buffer, mime: string): boolean {
  const signature = buffer.subarray(0, 12).toString("hex");
  if (mime === "application/pdf")
    return buffer.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/png")
    return signature.startsWith("89504e470d0a1a0a");
  if (mime === "image/jpeg")
    return signature.startsWith("ffd8ff");
  if (mime === "image/webp")
    return buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP";
  return false;
}

export async function uploadBankEvidenceAction(form: FormData) {
  const user = await requireGroupOwner();
  const back = getBankReturnPath(form);
  const resultKey = getBankResultQueryKey(back);
  const bankId = id(text(form, "bank_account_id"));
  const upload = form.get("file");

  if (bankId === null ||
      !(upload instanceof File) ||
      upload.size < 1 ||
      upload.size > MAX_FILE) {
    redirect(`${back}?${resultKey}=invalid`);
  }

  const name = path.basename(upload.name);
  const ext = path.extname(name).toLowerCase();
  const mime = mimeByExtension[ext];

  if (!mime || mime !== upload.type || name.length > 200) {
    redirect(`${back}?${resultKey}=invalid`);
  }

  const buffer = Buffer.from(await upload.arrayBuffer());

  if (!matchesType(buffer, mime)) {
    redirect(`${back}?${resultKey}=invalid`);
  }

  const hash = createHash("sha256")
    .update(buffer).digest("hex");
  const filename = `${randomUUID()}${ext}`;
  const storageKey = `bank_evidence/${filename}`;
  const filepath = path.join(ROOT, filename);

  const conn = await db.getConnection();
  let result = "failed";
  let written = false;

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [user.legal_business_id]
    );

    const [bank] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_bank_accounts
       WHERE id = ? AND legal_business_id = ?
       AND status = 'ACTIVE' FOR UPDATE`,
      [bankId, user.legal_business_id]
    );

    if (!business.length || !bank.length) {
      result = "not-found";
    } else {
      await mkdir(ROOT, { recursive: true });
      await writeFile(filepath, buffer, {
        flag: "wx",
        mode: 0o600,
      });
      written = true;

      const [inserted] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_bank_evidence
          (legal_business_id, bank_account_id,
           original_filename, storage_key,
           mime_type, file_size, sha256, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id, bankId, name,
          storageKey, mime, buffer.length, hash, user.id,
        ]
      );

      await conn.execute(
        `INSERT INTO acct_audit_events
          (legal_business_id, actor_user_id, action,
           subject_type, subject_id, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id, user.id,
          "BANK_EVIDENCE_UPLOADED", "BANK_ACCOUNT", bankId,
          JSON.stringify({
            evidence_id: inserted.insertId,
            sha256: hash,
          }),
        ]
      );

      await conn.commit();
      result = "uploaded";
    }
    if (result !== "uploaded") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Bank evidence upload failed", error);
  } finally {
    conn.release();
  }

  if (written && result !== "uploaded") {
    await unlink(filepath).catch(() => {});
  }

  if (result === "uploaded") {
    revalidatePath(PAGE);
    if (back !== PAGE) revalidatePath(back);
  }
  redirect(`${back}?${resultKey}=${result}`);
}

export async function verifyBankAccountAction(form: FormData) {
  const user = await requireGroupOwner();
  const back = getBankReturnPath(form);
  const bankId = id(text(form, "bank_account_id"));
  const evidenceId = id(text(form, "evidence_id"));
  const decision = text(form, "decision");
  const notes = text(form, "verification_notes");

  if (!bankId || !evidenceId ||
      !["VERIFIED", "REJECTED"].includes(decision) ||
      notes.length < 10 || notes.length > 2000) {
    redirect(`${back}?verification=invalid`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    // Lock order consistent with financial modules.
    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [user.legal_business_id]
    );

    const [banks] = await conn.execute<RowDataPacket[]>(
      `SELECT id, ownership_type, funding_party_id,
              gl_account_id, account_number_fingerprint,
              verification_status
       FROM acct_bank_accounts
       WHERE id = ? AND legal_business_id = ?
         AND status = 'ACTIVE'
       FOR UPDATE`,
      [bankId, user.legal_business_id]
    );

    const bank = banks[0];

    if (!business.length || !bank) {
      result = "not-found";
    } else if (bank.verification_status === "VERIFIED") {
      result = "already-verified";
    } else if (
      bank.ownership_type === "BUSINESS" &&
      bank.gl_account_id === null
    ) {
      result = "gl-required";
    } else {
      const [documents] = await conn.execute<RowDataPacket[]>(
        `SELECT id, storage_key, sha256, mime_type
         FROM acct_bank_evidence
         WHERE id = ?
           AND bank_account_id = ?
           AND legal_business_id = ?
           AND status = 'ACTIVE'
         FOR UPDATE`,
        [evidenceId, bankId, user.legal_business_id]
      );

      const doc = documents[0];

      if (!doc) {
        result = "no-evidence";
      } else {
        const filePath = path.resolve(
          process.cwd(), "private_uploads", doc.storage_key
        );
        const root = path.resolve(
          process.cwd(), "private_uploads", "bank_evidence"
        );

        if (!filePath.startsWith(root + path.sep)) {
          throw new Error("Invalid evidence path");
        }

        const bytes = await readFile(filePath);
        const actualHash = createHash("sha256")
          .update(bytes).digest("hex");

        if (actualHash !== doc.sha256 ||
            !matchesType(bytes, doc.mime_type)) {
          result = "integrity-failed";
        } else {
          const [inserted] =
            await conn.execute<ResultSetHeader>(
              `INSERT INTO acct_bank_verifications
                (legal_business_id, bank_account_id,
                 evidence_document_id, evidence_sha256,
                 account_identity_fingerprint,
                 verification_result, verification_notes,
                 verified_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                user.legal_business_id, bankId, evidenceId,
                actualHash, bank.account_number_fingerprint,
                decision, notes, user.id,
              ]
            );

          await conn.execute(
            `UPDATE acct_bank_accounts
             SET verification_status = ?,
                 verification_id = ?,
                 verified_at = CASE
                   WHEN ? = 'VERIFIED'
                   THEN CURRENT_TIMESTAMP ELSE NULL END,
                 verified_by = CASE
                   WHEN ? = 'VERIFIED' THEN ? ELSE NULL END
             WHERE id = ? AND legal_business_id = ?`,
            [
              decision === "VERIFIED"
                ? "VERIFIED" : "UNVERIFIED",
              inserted.insertId,
              decision, decision, user.id,
              bankId, user.legal_business_id,
            ]
          );

          await conn.execute(
            `INSERT INTO acct_audit_events
              (legal_business_id, actor_user_id, action,
               subject_type, subject_id, details_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              user.legal_business_id, user.id,
              "BANK_ACCOUNT_VERIFICATION_REVIEWED",
              "BANK_ACCOUNT", bankId,
              JSON.stringify({
                verification_id: inserted.insertId,
                evidence_id: evidenceId,
                result: decision,
                sha256: actualHash,
              }),
            ]
          );

          await conn.commit();
          result = decision === "VERIFIED"
            ? "verified" : "rejected";
        }
      }
    }

    if (!["verified", "rejected"].includes(result)) {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Bank verification failed", error);
  } finally {
    conn.release();
  }

  if (["verified", "rejected"].includes(result)) {
    revalidatePath(PAGE);
    if (back !== PAGE) revalidatePath(back);
  }

  redirect(`${back}?verification=${result}`);
}
