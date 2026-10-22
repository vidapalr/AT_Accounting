
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export type FundingPartyType =
  | "INDIVIDUAL"
  | "BUSINESS"
  | "FINANCIAL_INSTITUTION";

export type FundingPartyStatus =
  | "ACTIVE"
  | "INACTIVE";

export interface FundingParty extends RowDataPacket {
  id: number;
  legal_business_id: number;
  party_code: string;
  party_type: FundingPartyType;
  full_name: string;
  phone: string | null;
  email: string | null;
  pan_last4: string | null;
  status: FundingPartyStatus;
  notes: string | null;
  agreement_count: number;
}

export async function getFundingParties(
  businessId: number
): Promise<FundingParty[]> {
  const [rows] = await db.execute<FundingParty[]>(
    `SELECT
       p.id,
       p.legal_business_id,
       p.party_code,
       p.party_type,
       p.full_name,
       p.phone,
       p.email,
       p.pan_last4,
       p.status,
       p.notes,
       (
         SELECT COUNT(*)
         FROM acct_funding_agreements a
         WHERE a.party_id = p.id
           AND a.legal_business_id = p.legal_business_id
       ) AS agreement_count
     FROM acct_funding_parties p
     WHERE p.legal_business_id = ?
     ORDER BY p.id DESC`,
    [businessId]
  );

  return rows;
}
