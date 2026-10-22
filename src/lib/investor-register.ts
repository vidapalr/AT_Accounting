
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export type ScopeType = "GROUP" | "DIVISION" | "BRANCH";

export interface InvestorPool extends RowDataPacket {
  scope_type: ScopeType;
  division_id: number | null;
  branch_id: number | null;
  pool_name: string;
  pool_code: string;
}

export interface InvestorPosition extends RowDataPacket {
  agreement_id: number;
  agreement_no: string;
  party_name: string;
  division_id: number | null;
  branch_id: number | null;
  committed_amount: string;
  profit_share_percentage: string;
  loss_sharing_model: string | null;
  loss_share_percentage: string | null;
  funding_received: string;
  principal_repaid: string;
  outstanding_principal: string;
  effective_from: string;
  effective_to: string | null;
  version_id: number;
  version_no: number;
  version_status: "APPROVED" | "SUPERSEDED";
}

export async function getInvestorPools(
  businessId: number
): Promise<InvestorPool[]> {
  const [rows] = await db.query<InvestorPool[]>(
    `SELECT
       'GROUP' AS scope_type,
       NULL AS division_id,
       NULL AS branch_id,
       'Abhiram Group' AS pool_name,
       'GROUP' AS pool_code

     UNION ALL

     SELECT
       'DIVISION',
       d.id,
       NULL,
       d.name,
       d.code
     FROM acct_divisions d
     WHERE d.legal_business_id = ?

     UNION ALL

     SELECT
       'BRANCH',
       b.division_id,
       b.id,
       CONCAT(d.name, ' / ', b.branch_name),
       b.branch_code
     FROM acct_branches b
     JOIN acct_divisions d
       ON d.id = b.division_id
      AND d.legal_business_id = b.legal_business_id
     WHERE b.legal_business_id = ?`,
    [businessId, businessId]
  );

  return rows;
}

export async function getInvestorPositions(
  businessId: number,
  asOfDate: string
): Promise<InvestorPosition[]> {
  const [rows] = await db.execute<InvestorPosition[]>(
    `SELECT
       a.id AS agreement_id,
       a.agreement_no,
       p.full_name AS party_name,
       a.division_id,
       a.branch_id,
       v.id AS version_id,
       v.version_no,
       v.version_status,

       CAST(a.committed_amount AS CHAR)
         AS committed_amount,

       JSON_UNQUOTE(
         JSON_EXTRACT(
           v.terms_json,
           '$.profit_share_percentage'
         )
       ) AS profit_share_percentage,

       fp.loss_sharing_model,
       CAST(fp.loss_share_percentage AS CHAR)
         AS loss_share_percentage,

       CAST(
         COALESCE(totals.received, 0)
         AS CHAR
       ) AS funding_received,

       CAST(
         COALESCE(totals.repaid, 0)
         AS CHAR
       ) AS principal_repaid,

       CAST(
         COALESCE(totals.received, 0) -
         COALESCE(totals.repaid, 0)
         AS CHAR
       ) AS outstanding_principal,

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
      AND v.version_status IN (
        'APPROVED',
        'SUPERSEDED'
      )

      AND v.effective_from <= ?

      AND (
        v.effective_to IS NULL
        OR v.effective_to >= ?
      )

      AND NOT EXISTS (
        SELECT 1
        FROM acct_agreement_versions newer
        WHERE newer.legal_business_id =
                v.legal_business_id
          AND newer.agreement_id =
                v.agreement_id
          AND newer.version_status IN (
            'APPROVED',
            'SUPERSEDED'
          )
          AND newer.effective_from <= ?
          AND (
            newer.effective_from > v.effective_from
            OR (
              newer.effective_from = v.effective_from
              AND newer.version_no > v.version_no
            )
          )
      )


     LEFT JOIN acct_agreement_funding_policies fp
       ON fp.agreement_version_id = v.id
      AND fp.agreement_id = a.id
      AND fp.legal_business_id = a.legal_business_id

     LEFT JOIN (
       SELECT
         legal_business_id,
         agreement_id,

         SUM(
           CASE
             WHEN transaction_type = 'FUNDING_RECEIVED'
               THEN amount
             ELSE 0
           END
         ) AS received,

         SUM(
           CASE
             WHEN transaction_type = 'PRINCIPAL_REPAID'
               THEN amount
             ELSE 0
           END
         ) AS repaid

       FROM acct_funding_transactions
       WHERE status = 'VERIFIED'
         AND transaction_date <= ?
       GROUP BY legal_business_id, agreement_id
     ) totals
       ON totals.agreement_id = a.id
      AND totals.legal_business_id = a.legal_business_id

     WHERE a.legal_business_id = ?
       AND a.status = 'ACTIVE'
       AND a.funding_type = 'PROFIT_LINKED'
       AND v.effective_from <= ?
       AND (
         v.effective_to IS NULL
         OR v.effective_to >= ?
       )

     ORDER BY a.division_id, a.branch_id, p.full_name`,
    [
      asOfDate,
      asOfDate,
      asOfDate,
      asOfDate,
      businessId,
      asOfDate,
      asOfDate,
    ]
  );

  return rows;
}
