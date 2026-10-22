
import "server-only";

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export interface FundingPolicy extends RowDataPacket {
  id: number;
  legal_business_id: number;
  agreement_id: number;
  agreement_version_id: number;

  version_no: number;
  policy_status: "DRAFT" | "CONFIRMED";

  funding_model:
    | "FIXED"
    | "FLEXIBLE_ADVANCE"
    | "REVOLVING"
    | "TERM_LOAN"
    | "NO_INITIAL_FUNDING";

  maximum_outstanding: string | null;
  minimum_funding: string | null;

  additional_funding_allowed: number;
  flexible_repayment_allowed: number;

  profit_entitlement_model: string;
  entitlement_on_zero_balance: number | null;

  loss_sharing_model: string;
  loss_share_percentage: string | null;
  maximum_loss_exposure: string | null;
  loss_settlement_method: string;

  profit_calculation_order: string;
  policy_notes: string | null;
}

export async function getFundingPolicies(
  businessId: number,
  agreementId: number
): Promise<FundingPolicy[]> {
  const [rows] = await db.execute<FundingPolicy[]>(
    `SELECT
       p.id,
       p.legal_business_id,
       p.agreement_id,
       p.agreement_version_id,
       v.version_no,
       p.policy_status,
       p.funding_model,
       p.maximum_outstanding,
       p.minimum_funding,
       p.additional_funding_allowed,
       p.flexible_repayment_allowed,
       p.profit_entitlement_model,
       p.entitlement_on_zero_balance,
       p.loss_sharing_model,
       p.loss_share_percentage,
       p.maximum_loss_exposure,
       p.loss_settlement_method,
       p.profit_calculation_order,
       p.policy_notes
     FROM acct_agreement_funding_policies p
     JOIN acct_agreement_versions v
       ON v.id = p.agreement_version_id
      AND v.agreement_id = p.agreement_id
      AND v.legal_business_id = p.legal_business_id
     WHERE p.legal_business_id = ?
       AND p.agreement_id = ?
     ORDER BY v.version_no DESC`,
    [businessId, agreementId]
  );

  return rows;
}
