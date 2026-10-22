
import "server-only";

import type { PoolConnection } from "mysql2/promise";

import { checkProposedShareCapacity } from "@/lib/effective-share-capacity";
import {
  SHARE_SCALE,
  isValidSqlDate,
  type ProfitPool,
} from "@/lib/effective-profit-participation";

export type { ProfitPool };

export type ProfitShareCheck = {
  valid: boolean;
  maximumAllocated: string;
  conflictDate: string | null;
  message: string;
};

/**
 * Validates that activating an agreement keeps the combined
 * profit share of its pool within 100% on every effective date.
 *
 * This used to run its own query that only read version 1 in
 * APPROVED status. Once any agreement was amended, version 1 became
 * SUPERSEDED, that agreement disappeared from the check, and a new
 * investor could be activated on top of it (over 100% in total).
 * It now delegates to the version-aware effective-date logic that
 * amendment approval already uses, so both paths agree.
 */
export async function validateProfitShareCapacity(
  connection: PoolConnection,
  input: {
    businessId: number;
    excludeAgreementId: number;
    pool: ProfitPool;
    percentage: string;
    effectiveFrom: string;
    effectiveTo: string | null;
  }
): Promise<ProfitShareCheck> {
  const {
    businessId,
    excludeAgreementId,
    pool,
    percentage,
    effectiveFrom,
    effectiveTo,
  } = input;

  if (
    !isValidSqlDate(effectiveFrom) ||
    (effectiveTo !== null &&
      (!isValidSqlDate(effectiveTo) ||
        effectiveTo < effectiveFrom))
  ) {
    throw new Error("Invalid effective period.");
  }

  if (pool.branchId !== null && pool.divisionId === null) {
    throw new Error("Branch requires a division.");
  }

  const check = await checkProposedShareCapacity(connection, {
    businessId,
    agreementId: excludeAgreementId,
    pool,
    effectiveFrom,
    effectiveTo,
    proposedPercentage: percentage,
  });

  const maximumAllocated = (
    check.maximumUnits / SHARE_SCALE
  ).toFixed(4);

  if (!check.valid) {
    return {
      valid: false,
      maximumAllocated,
      conflictDate: check.conflicts[0]?.date ?? null,
      message:
        "Profit participation exceeds 100% " +
        "for an overlapping effective period.",
    };
  }

  return {
    valid: true,
    maximumAllocated,
    conflictDate: null,
    message: "Profit participation is within 100%.",
  };
}
