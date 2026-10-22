
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export interface ParticipationRow extends RowDataPacket {
  agreement_id: number;
  agreement_no: string;
  party_name: string;
  division_id: number | null;
  division_name: string | null;
  branch_id: number | null;
  branch_name: string | null;
  agreement_status: string;
  share_percentage: string;
  effective_from: string;
  effective_to: string | null;
}

export async function getProfitParticipations(
  businessId: number
): Promise<ParticipationRow[]> {
  const [rows] = await db.execute<ParticipationRow[]>(
    `SELECT
       a.id AS agreement_id,
       a.agreement_no,
       p.full_name AS party_name,
       a.division_id,
       d.name AS division_name,
       a.branch_id,
       b.branch_name,
       a.status AS agreement_status,
       CAST(
         JSON_UNQUOTE(
           JSON_EXTRACT(
             v.terms_json,
             '$.profit_share_percentage'
           )
         ) AS CHAR
       ) AS share_percentage,
       DATE_FORMAT(v.effective_from, '%Y-%m-%d')
         AS effective_from,
       DATE_FORMAT(v.effective_to, '%Y-%m-%d')
         AS effective_to
     FROM acct_funding_agreements a
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
     JOIN acct_agreement_versions v
       ON v.agreement_id = a.id
      AND v.legal_business_id = a.legal_business_id
      -- Current approved version; amendments supersede v1.
      AND v.version_status = 'APPROVED'
     LEFT JOIN acct_divisions d
       ON d.id = a.division_id
      AND d.legal_business_id = a.legal_business_id
     LEFT JOIN acct_branches b
       ON b.id = a.branch_id
      AND b.division_id = a.division_id
      AND b.legal_business_id = a.legal_business_id
     WHERE a.legal_business_id = ?
       AND a.funding_type = 'PROFIT_LINKED'
       AND a.status = 'ACTIVE'
     ORDER BY a.division_id, a.branch_id, a.id`,
    [businessId]
  );

  return rows;
}
