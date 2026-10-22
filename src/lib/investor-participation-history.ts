
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export interface ParticipationHistoryRow
  extends RowDataPacket {
  agreement_id: number;
  agreement_no: string;
  investor_name: string;
  division_id: number | null;
  branch_id: number | null;
  version_id: number;
  version_no: number;
  version_status: string;
  effective_from: string;
  effective_to: string | null;
  profit_share_percentage: string;
  amendment_status: string | null;
  approved_at: string | null;
}

export async function getParticipationHistory(
  businessId: number
): Promise<ParticipationHistoryRow[]> {
  const [rows] =
    await db.execute<ParticipationHistoryRow[]>(
      `SELECT
         a.id AS agreement_id,
         a.agreement_no,
         p.full_name AS investor_name,
         a.division_id,
         a.branch_id,
         v.id AS version_id,
         v.version_no,
         v.version_status,

         DATE_FORMAT(
           v.effective_from,
           '%Y-%m-%d'
         ) AS effective_from,

         DATE_FORMAT(
           v.effective_to,
           '%Y-%m-%d'
         ) AS effective_to,

         JSON_UNQUOTE(
           JSON_EXTRACT(
             v.terms_json,
             '$.profit_share_percentage'
           )
         ) AS profit_share_percentage,

         am.status AS amendment_status,

         DATE_FORMAT(
           v.approved_at,
           '%Y-%m-%d %H:%i'
         ) AS approved_at

       FROM acct_funding_agreements a

       JOIN acct_funding_parties p
         ON p.id = a.party_id
        AND p.legal_business_id =
            a.legal_business_id

       JOIN acct_agreement_versions v
         ON v.agreement_id = a.id
        AND v.legal_business_id =
            a.legal_business_id

       LEFT JOIN acct_agreement_amendments am
         ON am.to_version_id = v.id
        AND am.agreement_id = a.id
        AND am.legal_business_id =
            a.legal_business_id

       WHERE a.legal_business_id = ?
         AND a.funding_type = 'PROFIT_LINKED'
         AND a.status = 'ACTIVE'

       ORDER BY
         a.division_id,
         a.branch_id,
         a.id,
         v.effective_from,
         v.version_no`,
      [businessId]
    );

  return rows;
}
