import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { buildLedgerDrafts } from "./source-events";
import { APP_POSTED_SOURCES } from "./reversible-sources";
import { compareAccounts, trialBalance, type AccountNet } from "./reconcile-math";

type Row = RowDataPacket & Record<string, unknown>;

/** Read-only. Compares what the records say with what the books hold, account by account. */
export async function getReconciliation(db: Pool, businessId: number) {
  const built = await buildLedgerDrafts(db, businessId);

  const expectedMap = new Map<string, bigint>();
  for (const d of built.drafts) {
    if (d.sourceType === "OPENING_BALANCE") continue;
    for (const l of d.lines) expectedMap.set(l.accountCode, (expectedMap.get(l.accountCode) ?? 0n) + l.debit - l.credit);
  }
  const expected: AccountNet[] = [...expectedMap].map(([code, net]) => ({ code, name: built.chart.get(code)?.name ?? "", net }));

  const sources = APP_POSTED_SOURCES.map(() => "?").join(",");
  const notReversed = `NOT EXISTS (SELECT 1 FROM acct_journal_reversals r
                        WHERE r.legal_business_id = j.legal_business_id AND r.original_journal_id = j.id)`;
  const load = async (where: string, params: unknown[]) => {
    const [rows] = await db.query<Row[]>(
      `SELECT a.account_code AS code, a.account_name AS name,
              CAST(ROUND(SUM(l.debit - l.credit) * 100) AS SIGNED) AS net
         FROM acct_journal_lines l
         JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
         JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
        WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND ${notReversed} AND ${where}
        GROUP BY a.account_code, a.account_name`,
      [businessId, ...params]
    );
    return rows.map((r) => ({ code: String(r.code), name: String(r.name ?? ""), net: BigInt(String(r.net ?? 0)) }));
  };
  const booked = await load(`j.source_type IN (${sources})`, [...APP_POSTED_SOURCES]);
  const other = await load(`(j.source_type IS NULL OR (j.source_type NOT IN (${sources}) AND j.source_type <> 'JOURNAL_REVERSAL'))`, [...APP_POSTED_SOURCES]);

  const [tb] = await db.query<Row[]>(
    `SELECT CAST(ROUND(SUM(l.debit) * 100) AS SIGNED) AS d, CAST(ROUND(SUM(l.credit) * 100) AS SIGNED) AS c
       FROM acct_journal_lines l JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
      WHERE l.legal_business_id = ? AND j.status = 'POSTED'`, [businessId]);

  return {
    rows: compareAccounts(expected, booked, other),
    trial: trialBalance(BigInt(String(tb[0]?.d ?? 0)), BigInt(String(tb[0]?.c ?? 0))),
    problems: built.problems,
  };
}
