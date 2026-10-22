
import "server-only";

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export const DOCUMENT_TYPES = [
  "GST_CERTIFICATE",
  "PAN_DOCUMENT",
  "UDYAM_CERTIFICATE",
  "REGISTRATION_CERTIFICATE",
  "AGREEMENT",
  "OTHER",
] as const;

export type DocumentType =
  (typeof DOCUMENT_TYPES)[number];

export interface BusinessDocument extends RowDataPacket {
  id: number;
  legal_business_id: number;
  division_id: number | null;
  document_type: DocumentType;
  document_name: string;
  storage_key: string;
  mime_type: string;
  file_size: number;
  division_name: string | null;
  uploaded_at: string;
  status: "ACTIVE" | "ARCHIVED";
  archived_at: string | null;
  archive_reason: string | null;
}

export async function getBusinessDocuments(
  businessId: number
): Promise<BusinessDocument[]> {
  const [rows] = await db.execute<BusinessDocument[]>(
    `SELECT
       d.id,
       d.legal_business_id,
       d.division_id,
       d.document_type,
       d.document_name,
       d.storage_key,
       d.mime_type,
       d.file_size,
       d.status,
       d.archive_reason,
       DATE_FORMAT(
            d.archived_at, '%Y-%m-%d %H:%i'
            ) AS archived_at,
       dv.name AS division_name,
       DATE_FORMAT(
         d.created_at, '%Y-%m-%d %H:%i'
       ) AS uploaded_at
     FROM acct_business_documents d
     LEFT JOIN acct_divisions dv
       ON dv.id = d.division_id
      AND dv.legal_business_id = d.legal_business_id
     WHERE d.legal_business_id = ?
     AND d.status = 'ACTIVE'
     ORDER BY d.created_at DESC, d.id DESC`,
    [businessId]
  );

  return rows;
}

export async function getArchivedBusinessDocuments(
  businessId: number
): Promise<BusinessDocument[]> {
  const [rows] = await db.execute<BusinessDocument[]>(
    `SELECT
       d.id,
       d.legal_business_id,
       d.division_id,
       d.document_type,
       d.document_name,
       d.storage_key,
       d.mime_type,
       d.file_size,
       d.status,
       d.archive_reason,
       DATE_FORMAT(
         d.archived_at, '%Y-%m-%d %H:%i'
       ) AS archived_at,
       dv.name AS division_name,
       DATE_FORMAT(
         d.created_at, '%Y-%m-%d %H:%i'
       ) AS uploaded_at
     FROM acct_business_documents d
     LEFT JOIN acct_divisions dv
       ON dv.id = d.division_id
      AND dv.legal_business_id = d.legal_business_id
     WHERE d.legal_business_id = ?
       AND d.status = 'ARCHIVED'
     ORDER BY d.archived_at DESC, d.id DESC`,
    [businessId]
  );

  return rows;
}

export async function getBusinessDocumentById(
  businessId: number,
  documentId: number
): Promise<BusinessDocument | null> {
  const [rows] = await db.execute<BusinessDocument[]>(
    `SELECT
       d.id,
       d.legal_business_id,
       d.division_id,
       d.document_type,
       d.document_name,
       d.storage_key,
       d.mime_type,
       d.file_size,
       dv.name AS division_name,
       DATE_FORMAT(
         d.created_at, '%Y-%m-%d %H:%i'
       ) AS uploaded_at
     FROM acct_business_documents d
     LEFT JOIN acct_divisions dv
       ON dv.id = d.division_id
      AND dv.legal_business_id = d.legal_business_id
     WHERE d.id = ?
       AND d.legal_business_id = ?
     LIMIT 1`,
    [documentId, businessId]
  );

  return rows[0] ?? null;
}
