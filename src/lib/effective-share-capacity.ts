
import "server-only";

import type { PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

import {
  FULL_SHARE,
  getEffectiveAgreements,
  parseShareUnits,
  poolKey,
  isValidSqlDate,
  type ProfitPool,
} from "@/lib/effective-profit-participation";

interface BoundaryRow extends RowDataPacket {
  boundary_date: string;
}

export type CapacityCheck = {
  valid: boolean;
  checkedDates: string[];
  conflicts: Array<{
    date: string;
    totalUnits: number;
    excessUnits: number;
  }>;
};

function nextDay(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);

  value.setUTCDate(value.getUTCDate() + 1);

  return value.toISOString().slice(0, 10);
}

/**
 * Read-only preview of the capacity that would result
 * if the proposed investor version took effect.
 *
 * This is NOT the final approval lock.
 * Approval must repeat this check under the
 * same transaction that commits the amendment.
 */
export async function checkProposedShareCapacity(
  connection: PoolConnection,
  input: {
    businessId: number;
    agreementId: number;
    pool: ProfitPool;
    effectiveFrom: string;
    effectiveTo: string | null;
    proposedPercentage: string;
  }
): Promise<CapacityCheck> {
  const {
    businessId,
    agreementId,
    pool,
    effectiveFrom,
    effectiveTo,
  } = input;

  if (
    !isValidSqlDate(effectiveFrom) ||
    (
      effectiveTo !== null &&
      (
        !isValidSqlDate(effectiveTo) ||
        effectiveTo < effectiveFrom
      )
    )
  ) {
    throw new Error("Invalid proposed effective dates");
  }

  const proposedUnits = parseShareUnits(
    input.proposedPercentage
  );

  const [boundaries] =
    await connection.execute<BoundaryRow[]>(
      `SELECT DISTINCT
         DATE_FORMAT(
           effective_from,
           '%Y-%m-%d'
         ) AS boundary_date
       FROM acct_agreement_versions
       WHERE legal_business_id = ?
         AND version_status IN (
           'APPROVED', 'SUPERSEDED'
         )
         AND effective_from >= ?
         AND (
           ? IS NULL
           OR effective_from <= ?
         )

       UNION

       SELECT DISTINCT
         DATE_FORMAT(
           DATE_ADD(effective_to, INTERVAL 1 DAY),
           '%Y-%m-%d'
         ) AS boundary_date
       FROM acct_agreement_versions
       WHERE legal_business_id = ?
         AND version_status IN (
           'APPROVED', 'SUPERSEDED'
         )
         AND effective_to IS NOT NULL
         AND effective_to >= ?
         AND effective_to < '9999-12-31'
         AND (
           ? IS NULL
           OR effective_to < ?
         )`,
      [
        businessId,
        effectiveFrom,
        effectiveTo,
        effectiveTo,
        businessId,
        effectiveFrom,
        effectiveTo,
        effectiveTo,
      ]
    );

  const dates = new Set<string>([effectiveFrom]);

  for (const item of boundaries) {
    if (
      item.boundary_date &&
      item.boundary_date >= effectiveFrom &&
      (
        effectiveTo === null ||
        item.boundary_date <= effectiveTo
      )
    ) {
      dates.add(item.boundary_date);
    }
  }

  if (effectiveTo !== null &&
      effectiveTo < "9999-12-31") {
    // The next day is useful for validating the
    // return to the earlier allocation state.
    dates.add(nextDay(effectiveTo));
  }

  const orderedDates = Array.from(dates).sort();

  const conflicts: CapacityCheck["conflicts"] = [];

  for (const date of orderedDates) {
    const effective = await getEffectiveAgreements(
      connection,
      businessId,
      date
    );

    const samePool = effective.filter(
      (row) =>
        poolKey({
          divisionId: row.division_id,
          branchId: row.branch_id,
        }) === poolKey(pool)
    );

    const otherInvestors = samePool.filter(
      (row) => row.agreement_id !== agreementId
    );

    const othersTotal = otherInvestors.reduce(
      (sum, row) =>
        sum + parseShareUnits(
          row.profit_share_percentage
        ),
      0
    );

    const proposalApplies =
      date >= effectiveFrom &&
      (
        effectiveTo === null ||
        date <= effectiveTo
      );

    const original = samePool.find(
      (row) => row.agreement_id === agreementId
    );

    const selectedUnits = proposalApplies
      ? proposedUnits
      : original
        ? parseShareUnits(
            original.profit_share_percentage
          )
        : 0;

    const total = othersTotal + selectedUnits;

    if (total > FULL_SHARE) {
      conflicts.push({
        date,
        totalUnits: total,
        excessUnits: total - FULL_SHARE,
      });
    }
  }

  return {
    valid: conflicts.length === 0,
    checkedDates: orderedDates,
    conflicts,
  };
}
