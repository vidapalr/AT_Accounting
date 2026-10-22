
import "server-only";

import { db } from "@/lib/db";
import type {
  PoolConnection,
} from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

export const SHARE_SCALE = 10_000;
export const FULL_SHARE = 1_000_000;

export type ProfitPool = {
  divisionId: number | null;
  branchId: number | null;
};

export interface EffectiveAgreement extends RowDataPacket {
  agreement_id: number;
  agreement_no: string;
  party_name: string;
  division_id: number | null;
  branch_id: number | null;
  version_id: number;
  version_no: number;
  effective_from: string;
  effective_to: string | null;
  profit_share_percentage: string;
}

export function parseShareUnits(
  input: unknown
): number {
  const match =
    /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(
      String(input ?? "")
    );

  if (!match) {
    throw new Error("Invalid contractual percentage");
  }

  const units =
    Number(match[1]) * SHARE_SCALE +
    Number((match[2] ?? "").padEnd(4, "0"));

  if (units < 0 || units > FULL_SHARE) {
    throw new Error("Percentage outside 0–100%");
  }

  return units;
}

export function formatShareUnits(
  units: number
): string {
  if (!Number.isInteger(units)) {
    throw new Error("Invalid percentage units");
  }

  const sign = units < 0 ? "-" : "";
  const absolute = Math.abs(units);

  return (
    `${sign}${Math.floor(absolute / SHARE_SCALE)}.` +
    `${String(absolute % SHARE_SCALE).padStart(4, "0")}%`
  );
}

export function poolKey(pool: ProfitPool): string {
  if (pool.branchId !== null) {
    return `BRANCH:${pool.branchId}`;
  }

  if (pool.divisionId !== null) {
    return `DIVISION:${pool.divisionId}`;
  }

  return "GROUP";
}

export function isValidSqlDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

/**
 * Returns exactly one applicable approved version
 * per active profit-linked agreement.
 *
 * Version 1 remains historically valid even after
 * Version 2 is approved.
 *
 * The start date of the next approved version
 * closes the earlier version's economic period
 * without editing the original signed record.
 */
export async function getEffectiveAgreements(
  connection: PoolConnection,
  businessId: number,
  asOfDate: string
): Promise<EffectiveAgreement[]> {
  if (!isValidSqlDate(asOfDate)) {
    throw new Error("Invalid participation date");
  }

  const [rows] = await connection.execute<
    EffectiveAgreement[]
  >(
    `SELECT
       a.id AS agreement_id,
       a.agreement_no,
       p.full_name AS party_name,
       a.division_id,
       a.branch_id,

       v.id AS version_id,
       v.version_no,

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
       ) AS profit_share_percentage

     FROM acct_funding_agreements a

     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id

     JOIN acct_agreement_versions v
       ON v.agreement_id = a.id
      AND v.legal_business_id = a.legal_business_id
      AND v.version_status IN (
        'APPROVED', 'SUPERSEDED'
      )

     WHERE a.legal_business_id = ?
       AND a.status = 'ACTIVE'
       AND a.funding_type = 'PROFIT_LINKED'

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
             'APPROVED', 'SUPERSEDED'
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

     ORDER BY
       a.division_id,
       a.branch_id,
       p.full_name,
       a.id`,
    [
      businessId,
      asOfDate,
      asOfDate,
      asOfDate,
    ]
  );

  return rows;
}

export function summarizeProfitPools(
  rows: EffectiveAgreement[]
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const key = poolKey({
      divisionId: row.division_id,
      branchId: row.branch_id,
    });

    totals.set(
      key,
      (totals.get(key) ?? 0) +
        parseShareUnits(row.profit_share_percentage)
    );
  }

  return Array.from(totals, ([scope, allocated]) => ({
    scope,
    allocated,
    residual: FULL_SHARE - allocated,
    valid: allocated <= FULL_SHARE,
  }));
}
