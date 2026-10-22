
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DOCUMENT_TYPES } from "@/lib/business-documents";
import {
  detectDocumentType,
  MAX_DOCUMENT_SIZE,
  savePrivateDocument,
  deletePrivateDocument,
} from "@/lib/document-storage";

function goBack(
  request: NextRequest,
  status: string
) {
  return NextResponse.redirect(
    new URL(`/group?document=${status}`, request.url),
    303
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user || user.role !== "GROUP_OWNER") {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  if (
    request.headers.get("origin") !==
    request.nextUrl.origin
  ) {
    return new NextResponse("Forbidden", {
      status: 403,
    });
  }

  const contentLength = Number(
    request.headers.get("content-length") || 0
  );

  if (
    contentLength > MAX_DOCUMENT_SIZE + 100_000
  ) {
    return goBack(request, "too-large");
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return goBack(request, "invalid");
  }

  const file = form.get("document");

  if (!(file instanceof File)) {
    return goBack(request, "invalid");
  }

  if (
    file.size === 0 ||
    file.size > MAX_DOCUMENT_SIZE
  ) {
    return goBack(request, "too-large");
  }

  const typeText = form.get("document_type");
  const documentType =
    typeof typeText === "string" ? typeText : "";

  if (
    !DOCUMENT_TYPES.includes(
      documentType as (typeof DOCUMENT_TYPES)[number]
    )
  ) {
    return goBack(request, "invalid");
  }

  const divisionValue = form.get("division_id");
  const divisionText =
    typeof divisionValue === "string"
      ? divisionValue
      : "";

  const divisionId = divisionText
    ? Number(divisionText)
    : null;

  if (
    divisionId !== null &&
    (!Number.isSafeInteger(divisionId) ||
      divisionId <= 0)
  ) {
    return goBack(request, "invalid");
  }

  const originalName = file.name.trim();

  if (
    !originalName ||
    originalName.length > 255 ||
    /[\x00-\x1f\x7f]/.test(originalName)
  ) {
    return goBack(request, "invalid");
  }

  const buffer = Buffer.from(
    await file.arrayBuffer()
  );

  const detectedMime = detectDocumentType(buffer);

  if (!detectedMime) {
    return goBack(request, "invalid-type");
  }

  // Restrict accepted extensions as well as file signatures.
  const extension = originalName
    .split(".")
    .pop()
    ?.toLowerCase();

  const validExtension =
    (detectedMime === "application/pdf" &&
      extension === "pdf") ||
    (detectedMime === "image/jpeg" &&
      ["jpg", "jpeg"].includes(extension || "")) ||
    (detectedMime === "image/png" &&
      extension === "png");

  if (!validExtension) {
    return goBack(request, "invalid-type");
  }

  let storageKey: string | null = null;
  let committed = false;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    if (divisionId !== null) {
      const [divisions] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_divisions
           WHERE id = ?
             AND legal_business_id = ?
             AND status = 'ACTIVE'`,
          [divisionId, user.legal_business_id]
        );

      if (divisions.length !== 1) {
        await connection.rollback();
        return goBack(request, "invalid-division");
      }
    }

    storageKey = await savePrivateDocument(
      buffer,
      detectedMime
    );

    const [result] =
      await connection.execute<ResultSetHeader>(
        `INSERT INTO acct_business_documents
         (legal_business_id, division_id, person_id,
          document_type, document_name, storage_key,
          mime_type, file_size, uploaded_by)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
          user.legal_business_id,
          divisionId,
          documentType,
          originalName,
          storageKey,
          detectedMime,
          file.size,
          user.id,
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
        "DOCUMENT_UPLOADED",
        "BUSINESS_DOCUMENT",
        result.insertId,
        JSON.stringify({
          document_type: documentType,
          division_id: divisionId,
          file_size: file.size,
        }),
      ]
    );

    await connection.commit();
    committed = true;

    return goBack(request, "uploaded");
  } catch (error) {
    console.error("Document upload failed:", error);

    if (!committed) {
      try {
        await connection.rollback();
      } catch {
        // Original error is already logged.
      }

      if (storageKey) {
        try {
          await deletePrivateDocument(storageKey);
        } catch (cleanupError) {
          console.error(
            "Document file cleanup failed:",
            cleanupError
          );
        }
      }
    }

    return goBack(request, "failed");
  } finally {
    connection.release();
  }
}
