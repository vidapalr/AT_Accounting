
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBusinessDocumentById } from "@/lib/business-documents";
import { readPrivateDocument } from "@/lib/document-storage";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const user = await getCurrentUser();

  if (!user || user.role !== "GROUP_OWNER") {
    return new NextResponse("Unauthorized", {
      status: 401,
    });
  }

  const { id } = await context.params;

  if (!/^[1-9]\d*$/.test(id)) {
    return new NextResponse("Not Found", {
      status: 404,
    });
  }

  const documentId = Number(id);

  if (!Number.isSafeInteger(documentId)) {
    return new NextResponse("Not Found", {
      status: 404,
    });
  }

  const document = await getBusinessDocumentById(
    user.legal_business_id,
    documentId
  );

  if (!document) {
    return new NextResponse("Not Found", {
      status: 404,
    });
  }

  try {
    const buffer = await readPrivateDocument(
      document.storage_key
    );

    const safeName =
      document.document_name
        .replace(/["\\\r\n]/g, "_")
        .replace(/[^\x20-\x7E]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": document.mime_type,
        "Content-Disposition":
          `attachment; filename="${safeName}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    console.error("Document download failed:", error);

    return new NextResponse(
      "Document temporarily unavailable",
      { status: 503 }
    );
  }
}
