import "server-only";
import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

import { buildCashFlow, type FlowRow } from "@/lib/reports/cash-flow";
import { toPaise } from "@/lib/reports/money";

type Row = RowDataPacket & Record<string, string | number | null>;

const BUSINESS_MONEY = `
  SELECT gl_account_id FROM acct_bank_accounts
   WHERE legal_business_id = ? AND ownership_type = 'BUSINESS' AND gl_account_id IS NOT NULL
  UNION
  SELECT gl_account_id FROM acct_cash_accounts
   WHERE legal_business_id = ? AND gl_account_id IS NOT NULL`;

/** Cash and bank money of the business: where it stood on `from`, what moved to `to`, and each account's end figure. */
export async function loadCashFlow(db: Pool, businessId: number, from: string, to: string) {
  const [opening] = await db.execute<Row[]>(
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS bal
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
      WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date < ?
        AND l.account_id IN (${BUSINESS_MONEY})`,
    [businessId, from, businessId, businessId]
  );
  const [moves] = await db.execute<Row[]>(
    `SELECT j.source_type, COALESCE(SUM(l.debit - l.credit), 0) AS net
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
      WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date BETWEEN ? AND ?
        AND l.account_id IN (${BUSINESS_MONEY})
      GROUP BY j.source_type`,
    [businessId, from, to, businessId, businessId]
  );
  const [places] = await db.execute<Row[]>(
    `SELECT a.account_code, a.account_name, COALESCE(SUM(l.debit - l.credit), 0) AS bal
       FROM acct_journal_lines l
       JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
       JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
      WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date <= ?
        AND l.account_id IN (${BUSINESS_MONEY})
      GROUP BY a.account_code, a.account_name ORDER BY a.account_code`,
    [businessId, to, businessId, businessId]
  );
  const rows: FlowRow[] = moves.map((m) => ({
    sourceType: m.source_type === null ? null : String(m.source_type),
    netPaise: toPaise(m.net),
  }));
  const flow = buildCashFlow(rows, toPaise(opening[0].bal));
  return {
    ...flow,
    places: places.map((p) => ({ code: String(p.account_code), name: String(p.account_name), paise: toPaise(p.bal) })),
  };
}
