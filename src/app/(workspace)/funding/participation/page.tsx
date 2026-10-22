
import Link from "next/link";
import { Suspense } from "react";

import {
  getParticipationHistory,
} from "@/lib/investor-participation-history";

import {
  formatShareUnits,
  parseShareUnits,
} from "@/lib/effective-profit-participation";


import { requireGroupOwner } from "@/lib/auth";
import {
  getInvestorPools,
  getInvestorPositions,
  type InvestorPosition,
} from "@/lib/investor-register";

import styles from "../funding.module.css";

type Props = {
  searchParams: Promise<{ asOf?: string }>;
};

const MAX_SHARE = 1_000_000;

function shareUnits(value: string): number {
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(
    String(value)
  );

  if (!match) {
    throw new Error(`Invalid profit share: ${value}`);
  }

  const units =
    Number(match[1]) * 10000 +
    Number((match[2] ?? "").padEnd(4, "0"));

  if (units > MAX_SHARE) {
    throw new Error(`Profit share exceeds 100%: ${value}`);
  }

  return units;
}

function formatShare(units: number): string {
  return `${(units / 10000).toFixed(4)}%`;
}

function formatMoney(value: string | number): string {
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function scopeKey(
  divisionId: number | null,
  branchId: number | null
): string {
  if (branchId !== null) return `BRANCH:${branchId}`;
  if (divisionId !== null) return `DIVISION:${divisionId}`;
  return "GROUP";
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function minDate(
  first: string | null,
  second: string | null
): string | null {
  if (first === null) return second;
  if (second === null) return first;
  return first < second ? first : second;
}

function participationStatus(
  status: string,
  effectiveFrom: string,
  selectedDate: string
): string {
  if (status === "DRAFT") return "Pending approval";
  if (status === "REJECTED") return "Rejected";

  if (effectiveFrom > selectedDate) {
    return "Approved — future effective";
  }

  return "Approved history";
}

type EffectiveParticipation = {
  participant: string;
  source: string;
  units: number;
};

function getEffectiveBranchParticipation(
  branchMembers: InvestorPosition[],
  divisionMembers: InvestorPosition[]
): EffectiveParticipation[] {
  const branchAllocated = branchMembers.reduce(
    (sum, member) =>
      sum + shareUnits(member.profit_share_percentage),
    0
  );

  const remainingAfterBranch =
    MAX_SHARE - branchAllocated;

  // Do not calculate misleading percentages
  // when the direct branch pool is invalid.
  if (remainingAfterBranch < 0) {
    return [];
  }

  const divisionAllocated = divisionMembers.reduce(
    (sum, member) =>
      sum + shareUnits(member.profit_share_percentage),
    0
  );

  if (divisionAllocated > MAX_SHARE) {
    return [];
  }

  const result: EffectiveParticipation[] =
    branchMembers.map((member) => ({
      participant: member.party_name,
      source: "Direct Branch Agreement",
      units: shareUnits(member.profit_share_percentage),
    }));

  for (const member of divisionMembers) {
    const effectiveUnits =
      (remainingAfterBranch *
        shareUnits(member.profit_share_percentage)) /
      MAX_SHARE;

    result.push({
      participant: member.party_name,
      source: "Inherited Division Participation",
      units: effectiveUnits,
    });
  }

  const groupUnits =
    remainingAfterBranch *
    (MAX_SHARE - divisionAllocated) /
    MAX_SHARE;

  result.push({
    participant: "Abhiram Group — Residual",
    source: "Calculated After Division Participation",
    units: groupUnits,
  });

  return result;
}

function formatLoss(row: InvestorPosition): string {
  switch (row.loss_sharing_model) {
    case "NONE":
      return "No loss sharing";

    case "SAME_AS_PROFIT":
      return `${row.profit_share_percentage}%`;

    case "CUSTOM_PERCENTAGE":
      return row.loss_share_percentage == null
        ? "Needs review"
        : `${row.loss_share_percentage}%`;

    case "CAPPED":
      return row.loss_share_percentage == null
        ? "Capped — review terms"
        : `${row.loss_share_percentage}% (capped)`;

    default:
      return "Not confirmed";
  }
}

export default function ParticipationPage({
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          Loading participation data...
        </div>
      }
    >
      <ParticipationContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ParticipationContent({
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const query = await searchParams;

  const today = new Date().toISOString().slice(0, 10);

  const requested = query.asOf ?? today;

  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
    !Number.isNaN(
      Date.parse(`${requested}T00:00:00Z`)
    ) &&
    new Date(`${requested}T00:00:00Z`)
      .toISOString()
      .slice(0, 10) === requested;

  const asOfDate = validDate ? requested : today;

  const [pools, positions, history] =
    await Promise.all([
      getInvestorPools(user.legal_business_id),
      getInvestorPositions(
        user.legal_business_id,
        asOfDate
      ),
      getParticipationHistory(
        user.legal_business_id
      ),
    ]);

  const byScope = new Map<string, InvestorPosition[]>();

  for (const row of positions) {
    const key = scopeKey(
      row.division_id,
      row.branch_id
    );

    const existing = byScope.get(key) ?? [];
    existing.push(row);
    byScope.set(key, existing);
  }

  const historyByScope = new Map<
    string,
    typeof history
  >();

  for (const item of history) {
    const key = scopeKey(
      item.division_id,
      item.branch_id
    );

    const existing = historyByScope.get(key) ?? [];
    existing.push(item);
    historyByScope.set(key, existing);
  }

  const historyWithPeriods = (
    entries: typeof history
  ) => {
    return entries.map((item) => {
      const laterApproved = entries
        .filter((other) =>
          other.agreement_id === item.agreement_id &&
          ["APPROVED", "SUPERSEDED"].includes(
            other.version_status
          ) &&
          (
            other.effective_from > item.effective_from ||
            (
              other.effective_from === item.effective_from &&
              other.version_no > item.version_no
            )
          )
        )
        .sort((a, b) =>
          a.effective_from.localeCompare(b.effective_from) ||
          a.version_no - b.version_no
        )[0];

      const inferredEnd = laterApproved
        ? previousDate(laterApproved.effective_from)
        : null;

      return {
        ...item,
        applicableTo: minDate(
          item.effective_to,
          inferredEnd
        ),
      };
    });
  };

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>Investor & Profit Participation Register</h1>
        <p>
          Group, Division and Branch funding,
          profit sharing and residual participation.
        </p>
      </header>

      <div className={styles.linkRow}>
        <Link
          href="/funding/agreements"
          className={styles.primaryLink}
        >
          Funding Agreements
        </Link>

        <a
          href="/api/agreement-template"
          className={styles.primaryLink}
        >
          Download Agreement Template
        </a>
      </div>

      <section className={styles.card}>
        <h2>Participation Date</h2>

        <form method="GET">
          <label>
            As of Date
            <input
              type="date"
              name="asOf"
              defaultValue={asOfDate}
              required
            />
          </label>

          <button
            type="submit"
            className={styles.primary}
          >
            View Participation
          </button>
        </form>

        <p className={styles.note}>
          This is a Version 1 participation view.
          It is not yet an amended-share or
          period-based profit calculation report.
        </p>
      </section>

      {pools.map((pool) => {
        const key = scopeKey(
          pool.division_id,
          pool.branch_id
        );

        const members = byScope.get(key) ?? [];
        const poolHistory = historyWithPeriods(
          historyByScope.get(key) ?? []
        );
        const divisionMembers =
          pool.scope_type === "BRANCH"
            ? byScope.get(
                `DIVISION:${pool.division_id}`
              ) ?? []
            : [];

        const effectiveParticipation =
          pool.scope_type === "BRANCH"
            ? getEffectiveBranchParticipation(
                members,
                divisionMembers
              )
            : [];

        const allocated = members.reduce(
          (sum, row) =>
            sum + shareUnits(
              row.profit_share_percentage
            ),
          0
        );

        const residual = MAX_SHARE - allocated;
        const overallocated = residual < 0;

        return (
          <section
            key={key}
            className={styles.card}
          >
            <h2>
              {pool.pool_name}
              {" — "}
              {pool.scope_type}
            </h2>

            <p className={styles.note}>
              Scope: {pool.pool_code}
              {" | "}
              Investors: {members.length}
            </p>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Agreement</th>
                    <th>Version</th>
                    <th>Committed</th>
                    <th>Funds Received</th>
                    <th>Principal Repaid</th>
                    <th>Outstanding</th>
                    <th>Profit Share</th>
                    <th>Loss Sharing</th>
                  </tr>
                </thead>

                <tbody>
                  {members.map((row) => (
                    <tr key={row.agreement_id}>
                      <td>
                        <strong>
                          {row.party_name}
                        </strong>
                      </td>

                      <td>
                        <Link
                          href={
                            `/funding/agreements/${row.agreement_id}`
                          }
                        >
                          {row.agreement_no}
                        </Link>
                      </td>

                      <td>
                        V{row.version_no}
                        {row.version_status === "SUPERSEDED"
                          ? " (Historical)"
                          : ""}
                      </td>

                      <td>
                        {formatMoney(
                          row.committed_amount
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          row.funding_received
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          row.principal_repaid
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          row.outstanding_principal
                        )}
                      </td>

                      <td>
                        <strong>
                          {formatShare(
                            shareUnits(
                              row.profit_share_percentage
                            )
                          )}
                        </strong>
                      </td>

                      <td>
                        {formatLoss(row)}
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td>
                      <strong>
                        {pool.scope_type === "BRANCH"
                          ? "Branch Pool Residual — Before Division Allocation"
                          : "Abhiram Group — Residual"}
                      </strong>
                    </td>
                    <td>Calculated</td>
                    <td>—</td>
                    <td>Owner capital separately</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>
                      <strong>
                        {overallocated
                          ? "INVALID"
                          : formatShare(residual)}
                      </strong>
                    </td>
                    <td>
                      Residual exposure;
                      see agreements
                    </td>
                  </tr>

                  <tr>
                    <td>
                      <strong>
                        Total Profit Participation
                      </strong>
                    </td>
                    <td colSpan={6}> </td>
                    <td>
                      <strong>
                        {overallocated
                          ? formatShare(allocated)
                          : "100.0000%"}
                      </strong>
                    </td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {pool.scope_type === "BRANCH" && (
              <div style={{ marginTop: 24 }}>
                <h3>
                  Illustrative Effective Profit Participation
                </h3>

                <p className={styles.note}>
                  Includes direct branch investors and division-level
                  participation under a branch-first waterfall.
                  This is not a legal ownership table or a
                  payable-profit calculation.
                </p>

                <div className={styles.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Participation Source</th>
                        <th>Effective Share</th>
                      </tr>
                    </thead>

                    <tbody>
                      {effectiveParticipation.map((entry, index) => (
                        <tr key={`${entry.participant}-${index}`}>
                          <td>{entry.participant}</td>
                          <td>{entry.source}</td>
                          <td>{formatShare(entry.units)}</td>
                        </tr>
                      ))}

                      {effectiveParticipation.length === 0 && (
                        <tr>
                          <td colSpan={3}>
                            Unable to calculate.
                            Review profit-pool limits.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ marginTop: 28 }}>
              <h3>Agreement Version History</h3>

              <p className={styles.note}>
                Historical and proposed participation terms.
                Only approved versions contribute to the
                effective investor register.
              </p>

              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Investor</th>
                      <th>Agreement</th>
                      <th>Version</th>
                      <th>Profit Share</th>
                      <th>Effective From</th>
                      <th>Applicable Until</th>
                      <th>Version Status</th>
                      <th>View</th>
                    </tr>
                  </thead>

                  <tbody>
                    {poolHistory.map((item) => {
                      const approved = [
                        "APPROVED",
                        "SUPERSEDED",
                      ].includes(item.version_status);

                      const isSelectedVersion =
                        members.some(
                          (member) =>
                            member.agreement_id === item.agreement_id &&
                            member.version_id === item.version_id
                        );

                      return (
                        <tr key={item.version_id}>
                          <td>{item.investor_name}</td>

                          <td>{item.agreement_no}</td>

                          <td>V{item.version_no}</td>

                          <td>
                            {formatShareUnits(
                              parseShareUnits(
                                item.profit_share_percentage
                              )
                            )}
                          </td>

                          <td>{item.effective_from}</td>

                          <td>
                            {approved
                              ? item.applicableTo ?? "Open-ended"
                              : "Not applicable"}
                          </td>

                          <td>
                            {isSelectedVersion
                              ? "Effective on selected date"
                              : participationStatus(
                                  item.version_status,
                                  item.effective_from,
                                  asOfDate
                                )}
                          </td>

                          <td>
                            <Link
                              href={
                                `/funding/agreements/${item.agreement_id}`
                              }
                            >
                              Agreement
                            </Link>
                          </td>
                        </tr>
                      );
                    })}

                    {poolHistory.length === 0 && (
                      <tr>
                        <td colSpan={8}>
                          No agreement versions registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p
              className={
                overallocated
                  ? styles.error
                  : styles.success
              }
            >
              {overallocated
                ? `Overallocated: ${formatShare(
                    allocated
                  )}. Review agreements.`
                : `Investor participation: ${formatShare(
                    allocated
                  )}. Abhiram Group residual: ${formatShare(
                    residual
                  )}.`}
            </p>
          </section>
        );
      })}
    </div>
  );
}
