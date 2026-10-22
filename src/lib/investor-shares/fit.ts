import "server-only";

import type { Pool, PoolConnection } from "mysql2/promise";

import { loadShares } from "./data";
import {
  BASIS_OPTIONS,
  checkCapacity,
  formatUnits,
  parseBasis,
  parseUnits,
  placeLevel,
  type AgreementVersion,
  type CapacityIssue,
} from "./engine";

export type FitResult = { valid: boolean; message: string };

const key = (i: CapacityIssue) =>
  i.kind === "GROUP_LIMIT"
    ? `G|${i.date}`
    : `O|${i.date}|${i.basis}|${i.place.divisionId}|${i.place.branchId}`;

/**
 * Would this agreement (or new version of one) fit alongside the others?
 * Applies the shared 100% cap per profit basis across group, division and
 * branch, and the owner's minimum at group level. Problems that already
 * exist without the proposal do not block it.
 */
export async function checkAgreementFit(
  executor: Pool | PoolConnection,
  input: {
    businessId: number;
    agreementId: number;
    divisionId: number | null;
    branchId: number | null;
    percentage: string;
    basisText: string;
    from: string;
    to: string | null;
  }
): Promise<FitResult> {
  const { versions, ownerMinUnits } = await loadShares(executor, input.businessId);

  const parsed = parseBasis(input.basisText);
  if (!parsed.recognised) {
    return { valid: false, message: `Choose a profit basis: ${BASIS_OPTIONS.join(", ")}.` };
  }

  const others = versions;
  const nextVersionNo = Math.max(0, ...others.filter((v) => v.agreementId === input.agreementId).map((v) => v.versionNo)) + 1;
  const proposal: AgreementVersion = {
    agreementId: input.agreementId,
    agreementNo: "proposed",
    partyName: "proposed",
    versionNo: nextVersionNo,
    divisionId: input.divisionId,
    branchId: input.branchId,
    basis: parsed.basis,
    basisText: input.basisText,
    basisRecognised: true,
    units: parseUnits(input.percentage),
    from: input.from,
    to: input.to,
    lossCarryForward: true,
  };

  const before = new Set(checkCapacity(others, ownerMinUnits).map(key));
  const added = checkCapacity([...others, proposal], ownerMinUnits).filter((i) => !before.has(key(i)));

  if (added.length === 0) return { valid: true, message: "Fits within the limits." };

  const first = added[0];
  const message =
    first.kind === "GROUP_LIMIT"
      ? `From ${first.date}, group-level investors would total ${formatUnits(first.totalUnits)}. The limit is ${formatUnits(first.limitUnits)} so the owner keeps at least ${formatUnits(ownerMinUnits)}.`
      : `From ${first.date}, ${placeLevel(first.place).toLowerCase()} shares on the same profit basis would total ${formatUnits(first.totalUnits)}, above 100%.`;
  return { valid: false, message };
}
