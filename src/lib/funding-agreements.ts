import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export type FundingType = "LOAN" | "PROFIT_LINKED";

export interface FundingAgreement extends RowDataPacket {
  id: number;
  agreement_no: string;
  party_name: string;
  party_code: string;
  division_id: number | null;
  division_name: string | null;
  branch_id: number | null;
  branch_name: string | null;
  branch_code: string | null;
  funding_type: FundingType;
  committed_amount: string;
  profit_share_percentage: string | null;
  profit_basis: string | null;
  interest_rate_percentage: string | null;
  interest_method: string;
  effective_from: string;
  effective_to: string | null;
  payout_frequency: string;
  status: string;
}

export async function getFundingAgreements(
  businessId: number
): Promise<FundingAgreement[]> {
  const [rows] = await db.execute<FundingAgreement[]>(
    `SELECT
       a.id,
       a.agreement_no,
       p.full_name AS party_name,
       p.party_code,
       a.division_id,
       d.name AS division_name,
       a.branch_id,
       b.branch_name,
       b.branch_code,
       a.funding_type,
       a.committed_amount,
       a.profit_share_percentage,
       a.profit_basis,
       a.interest_rate_percentage,
       a.interest_method,
       DATE_FORMAT(a.effective_from, '%Y-%m-%d')
         AS effective_from,
       DATE_FORMAT(a.effective_to, '%Y-%m-%d')
         AS effective_to,
       a.payout_frequency,
       a.status
     FROM acct_funding_agreements a
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
     LEFT JOIN acct_divisions d
       ON d.id = a.division_id
      AND d.legal_business_id = a.legal_business_id
     LEFT JOIN acct_branches b
       ON b.id = a.branch_id
      AND b.division_id = a.division_id
      AND b.legal_business_id = a.legal_business_id
     WHERE a.legal_business_id = ?
     ORDER BY a.id DESC`,
    [businessId]
  );

  return rows;
}
