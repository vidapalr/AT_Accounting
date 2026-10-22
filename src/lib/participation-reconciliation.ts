
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

import {
  FULL_SHARE,
  parseShareUnits,
  poolKey,
} from "@/lib/effective-profit-participation";

import { getInvestorPools } from "@/lib/investor-register";

type VersionRecord = RowDataPacket & {
  agreement_id: number;
  agreement_no: string;
  version_id: number;
  version_no: number;
  version_status: string;
  division_id: number | null;
  branch_id: number | null;
  agreement_start: string;
  effective_from: string;
  effective_to: string | null;
  share: string | null;
  policy_id: number | null;
  amendment_id: number | null;
  evidence_id: number | null;
  signed_document_id: number | null;
};

export type ReconciliationFinding = {
  severity: "ERROR" | "REVIEW";
  date: string;
  scope: string;
  detail: string;
};

export type ReconciliationRow = {
  date: string;
  scope: string;
  poolName: string;
  allocatedUnits: number;
  residualUnits: number;
  investorCount: number;
  status: "BALANCED" | "ERROR" | "REVIEW";
};

type Report = {
  rows: ReconciliationRow[];
  findings: ReconciliationFinding[];
  dates: string[];
  errorCount: number;
  reviewCount: number;
};

function nextDay(value: string): string | null {
  if (value >= "9999-12-31") return null;

  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

function uniqueDates(
  versions: VersionRecord[]
): string[] {
  const dates = new Set<string>();

  for (const version of versions) {
    dates.add(version.effective_from);

    if (version.effective_to) {
      const afterEnd = nextDay(version.effective_to);
      if (afterEnd) dates.add(afterEnd);
    }
  }

  return [...dates].sort();
}

function samePool(
  row: VersionRecord,
  key: string
): boolean {
  return poolKey({
    divisionId: row.division_id,
    branchId: row.branch_id,
  }) === key;
}

function activeVersionAt(
  versions: VersionRecord[],
  date: string
): VersionRecord | undefined {
  return versions
    .filter(
      (v) =>
        v.effective_from <= date &&
        (
          v.effective_to === null ||
          v.effective_to >= date
        )
    )
    .sort(
      (a, b) =>
        b.effective_from.localeCompare(
          a.effective_from
        ) ||
        b.version_no - a.version_no
    )[0];
}

export async function getParticipationReconciliation(
  businessId: number
): Promise<Report> {
  const pools = await getInvestorPools(businessId);

  const [versions] = await db.execute<VersionRecord[]>(
    `SELECT
       a.id AS agreement_id,
       a.agreement_no,
       a.division_id,
       a.branch_id,
       v.id AS version_id,
       v.version_no,
       v.version_status,

       
       DATE_FORMAT(
         v.effective_from, '%Y-%m-%d'
       ) AS effective_from,

       DATE_FORMAT(
         v.effective_to, '%Y-%m-%d'
       ) AS effective_to,

       JSON_UNQUOTE(
         JSON_EXTRACT(
           v.terms_json,
           '$.profit_share_percentage'
         )
       ) AS share,

       fp.id AS policy_id,
       am.id AS amendment_id,
       rev.id AS evidence_id,
       rev.signed_document_id

     FROM acct_funding_agreements a

     JOIN acct_agreement_versions v
       ON v.agreement_id = a.id
      AND v.legal_business_id = a.legal_business_id
      AND v.version_status IN (
        'APPROVED', 'SUPERSEDED'
      )

     LEFT JOIN acct_agreement_funding_policies fp
       ON fp.agreement_version_id = v.id
      AND fp.agreement_id = a.id
      AND fp.legal_business_id = a.legal_business_id
      AND fp.policy_status = 'CONFIRMED'

     LEFT JOIN acct_agreement_amendments am
       ON am.to_version_id = v.id
      AND am.agreement_id = a.id
      AND am.legal_business_id = a.legal_business_id
      AND am.status = 'APPROVED'

     LEFT JOIN acct_amendment_evidence_reviews rev
       ON rev.amendment_id = am.id
      AND rev.legal_business_id = a.legal_business_id
      AND rev.proposed_version_id = v.id
      AND rev.document_verified = 1
      AND rev.investor_consent_verified = 1

     WHERE a.legal_business_id = ?
       AND a.status = 'ACTIVE'
       AND a.funding_type = 'PROFIT_LINKED'

     ORDER BY a.id, v.version_no`,
    [businessId]
  );

  const findings: ReconciliationFinding[] = [];

  // We inspect every approved boundary, including
  // the day after a contract's final date.
  const dates = uniqueDates(versions);
  const rows: ReconciliationRow[] = [];

  const agreements = new Map<
    number,
    VersionRecord[]
  >();

  for (const version of versions) {
    const existing =
      agreements.get(version.agreement_id) ?? [];

    existing.push(version);
    agreements.set(version.agreement_id, existing);
  }

  // Static contractual checks.
  for (const version of versions) {
    const scope = poolKey({
      divisionId: version.division_id,
      branchId: version.branch_id,
    });

    try {
      parseShareUnits(version.share);
    } catch {
      findings.push({
        severity: "ERROR",
        date: version.effective_from,
        scope,
        detail:
          `${version.agreement_no} V${version.version_no}: ` +
          "invalid profit participation percentage.",
      });
    }

    if (version.version_no > 1) {
      if (
        version.amendment_id === null ||
        version.evidence_id === null ||
        version.signed_document_id === null
      ) {
        findings.push({
          severity: "ERROR",
          date: version.effective_from,
          scope,
          detail:
            `${version.agreement_no} V${version.version_no}: ` +
            "approved amendment evidence is missing.",
        });
      }

      if (version.policy_id === null) {
        findings.push({
          severity: "REVIEW",
          date: version.effective_from,
          scope,
          detail:
            `${version.agreement_no} V${version.version_no}: ` +
            "confirm funding-policy continuity from " +
            "the previous approved version.",
        });
      }
    } else if (version.policy_id === null) {
      findings.push({
        severity: "REVIEW",
        date: version.effective_from,
        scope,
        detail:
          `${version.agreement_no} V1: ` +
          "confirmed funding policy not linked.",
      });
    }
  }

  // Date-specific direct-pool reconciliation.
  for (const date of dates) {
    const effective: VersionRecord[] = [];

    for (const history of agreements.values()) {
      const selected = activeVersionAt(
        history,
        date
      );

      if (selected) effective.push(selected);
    }

    for (const pool of pools) {
      const key = poolKey({
        divisionId: pool.division_id,
        branchId: pool.branch_id,
      });

      const selected = effective.filter(
        (v) => samePool(v, key)
      );

      let allocated = 0;
      let invalid = false;

      for (const version of selected) {
        try {
          allocated += parseShareUnits(
            version.share
          );
        } catch {
          invalid = true;
        }
      }

      if (allocated > FULL_SHARE) {
        findings.push({
          severity: "ERROR",
          date,
          scope: key,
          detail:
            `Direct investor shares total ` +
            `${(allocated / 10000).toFixed(4)}%, ` +
            "exceeding 100%.",
        });
      }

      const hasStaticError = findings.some(
        (f) =>
            f.scope === key &&
            f.severity === "ERROR" &&
            f.date <= date &&
            f.detail.includes("evidence is missing")
        );

      const hasReview = findings.some(
        (f) =>
            f.scope === key &&
            f.severity === "REVIEW" &&
            f.date <= date
        );


      rows.push({
        date,
        scope: key,
        poolName: pool.pool_name,
        allocatedUnits: allocated,
        residualUnits: FULL_SHARE - allocated,
        investorCount: selected.length,
        status:
          invalid ||
          allocated > FULL_SHARE ||
          hasStaticError
            ? "ERROR"
            : hasReview
                ? "REVIEW"
                : "BALANCED",
            });
    }
  }

  return {
    rows,
    findings,
    dates,
    errorCount: findings.filter(
      (f) => f.severity === "ERROR"
    ).length,
    reviewCount: findings.filter(
      (f) => f.severity === "REVIEW"
    ).length,
  };
}
