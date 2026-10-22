
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

interface DocumentRow extends RowDataPacket {
  id: number;
  status: "ACTIVE" | "ARCHIVED";
  document_type: string;
}

export async function archiveDocumentAction(
  form: FormData
) {
  const user = await requireGroupOwner();

  const idValue = form.get("document_id");
  const idText =
    typeof idValue === "string" ? idValue : "";

  const documentId = Number(idText);

  const reasonValue = form.get("archive_reason");
  const reason =
    typeof reasonValue === "string"
      ? reasonValue.trim()
      : "";

  if (
    !/^[1-9]\d*$/.test(idText) ||
    !Number.isSafeInteger(documentId) ||
    reason.length < 5 ||
    reason.length > 500
  ) {
    redirect("/group?document=archive-invalid");
  }

  const connection = await db.getConnection();

  let outcome = "archive-failed";

  try {
    await connection.beginTransaction();

    const [rows] =
      await connection.execute<DocumentRow[]>(
        `SELECT id, status, document_type
         FROM acct_business_documents
         WHERE id = ?
           AND legal_business_id = ?
         FOR UPDATE`,
        [documentId, user.legal_business_id]
      );

    const document = rows[0];

    if (!document) {
      await connection.rollback();
      outcome = "archive-not-found";
    } else if (document.status === "ARCHIVED") {
      await connection.rollback();
      outcome = "archive-already-archived";
    } else {
      await connection.execute(
        `UPDATE acct_business_documents
         SET status = 'ARCHIVED',
             archived_at = UTC_TIMESTAMP(),
             archived_by = ?,
             archive_reason = ?
         WHERE id = ?
           AND legal_business_id = ?`,
        [
          user.id,
          reason,
          documentId,
          user.legal_business_id,
        ]
      );

      await connection.execute(
        `INSERT INTO acct_audit_events
         (legal_business_id, actor_user_id,
          action, subject_type, subject_id, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id,
          user.id,
          "DOCUMENT_ARCHIVED",
          "BUSINESS_DOCUMENT",
          documentId,
          JSON.stringify({
            document_type: document.document_type,
            reason,
          }),
        ]
      );

      await connection.commit();
      outcome = "archived";
    }
  } catch (error) {
    await connection.rollback();
    console.error("Document archival failed:", error);
  } finally {
    connection.release();
  }

  if (outcome === "archived") {
    revalidatePath("/group");
  }

  redirect(`/group?document=${outcome}`);
}
