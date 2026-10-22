
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export interface PendingAmendment extends RowDataPacket {
  amendment_id: number;
  agreement_id: number;
  from_version_id: number;
  to_version_id: number;
  previous_version_no: number;
  proposed_version_no: number;
  previous_share: string;
  proposed_share: string;
  effective_from: string;
  amendment_reason: string;
  signed_document_id: number | null;
  signed_document_name: string | null;
  reviewed_document_id: number | null;
  document_verified: number | null;
  investor_consent_verified: number | null;
  reviewed_at: string | null;
}

export async function getPendingAmendment(
  businessId: number,
  agreementId: number
): Promise<PendingAmendment | null> {
  const [rows] = await db.execute<PendingAmendment[]>(
    `SELECT
       am.id AS amendment_id,
       am.agreement_id,
       am.from_version_id,
       am.to_version_id,

       oldv.version_no AS previous_version_no,
       newv.version_no AS proposed_version_no,

       JSON_UNQUOTE(
         JSON_EXTRACT(
           oldv.terms_json,
           '$.profit_share_percentage'
         )
       ) AS previous_share,

       JSON_UNQUOTE(
         JSON_EXTRACT(
           newv.terms_json,
           '$.profit_share_percentage'
         )
       ) AS proposed_share,

       DATE_FORMAT(
         newv.effective_from,
         '%Y-%m-%d'
       ) AS effective_from,

       am.amendment_reason,

       docs.id AS signed_document_id,
       docs.document_name AS signed_document_name,

       rev.signed_document_id AS reviewed_document_id,
       rev.document_verified,
       rev.investor_consent_verified,

       DATE_FORMAT(
         rev.reviewed_at,
         '%Y-%m-%d %H:%i'
       ) AS reviewed_at

     FROM acct_agreement_amendments am

     JOIN acct_agreement_versions oldv
       ON oldv.id = am.from_version_id
      AND oldv.agreement_id = am.agreement_id
      AND oldv.legal_business_id = am.legal_business_id

     JOIN acct_agreement_versions newv
       ON newv.id = am.to_version_id
      AND newv.agreement_id = am.agreement_id
      AND newv.legal_business_id = am.legal_business_id

     LEFT JOIN acct_business_documents docs
       ON docs.id = (
         SELECT MAX(d.id)
         FROM acct_business_documents d
         WHERE d.legal_business_id = am.legal_business_id
           AND d.funding_agreement_id = am.agreement_id
           AND d.agreement_version_id = am.to_version_id
           AND d.agreement_document_role = 'SIGNED'
           AND d.status = 'ACTIVE'
           AND d.mime_type = 'application/pdf'
           AND d.document_sha256 IS NOT NULL
       )

     LEFT JOIN acct_amendment_evidence_reviews rev
       ON rev.amendment_id = am.id
      AND rev.legal_business_id = am.legal_business_id
      AND rev.agreement_id = am.agreement_id
      AND rev.proposed_version_id = am.to_version_id

     WHERE am.legal_business_id = ?
       AND am.agreement_id = ?
       AND am.status = 'PENDING'
       AND oldv.version_status = 'APPROVED'
       AND newv.version_status = 'DRAFT'

     ORDER BY am.id DESC
     LIMIT 1`,
    [businessId, agreementId]
  );

  return rows[0] ?? null;
}
