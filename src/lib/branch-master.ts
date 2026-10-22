
import "server-only";

import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

export interface BranchRecord extends RowDataPacket {
  id: number;
  legal_business_id: number;
  division_id: number;
  division_code: string;
  division_name: string;
  branch_code: string;
  branch_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  opened_on: string | null;
  status: "ACTIVE" | "INACTIVE";
  agreement_count: number;
  open_agreement_count: number;
}

export async function getBranches(
  businessId: number
): Promise<BranchRecord[]> {
  const [rows] = await db.execute<BranchRecord[]>(
    `SELECT
       b.id,
       b.legal_business_id,
       b.division_id,
       d.code AS division_code,
       d.name AS division_name,
       b.branch_code,
       b.branch_name,
       b.address_line1,
       b.address_line2,
       b.city,
       b.state,
       b.postal_code,
       DATE_FORMAT(b.opened_on, '%Y-%m-%d')
         AS opened_on,
       b.status,
       (
         SELECT COUNT(*)
         FROM acct_funding_agreements a
         WHERE a.legal_business_id = b.legal_business_id
           AND a.branch_id = b.id
       ) AS agreement_count,
       (
         SELECT COUNT(*)
         FROM acct_funding_agreements a
         WHERE a.legal_business_id = b.legal_business_id
           AND a.branch_id = b.id
           AND a.status IN ('DRAFT', 'ACTIVE')
       ) AS open_agreement_count
     FROM acct_branches b
     INNER JOIN acct_divisions d
       ON d.id = b.division_id
      AND d.legal_business_id = b.legal_business_id
     WHERE b.legal_business_id = ?
     ORDER BY d.name, b.branch_code`,
    [businessId]
  );

  return rows;
}
