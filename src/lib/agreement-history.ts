
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export type AgreementTerms = {
  agreement_no: string;
  party_id: number;
  division_id: number | null;
  funding_type: "LOAN" | "PROFIT_LINKED";
  committed_amount: string;
  profit_share_percentage: string | null;
  profit_basis: string | null;
  interest_rate_percentage: string | null;
  interest_method: string;
  effective_from: string;
  effective_to: string | null;
  payout_frequency: string;
  principal_repayment_terms: string | null;
  loss_sharing_terms: string | null;
  agreement_notes: string | null;
  branch_id?: number | null;
  funding_scope?: "GROUP" | "DIVISION" | "BRANCH";
};

interface AgreementRow extends RowDataPacket {
  id: number;
  agreement_no: string;
  party_name: string;
  division_name: string | null;
  status: string;
}

interface VersionRow extends RowDataPacket {
  id: number;
  version_no: number;
  version_status: string;
  effective_from: string;
  effective_to: string | null;
  terms_json: string | AgreementTerms;
  change_reason: string;
  created_at: string;
  amendment_status: string | null;
}

export async function getAgreementHistory(
  businessId: number,
  agreementId: number
) {
  const [agreements] = await db.execute<AgreementRow[]>(
    `SELECT
       a.id, a.agreement_no, a.status,
       p.full_name AS party_name,
       d.name AS division_name
     FROM acct_funding_agreements a
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
     LEFT JOIN acct_divisions d
       ON d.id = a.division_id
      AND d.legal_business_id = a.legal_business_id
     WHERE a.id = ?
       AND a.legal_business_id = ?
     LIMIT 1`,
    [agreementId, businessId]
  );

  if (!agreements.length) return null;

  const [rows] = await db.execute<VersionRow[]>(
    `SELECT
       v.id,
       v.version_no,
       v.version_status,
       DATE_FORMAT(v.effective_from, '%Y-%m-%d')
         AS effective_from,
       DATE_FORMAT(v.effective_to, '%Y-%m-%d')
         AS effective_to,
       v.terms_json,
       v.change_reason,
       DATE_FORMAT(v.created_at, '%Y-%m-%d %H:%i')
         AS created_at,
       m.status AS amendment_status
     FROM acct_agreement_versions v
     LEFT JOIN acct_agreement_amendments m
       ON m.to_version_id = v.id
      AND m.agreement_id = v.agreement_id
      AND m.legal_business_id = v.legal_business_id
     WHERE v.agreement_id = ?
       AND v.legal_business_id = ?
     ORDER BY v.version_no DESC`,
    [agreementId, businessId]
  );

  const versions = rows.map((row) => ({
    ...row,
    terms: (
      typeof row.terms_json === "string"
        ? JSON.parse(row.terms_json)
        : row.terms_json
    ) as AgreementTerms,
  }));

  return {
    agreement: agreements[0],
    versions,
  };
}
