import type { Pool, RowDataPacket } from "mysql2/promise";

import {
  balanceSheet,
  profitByScope,
  type BalanceSheet,
  type LedgerTotal,
  type ScopeProfit,
} from "./profit-levels.ts";
import { toPaise } from "./money.ts";

type Row = RowDataPacket & Record<string, string | number | null>;

export type NamedScope = ScopeProfit & { label: string; depth: 0 | 1 | 2 };

export async function getProfitReport(
  db: Pool,
  businessId: number,
  from: string,
  to: string
): Promise<NamedScope[]> {
  const [divisionRows] = await db.execute<Row[]>(
    `SELECT id, name FROM acct_divisions WHERE legal_business_id = ?`,
    [businessId]
  );
  const [branchRows] = await db.execute<Row[]>(
    `SELECT id, division_id, branch_name FROM acct_branches WHERE legal_business_id = ?`,
    [businessId]
  );
  const divisionName = new Map(divisionRows.map((d) => [Number(d.id), String(d.name)]));
  const branchName = new Map(branchRows.map((b) => [Number(b.id), String(b.branch_name)]));
  const divisionOfBranch = new Map(branchRows.map((b) => [Number(b.id), Number(b.division_id)]));

  const [rows] = await db.execute<Row[]>(
    `SELECT a.account_code, l.division_id, l.branch_id,
            SUM(l.debit) AS debit, SUM(l.credit) AS credit
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED'
       AND j.entry_date BETWEEN ? AND ?
       AND a.account_code >= '4'
     GROUP BY a.account_code, l.division_id, l.branch_id`,
    [businessId, from, to]
  );
  const lines: LedgerTotal[] = rows.map((r) => ({
    accountCode: String(r.account_code),
    divisionId: r.division_id === null ? null : Number(r.division_id),
    branchId: r.branch_id === null ? null : Number(r.branch_id),
    debit: toPaise(r.debit),
    credit: toPaise(r.credit),
  }));

  return profitByScope(lines, divisionOfBranch).map((s) => ({
    ...s,
    depth: s.scope === "GROUP" ? 0 : s.scope === "DIVISION" ? 1 : 2,
    label:
      s.scope === "GROUP"
        ? "Group (all)"
        : s.scope === "DIVISION"
          ? `Division: ${divisionName.get(s.divisionId!) ?? s.divisionId}`
          : `Branch: ${branchName.get(s.branchId!) ?? s.branchId}`,
  }));
}

export type BalanceReport = {
  accounts: { code: string; name: string; subtype: string; debit: bigint; credit: bigint }[];
  names: Map<string, string>;
  sheet: BalanceSheet;
};

export async function getBalanceReport(db: Pool, businessId: number, to: string): Promise<BalanceReport> {
  const [rows] = await db.execute<Row[]>(
    `SELECT a.account_code, a.account_name, a.account_subtype,
            SUM(l.debit) AS debit, SUM(l.credit) AS credit
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date <= ?
     GROUP BY a.account_code, a.account_name, a.account_subtype
     ORDER BY a.account_code`,
    [businessId, to]
  );
  const accounts = rows.map((r) => ({
    code: String(r.account_code),
    name: String(r.account_name),
    subtype: String(r.account_subtype),
    debit: toPaise(r.debit),
    credit: toPaise(r.credit),
  }));
  return {
    accounts,
    names: new Map(accounts.map((a) => [a.code, a.name])),
    sheet: balanceSheet(accounts.map((a) => ({ accountCode: a.code, debit: a.debit, credit: a.credit }))),
  };
}

export type DailyPoint = { date: string; sales: bigint; gross: bigint; operating: bigint };

/** Net sales, gross profit and operating profit for each day in the range (days with no entries are zero). */
export async function getDailySeries(
  db: Pool,
  businessId: number,
  from: string,
  to: string
): Promise<DailyPoint[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT DATE_FORMAT(j.entry_date, '%Y-%m-%d') AS d, a.account_code,
            SUM(l.debit) AS debit, SUM(l.credit) AS credit
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED'
       AND j.entry_date BETWEEN ? AND ? AND a.account_code >= '4'
     GROUP BY d, a.account_code`,
    [businessId, from, to]
  );

  const byDay = new Map<string, DailyPoint>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    byDay.set(date, { date, sales: 0n, gross: 0n, operating: 0n });
  }

  for (const r of rows) {
    const point = byDay.get(String(r.d));
    if (!point) continue;
    const code = String(r.account_code);
    const credit = toPaise(r.credit) - toPaise(r.debit);
    if (code === "4000") { point.sales += credit; point.gross += credit; }
    else if (code.startsWith("4")) { point.sales += credit; point.gross += credit; }
    else if (code.startsWith("5")) point.gross += credit;
    if (code.startsWith("6") && code !== "6900") point.operating += credit;
  }
  for (const p of byDay.values()) p.operating += p.gross;
  return [...byDay.values()];
}
