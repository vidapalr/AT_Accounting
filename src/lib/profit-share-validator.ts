
import "server-only";

import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

export type ProfitPool = {
  divisionId: number | null;
  branchId: number | null;
};

interface ExistingShare extends RowDataPacket {
  agreement_id: number;
  agreement_no: string;
  percentage: string | null;
  starts_on: string;
  ends_on: string | null;
}

export type ProfitShareCheck = {
  valid: boolean;
  maximumAllocated: string;
  conflictDate: string | null;
  message: string;
};

const FULL_SHARE = 1_000_000;
// Four decimal places of a percentage:
// 100.0000% = 1,000,000 units.

function percentageUnits(value: string): number {
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(value)) {
    throw new Error("Invalid profit percentage.");
  }

  const [whole, decimals = ""] = value.split(".");

  const units =
    Number(whole) * 10_000 +
    Number(decimals.padEnd(4, "0"));

  if (
    !Number.isSafeInteger(units) ||
    units < 0 ||
    units > FULL_SHARE
  ) {
    throw new Error("Profit percentage out of range.");
  }

  return units;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function activeOn(
  date: string,
  start: string,
  end: string | null
): boolean {
  return start <= date && (end === null || end >= date);
}

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
    !isDate(effectiveFrom) ||
    (effectiveTo !== null &&
      (!isDate(effectiveTo) ||
        effectiveTo < effectiveFrom))
  ) {
    throw new Error("Invalid effective period.");
  }

  if (
    pool.branchId !== null &&
    pool.divisionId === null
  ) {
    throw new Error("Branch requires a division.");
  }

  const proposed = percentageUnits(percentage);

  // Approved V1 is the currently supported activation baseline.
  // When amendment approval is introduced, this query must be
  // extended to consider all applicable approved versions.
  const [existing] =
    await connection.execute<ExistingShare[]>(
      `SELECT
         a.id AS agreement_id,
         a.agreement_no,
         JSON_UNQUOTE(
           JSON_EXTRACT(
             v.terms_json,
             '$.profit_share_percentage'
           )
         ) AS percentage,
         DATE_FORMAT(
           v.effective_from,
           '%Y-%m-%d'
         ) AS starts_on,
         DATE_FORMAT(
           v.effective_to,
           '%Y-%m-%d'
         ) AS ends_on
       FROM acct_funding_agreements a
       JOIN acct_agreement_versions v
         ON v.agreement_id = a.id
        AND v.legal_business_id = a.legal_business_id
        AND v.version_no = 1
        AND v.version_status = 'APPROVED'
       WHERE a.legal_business_id = ?
         AND a.status = 'ACTIVE'
         AND a.funding_type = 'PROFIT_LINKED'
         AND a.id <> ?
         AND a.division_id <=> ?
         AND a.branch_id <=> ?
         AND v.effective_from <= COALESCE(
           ?, '9999-12-31'
         )
         AND (
           v.effective_to IS NULL
           OR v.effective_to >= ?
         )`,
      [
        businessId,
        excludeAgreementId,
        pool.divisionId,
        pool.branchId,
        effectiveTo,
        effectiveFrom,
      ]
    );

  // The combined share can change only when an agreement
  // begins or ends. Checking the proposed start and every
  // overlapping agreement start is sufficient to locate
  // the maximum concurrent allocation.
  const checkpoints = new Set<string>([effectiveFrom]);

  for (const row of existing) {
    if (
      row.starts_on >= effectiveFrom &&
      (effectiveTo === null ||
        row.starts_on <= effectiveTo)
    ) {
      checkpoints.add(row.starts_on);
    }
  }

  let highest = proposed;

  for (const date of [...checkpoints].sort()) {
    let total = proposed;

    for (const row of existing) {
      if (activeOn(date, row.starts_on, row.ends_on)) {
        if (row.percentage === null) {
          throw new Error(
            `Agreement ${row.agreement_no} has no profit share.`
          );
        }

        total += percentageUnits(row.percentage);
      }
    }

    if (total > highest) {
      highest = total;
    }

    if (total > FULL_SHARE) {
      return {
        valid: false,
        maximumAllocated: (total / 10_000).toFixed(4),
        conflictDate: date,
        message:
          "Profit participation exceeds 100% " +
          "for an overlapping effective period.",
      };
    }
  }

  return {
    valid: true,
    maximumAllocated: (highest / 10_000).toFixed(4),
    conflictDate: null,
    message: "Profit participation is within 100%.",
  };
}
