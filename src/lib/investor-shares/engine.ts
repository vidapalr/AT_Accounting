/**
 * Investor profit sharing: who is owed what, and whether the agreements fit
 * together. Pure functions, no database, so every rule can be tested.
 *
 * Rules (as agreed for Abhiram Group):
 *  - An agreement shares the profit of one place: the whole Group, a Division
 *    (including its branches) or a single Branch.
 *  - It names the profit it shares: GROSS, OPERATING or NET.
 *  - For one branch, the Group + its Division + the Branch agreements that use
 *    the same profit basis may not add up to more than 100%.
 *  - Group-level agreements, across all profit bases, may not add up to more
 *    than 100% minus the owner's minimum (51% unless changed).
 *  - A change takes effect on its date. The period is split there and each
 *    part uses the ledger profit dated inside that part (pro rata by
 *    transaction date, not by calendar days).
 *  - Each agreement is worked out once per period, at its own place.
 */

export const SHARE_SCALE = 10_000; // 1% = 10,000 units
export const FULL_SHARE = 100 * SHARE_SCALE;

export type Basis = "GROSS" | "OPERATING" | "NET";

export type Figures = { gross: bigint; operating: bigint; net: bigint };

export type Place = { divisionId: number | null; branchId: number | null };

export type AgreementVersion = Place & {
  agreementId: number;
  agreementNo: string;
  partyName: string;
  versionNo: number;
  basis: Basis;
  basisText: string;
  basisRecognised: boolean;
  units: number;
  from: string;
  to: string | null;
  lossCarryForward: boolean;
};

export function placeLevel(p: Place): "GROUP" | "DIVISION" | "BRANCH" {
  if (p.branchId !== null) return "BRANCH";
  if (p.divisionId !== null) return "DIVISION";
  return "GROUP";
}

export function parseBasis(text: string | null | undefined): { basis: Basis; recognised: boolean } {
  const t = String(text ?? "").toLowerCase();
  if (/gross/.test(t)) return { basis: "GROSS", recognised: true };
  if (/operating/.test(t)) return { basis: "OPERATING", recognised: true };
  if (/net|distributable/.test(t)) return { basis: "NET", recognised: true };
  return { basis: "NET", recognised: false };
}

export function parseUnits(value: string | number | null | undefined): number {
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(String(value ?? "").trim());
  if (!m) throw new Error(`Invalid percentage: ${value}`);
  const units = Number(m[1]) * SHARE_SCALE + Number((m[2] ?? "").padEnd(4, "0"));
  if (units > FULL_SHARE) throw new Error(`Percentage above 100%: ${value}`);
  return units;
}

export function formatUnits(units: number): string {
  const whole = Math.floor(units / SHARE_SCALE);
  const frac = String(units % SHARE_SCALE).padStart(4, "0").replace(/0+$/, "");
  return `${whole}${frac ? `.${frac}` : ""}%`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);

export type Interval = AgreementVersion & { end: string | null };

/**
 * The days each version really applies: from its own start until the day
 * before the next version of the same agreement starts (or its own end).
 * A version replaced on the same date it starts has no days and is dropped.
 */
export function resolveIntervals(versions: AgreementVersion[]): Interval[] {
  const byAgreement = new Map<number, AgreementVersion[]>();
  for (const v of versions) {
    const list = byAgreement.get(v.agreementId) ?? [];
    list.push(v);
    byAgreement.set(v.agreementId, list);
  }

  const out: Interval[] = [];
  for (const list of byAgreement.values()) {
    list.sort((a, b) => (a.from === b.from ? a.versionNo - b.versionNo : a.from < b.from ? -1 : 1));
    list.forEach((v, i) => {
      const next = list[i + 1];
      let end = v.to;
      if (next) {
        const closes = addDays(next.from, -1);
        end = end === null ? closes : minDate(end, closes);
      }
      if (end !== null && end < v.from) return;
      out.push({ ...v, end });
    });
  }
  return out;
}

export type Segment = Interval & { segFrom: string; segTo: string };

export function buildSegments(versions: AgreementVersion[], periodFrom: string, periodTo: string): Segment[] {
  const out: Segment[] = [];
  for (const v of resolveIntervals(versions)) {
    const segFrom = maxDate(v.from, periodFrom);
    const segTo = v.end === null ? periodTo : minDate(v.end, periodTo);
    if (segFrom <= segTo) out.push({ ...v, segFrom, segTo });
  }
  return out.sort(
    (a, b) =>
      a.agreementId - b.agreementId || (a.segFrom < b.segFrom ? -1 : a.segFrom > b.segFrom ? 1 : 0)
  );
}

/** Profit of a place over a date range, from the ledger. Rolled up (a division includes its branches). */
export type ProfitLookup = (place: Place, from: string, to: string) => Figures;

export type AllocationRow = {
  agreementId: number;
  agreementNo: string;
  partyName: string;
  versionNo: number;
  place: Place;
  basis: Basis;
  units: number;
  from: string;
  to: string;
  profitBase: bigint;
  share: bigint;
};

export type AgreementTotal = {
  agreementId: number;
  agreementNo: string;
  partyName: string;
  /** What is payable for the period (never negative). */
  payable: bigint;
  /** Sum of the parts, which can be negative in a loss. */
  rawTotal: bigint;
};

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  const sign = numerator < 0n ? -1n : 1n;
  const abs = numerator < 0n ? -numerator : numerator;
  return sign * ((abs * 2n + denominator) / (denominator * 2n));
}

export function allocate(
  segments: Segment[],
  lookup: ProfitLookup
): { rows: AllocationRow[]; totals: AgreementTotal[] } {
  const rows: AllocationRow[] = segments.map((s) => {
    const figures = lookup({ divisionId: s.divisionId, branchId: s.branchId }, s.segFrom, s.segTo);
    const profitBase = s.basis === "GROSS" ? figures.gross : s.basis === "OPERATING" ? figures.operating : figures.net;
    return {
      agreementId: s.agreementId,
      agreementNo: s.agreementNo,
      partyName: s.partyName,
      versionNo: s.versionNo,
      place: { divisionId: s.divisionId, branchId: s.branchId },
      basis: s.basis,
      units: s.units,
      from: s.segFrom,
      to: s.segTo,
      profitBase,
      share: roundDiv(profitBase * BigInt(s.units), BigInt(FULL_SHARE)),
    };
  });

  const carry = new Map(segments.map((s) => [s.agreementId, s.lossCarryForward]));
  const totals = new Map<number, AgreementTotal & { positive: bigint }>();
  for (const r of rows) {
    const t = totals.get(r.agreementId) ?? {
      agreementId: r.agreementId,
      agreementNo: r.agreementNo,
      partyName: r.partyName,
      payable: 0n,
      rawTotal: 0n,
      positive: 0n,
    };
    t.rawTotal += r.share;
    if (r.share > 0n) t.positive += r.share;
    totals.set(r.agreementId, t);
  }
  const list = [...totals.values()].map(({ positive, ...t }) => ({
    ...t,
    payable: carry.get(t.agreementId) ? (t.rawTotal > 0n ? t.rawTotal : 0n) : positive,
  }));
  return { rows, totals: list };
}

export type CapacityIssue =
  | { kind: "OVER_100"; date: string; basis: Basis; place: Place; totalUnits: number }
  | { kind: "GROUP_LIMIT"; date: string; totalUnits: number; limitUnits: number };

export const DEFAULT_OWNER_MIN_UNITS = 51 * SHARE_SCALE;

/**
 * Checks that agreements fit together on every date any of them starts or ends.
 */
export function checkCapacity(
  versions: AgreementVersion[],
  ownerMinUnits: number = DEFAULT_OWNER_MIN_UNITS
): CapacityIssue[] {
  const intervals = resolveIntervals(versions);
  const dates = new Set<string>();
  for (const i of intervals) {
    dates.add(i.from);
    if (i.end !== null) dates.add(addDays(i.end, 1));
  }

  const issues: CapacityIssue[] = [];
  const groupLimit = FULL_SHARE - ownerMinUnits;

  for (const date of [...dates].sort()) {
    const active = intervals.filter((i) => i.from <= date && (i.end === null || i.end >= date));

    const groupTotal = active
      .filter((i) => placeLevel(i) === "GROUP")
      .reduce((s, i) => s + i.units, 0);
    if (groupTotal > groupLimit) {
      issues.push({ kind: "GROUP_LIMIT", date, totalUnits: groupTotal, limitUnits: groupLimit });
    }

    const seen = new Set<string>();
    for (const node of active) {
      const key = `${node.divisionId}/${node.branchId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      for (const basis of ["GROSS", "OPERATING", "NET"] as Basis[]) {
        const total = active
          .filter((i) => i.basis === basis)
          .filter((i) => {
            const level = placeLevel(i);
            if (level === "GROUP") return true;
            if (level === "DIVISION") return i.divisionId === node.divisionId;
            return i.branchId === node.branchId;
          })
          .reduce((s, i) => s + i.units, 0);
        if (total > FULL_SHARE) {
          issues.push({
            kind: "OVER_100",
            date,
            basis,
            place: { divisionId: node.divisionId, branchId: node.branchId },
            totalUnits: total,
          });
        }
      }
    }
  }
  return issues;
}
