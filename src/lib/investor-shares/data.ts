import "server-only";

import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

type Executor = Pool | PoolConnection;

import { getProfitReport } from "@/lib/reports/report-data";
import {
  DEFAULT_OWNER_MIN_UNITS,
  SHARE_SCALE,
  parseBasis,
  parseUnits,
  type AgreementVersion,
  type Figures,
  type Place,
} from "./engine";

type Row = RowDataPacket & Record<string, string | number | null>;

export type LoadedShares = {
  versions: AgreementVersion[];
  ownerMinUnits: number;
  names: { divisions: Map<number, string>; branches: Map<number, string> };
  problems: string[];
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function loadShares(db: Executor, businessId: number): Promise<LoadedShares> {
  const problems: string[] = [];

  const [rows] = await db.execute<Row[]>(
    `SELECT a.id AS agreement_id, a.agreement_no, a.division_id AS a_div, a.branch_id AS a_branch,
            p.full_name AS party_name, a.party_id,
            v.version_no,
            DATE_FORMAT(v.effective_from, '%Y-%m-%d') AS eff_from,
            DATE_FORMAT(v.effective_to, '%Y-%m-%d') AS eff_to,
            v.terms_json
     FROM acct_funding_agreements a
     JOIN acct_funding_parties p ON p.id = a.party_id AND p.legal_business_id = a.legal_business_id
     JOIN acct_agreement_versions v ON v.agreement_id = a.id AND v.legal_business_id = a.legal_business_id
          AND v.version_status IN ('APPROVED', 'SUPERSEDED')
     WHERE a.legal_business_id = ? AND a.funding_type = 'PROFIT_LINKED' AND a.status IN ('ACTIVE', 'CLOSED')
     ORDER BY a.id, v.version_no`,
    [businessId]
  );

  const [policies] = await db.execute<Row[]>(
    `SELECT division_id, loss_carry_forward FROM acct_profit_waterfall_policies
     WHERE legal_business_id = ? AND status = 'APPROVED'
     ORDER BY effective_from DESC, id DESC`,
    [businessId]
  );
  const carryByDivision = new Map<number, boolean>();
  for (const r of policies) {
    const d = Number(r.division_id);
    if (!carryByDivision.has(d)) carryByDivision.set(d, Number(r.loss_carry_forward) === 1);
  }

  const versions: AgreementVersion[] = [];
  for (const r of rows) {
    let terms: Record<string, unknown>;
    try {
      terms = JSON.parse(String(r.terms_json));
    } catch {
      problems.push(`Agreement ${r.agreement_no} version ${r.version_no} has unreadable terms and was left out.`);
      continue;
    }
    const divisionId = num(terms.division_id ?? r.a_div);
    const branchId = num(terms.branch_id);
    const { basis, recognised } = parseBasis(String(terms.profit_basis ?? ""));
    if (!recognised) {
      problems.push(
        `Agreement ${r.agreement_no}: the profit basis "${terms.profit_basis ?? ""}" is not Gross, Operating or Net, so Net profit was used.`
      );
    }
    let units: number;
    try {
      units = parseUnits(terms.profit_share_percentage as string);
    } catch {
      problems.push(`Agreement ${r.agreement_no} version ${r.version_no} has no valid profit percentage and was left out.`);
      continue;
    }
    versions.push({
      agreementId: Number(r.agreement_id),
      agreementNo: String(r.agreement_no),
      partyName: String(r.party_name),
      partyId: Number(r.party_id),
      versionNo: Number(r.version_no),
      divisionId: branchId !== null && divisionId === null ? null : divisionId,
      branchId,
      basis,
      basisText: String(terms.profit_basis ?? ""),
      basisRecognised: recognised,
      units,
      from: String(r.eff_from),
      to: r.eff_to === null ? null : String(r.eff_to),
      lossCarryForward: divisionId === null ? true : carryByDivision.get(divisionId) ?? true,
    });
  }

  let ownerMinUnits = DEFAULT_OWNER_MIN_UNITS;
  try {
    const [s] = await db.execute<Row[]>(
      `SELECT setting_value FROM acct_business_settings
       WHERE legal_business_id = ? AND setting_key = 'owner_min_group_percent'`,
      [businessId]
    );
    if (s[0]) ownerMinUnits = parseUnits(String(s[0].setting_value));
  } catch {
    // table not created yet (migration 007): the default 51% applies
  }

  const [d] = await db.execute<Row[]>(`SELECT id, name FROM acct_divisions WHERE legal_business_id = ?`, [businessId]);
  const [b] = await db.execute<Row[]>(`SELECT id, branch_name FROM acct_branches WHERE legal_business_id = ?`, [businessId]);

  return {
    versions,
    ownerMinUnits,
    names: {
      divisions: new Map(d.map((x) => [Number(x.id), String(x.name)])),
      branches: new Map(b.map((x) => [Number(x.id), String(x.branch_name)])),
    },
    problems,
  };
}

/** Ledger profit for every (from, to) range needed, read once each. */
export async function profitLookupFor(
  db: Pool,
  businessId: number,
  ranges: Array<{ from: string; to: string }>
): Promise<(place: Place, from: string, to: string) => Figures> {
  const cache = new Map<string, Awaited<ReturnType<typeof getProfitReport>>>();
  for (const r of ranges) {
    const key = `${r.from}|${r.to}`;
    if (!cache.has(key)) cache.set(key, await getProfitReport(db, businessId, r.from, r.to));
  }
  const zero: Figures = { gross: 0n, operating: 0n, net: 0n };
  return (place, from, to) => {
    const scopes = cache.get(`${from}|${to}`);
    if (!scopes) return zero;
    const hit = scopes.find((s) =>
      place.branchId !== null
        ? s.scope === "BRANCH" && s.branchId === place.branchId
        : place.divisionId !== null
          ? s.scope === "DIVISION" && s.divisionId === place.divisionId
          : s.scope === "GROUP"
    );
    return hit ? { gross: hit.figures.gross, operating: hit.figures.operating, net: hit.figures.net } : zero;
  };
}

export { SHARE_SCALE };
