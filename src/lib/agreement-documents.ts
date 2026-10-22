
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export interface AgreementDocument extends RowDataPacket {
  id: number;
  document_name: string;
  document_type: string;
  mime_type: string;
  file_size: number;
  status: "ACTIVE" | "ARCHIVED";
  agreement_document_role:
    | "DRAFT"
    | "SIGNED"
    | "SUPPORTING"
    | "AMENDMENT";
  version_no: number;
  document_sha256: string | null;
  created_at: string;
}

export async function getAgreementDocuments(
  businessId: number,
  agreementId: number
): Promise<AgreementDocument[]> {
  const [rows] = await db.execute<AgreementDocument[]>(
    `SELECT
       d.id,
       d.document_name,
       d.document_type,
       d.mime_type,
       d.file_size,
       d.status,
       d.agreement_document_role,
       v.version_no,
       d.document_sha256,
       DATE_FORMAT(
         d.created_at,
         '%Y-%m-%d %H:%i'
       ) AS created_at
     FROM acct_business_documents d
     JOIN acct_agreement_versions v
       ON v.id = d.agreement_version_id
      AND v.agreement_id = d.funding_agreement_id
      AND v.legal_business_id = d.legal_business_id
     WHERE d.legal_business_id = ?
       AND d.funding_agreement_id = ?
     ORDER BY v.version_no DESC, d.id DESC`,
    [businessId, agreementId]
  );

  return rows;
}
