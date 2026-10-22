
import { requireGroupOwner } from "@/lib/auth";
import { db } from "@/lib/db";

import {
  convertWordToSafeHtml,
  detectPreviewType,
  readPrivateDocument,
  wordPreviewHtml,
} from "@/lib/document-preview";

import type { RowDataPacket } from "mysql2";

type Props = {
  params: Promise<{ id: string }>;
};

interface DocumentRow extends RowDataPacket {
  id: number;
  document_name: string;
  storage_key: string;
  mime_type: string;
  status: string;
}

export async function GET(
  request: Request,
  { params }: Props
) {
  const user = await requireGroupOwner();
  const { id } = await params;

  if (!/^[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id))) {
    return Response.json(
      { error: "Invalid document ID" },
      { status: 400 }
    );
  }

  const [rows] = await db.execute<DocumentRow[]>(
    `SELECT
       id,
       document_name,
       storage_key,
       mime_type,
       status
     FROM acct_business_documents
     WHERE id = ?
       AND legal_business_id = ?
       AND status = 'ACTIVE'
     LIMIT 1`,
    [Number(id), user.legal_business_id]
  );

  const document = rows[0];

  if (!document) {
    return Response.json(
      { error: "Document not found" },
      { status: 404 }
    );
  }

  const previewType = detectPreviewType(
    document.document_name,
    document.mime_type
  );

  if (previewType === "UNSUPPORTED") {
    return Response.json(
      {
        error:
          "This file format cannot be previewed in the browser.",
      },
      { status: 415 }
    );
  }

  let file: Buffer;

  try {
    file = await readPrivateDocument(
      document.storage_key
    );
  } catch (error) {
    console.error(
      "Document preview file unavailable:",
      error
    );

    return Response.json(
      { error: "Document file unavailable" },
      { status: 404 }
    );
  }

  const sharedHeaders = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; " +
      "img-src data:; " +
      "style-src 'unsafe-inline'; " +
      "frame-ancestors 'self'; " +
      "base-uri 'none'; " +
      "form-action 'none'",
    "X-Frame-Options": "SAMEORIGIN",
  };

  if (previewType === "PDF") {
    if (file.subarray(0, 5).toString() !== "%PDF-") {
      return Response.json(
        { error: "Invalid PDF file" },
        { status: 415 }
      );
    }

    return new Response(new Uint8Array(file), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self' blob:; " +
          "object-src 'self' blob:; " +
          "frame-src 'self' blob:; " +
          "frame-ancestors 'self'",
        "X-Frame-Options": "SAMEORIGIN",
        "Accept-Ranges": "none",
      },
    });
  }

  if (previewType === "IMAGE") {
    // Validate the actual bytes instead of trusting
    // the stored MIME type alone.
    const hex = file.subarray(0, 12).toString("hex");

    const isPng = hex.startsWith("89504e470d0a1a0a");
    const isJpeg = hex.startsWith("ffd8ff");
    const isWebp =
      file.subarray(0, 4).toString() === "RIFF" &&
      file.subarray(8, 12).toString() === "WEBP";

    const valid =
      (document.mime_type === "image/png" && isPng) ||
      (document.mime_type === "image/jpeg" && isJpeg) ||
      (document.mime_type === "image/webp" && isWebp);

    if (!valid) {
      return Response.json(
        { error: "Invalid image file" },
        { status: 415 }
      );
    }

    return new Response(new Uint8Array(file), {
      headers: {
        ...sharedHeaders,
        "Content-Type": document.mime_type,
        "Content-Disposition": "inline",
      },
    });
  }

  try {
    const safeContent = await convertWordToSafeHtml(file);

    return new Response(
      wordPreviewHtml(
        document.document_name,
        safeContent
      ),
      {
        headers: {
          ...sharedHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": "inline",
        },
      }
    );
  } catch (error) {
    console.error("Word preview failed:", error);

    return Response.json(
      { error: "Unable to preview Word document" },
      { status: 422 }
    );
  }
}
