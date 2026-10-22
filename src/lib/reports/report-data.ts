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

export type ExpenseLine = { code: string; name: string; amount: bigint; setup: boolean };

/** Expenses in the range by account, so a profit figure can be traced to what was paid for. */
export async function getExpenseBreakdown(
  db: Pool,
  businessId: number,
  from: string,
  to: string
): Promise<ExpenseLine[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT a.account_code, a.account_name, SUM(l.debit) - SUM(l.credit) AS amount
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     JOIN acct_chart_of_accounts a
       ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED'
       AND j.entry_date BETWEEN ? AND ? AND a.account_code >= '6'
     GROUP BY a.account_code, a.account_name
     HAVING amount <> 0
     ORDER BY a.account_code`,
    [businessId, from, to]
  );
  return rows.map((r) => ({
    code: String(r.account_code),
    name: String(r.account_name),
    amount: toPaise(r.amount),
    setup: String(r.account_code) === "6900",
  }));
}

export type AccountPosition = {
  id: number;
  label: string;
  detail: string;
  /** Balance from posted journals. */
  posted: bigint;
  /** Opening balance entered but not yet posted to the ledger. */
  openingPending: bigint;
  /** What is really there now: posted plus pending opening. */
  balance: bigint;
};

export type InvestorBankPosition = {
  id: number;
  label: string;
  detail: string;
  opening: bigint;
  deposits: bigint;
  received: bigint;
  paidOut: bigint;
  balance: bigint;
};

export type AccountPositions = {
  banks: AccountPosition[];
  cash: AccountPosition[];
  investorBanks: InvestorBankPosition[];
  openingBatchPosted: boolean;
  openingPendingTotal: bigint;
};

/** Current balance of every bank and cash account, and the movement through each investor bank account. */
export async function getAccountPositions(
  db: Pool,
  businessId: number,
  asOf: string
): Promise<AccountPositions> {
  const one = async (sql: string, values: unknown[]): Promise<Map<number, bigint>> => {
    const [rows] = await db.execute<Row[]>(sql, values as (string | number)[]);
    return new Map(rows.map((r) => [Number(r.k), toPaise(r.v)]));
  };

  const posted = await one(
    `SELECT l.account_id AS k, SUM(l.debit) - SUM(l.credit) AS v
     FROM acct_journal_lines l
     JOIN acct_journal_entries j
       ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
     WHERE l.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date <= ?
     GROUP BY l.account_id`,
    [businessId, asOf]
  );

  const [batches] = await db.execute<Row[]>(
    `SELECT id, status FROM acct_opening_balance_batches
     WHERE legal_business_id = ? AND status NOT IN ('CANCELLED', 'REJECTED', 'VOID')`,
    [businessId]
  );
  const unposted = batches.filter((b) => String(b.status) !== "POSTED");
  const openingBatchPosted = batches.length > 0 && unposted.length === 0;
  const pending = new Map<number, bigint>();
  if (unposted.length > 0) {
    const ids = unposted.map((b) => Number(b.id));
    const [lines] = await db.execute<Row[]>(
      `SELECT account_id AS k, SUM(debit) - SUM(credit) AS v
       FROM acct_opening_balance_lines
       WHERE legal_business_id = ? AND batch_id IN (${ids.map(() => "?").join(",")})
       GROUP BY account_id`,
      [businessId, ...ids]
    );
    for (const r of lines) pending.set(Number(r.k), toPaise(r.v));
  }

  const position = (glId: number | null, label: string, detail: string, id: number): AccountPosition => {
    const p = glId === null ? 0n : posted.get(glId) ?? 0n;
    const o = glId === null ? 0n : pending.get(glId) ?? 0n;
    return { id, label, detail, posted: p, openingPending: o, balance: p + o };
  };

  const [bankRows] = await db.execute<Row[]>(
    `SELECT id, ownership_type, account_label, bank_name, account_number_last4, gl_account_id
     FROM acct_bank_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY id`,
    [businessId]
  );
  const [cashRows] = await db.execute<Row[]>(
    `SELECT id, cash_name, custodian_name, gl_account_id
     FROM acct_cash_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY id`,
    [businessId]
  );

  const banks = bankRows
    .filter((b) => b.ownership_type === "BUSINESS")
    .map((b) =>
      position(
        b.gl_account_id === null ? null : Number(b.gl_account_id),
        String(b.account_label),
        `${b.bank_name}${b.account_number_last4 ? ` ····${b.account_number_last4}` : ""}`,
        Number(b.id)
      )
    );
  const cash = cashRows.map((c) =>
    position(
      c.gl_account_id === null ? null : Number(c.gl_account_id),
      String(c.cash_name),
      c.custodian_name ? `Held by ${c.custodian_name}` : "Cash",
      Number(c.id)
    )
  );

  // Investor bank accounts are not in the ledger by account (that money is
  // investor capital), so work out what moved through each from the records.
  const investorBanks: InvestorBankPosition[] = [];
  for (const b of bankRows.filter((r) => r.ownership_type === "INVESTOR")) {
    const id = Number(b.id);
    const sum = async (sql: string) => {
      const [rows] = await db.execute<Row[]>(sql, [businessId, id, asOf]);
      return toPaise(rows[0]?.v ?? 0);
    };
    const opening = await sum(
      `SELECT COALESCE(SUM(opening_amount), 0) AS v FROM acct_opening_investor_bank_balances
       WHERE legal_business_id = ? AND bank_account_id = ? AND ? IS NOT NULL`
    );
    const deposits =
      (await sum(
        `SELECT COALESCE(SUM(amount), 0) AS v FROM acct_funding_transactions
         WHERE legal_business_id = ? AND bank_account_id = ? AND transaction_date <= ?
           AND status = 'VERIFIED' AND transaction_type = 'FUNDING_RECEIVED'`
      )) -
      (await sum(
        `SELECT COALESCE(SUM(amount), 0) AS v FROM acct_funding_transactions
         WHERE legal_business_id = ? AND bank_account_id = ? AND transaction_date <= ?
           AND status = 'VERIFIED' AND transaction_type IN ('PRINCIPAL_REPAID', 'RETURN_PAID')`
      ));
    const received =
      (await sum(
        `SELECT COALESCE(SUM(p.amount), 0) AS v FROM acct_sales_payments p
         JOIN acct_sales_headers s ON s.id = p.sale_id AND s.legal_business_id = p.legal_business_id
         WHERE p.legal_business_id = ? AND p.bank_account_id = ? AND p.payment_date <= ?
           AND p.status = 'RECORDED' AND s.status = 'POSTED'`
      )) -
      (await sum(
        `SELECT COALESCE(SUM(f.amount), 0) AS v FROM acct_sales_refunds f
         WHERE f.legal_business_id = ? AND f.bank_account_id = ? AND f.refund_date <= ?
           AND f.status = 'RECORDED'`
      ));
    const paidOut =
      (await sum(
        `SELECT COALESCE(SUM(p.amount), 0) AS v FROM acct_purchase_payments p
         WHERE p.legal_business_id = ? AND p.source_bank_account_id = ? AND p.payment_date <= ?
           AND p.status = 'VERIFIED'`
      )) +
      (await sum(
        `SELECT COALESCE(SUM(p.amount), 0) AS v FROM acct_expense_payments p
         WHERE p.legal_business_id = ? AND p.bank_account_id = ? AND p.payment_date <= ?
           AND p.status = 'RECORDED'`
      )) +
      (await sum(
        `SELECT COALESCE(SUM(t.amount), 0) AS v FROM acct_advance_transactions t
         WHERE t.legal_business_id = ? AND t.bank_account_id = ? AND t.transaction_date <= ?
           AND t.status = 'CONFIRMED' AND t.transaction_type = 'ADVANCE_PAID'`
      ));
    investorBanks.push({
      id,
      label: String(b.account_label),
      detail: `${b.bank_name}${b.account_number_last4 ? ` ····${b.account_number_last4}` : ""}`,
      opening,
      deposits,
      received,
      paidOut,
      balance: opening + deposits + received - paidOut,
    });
  }

  return {
    banks,
    cash,
    investorBanks,
    openingBatchPosted,
    openingPendingTotal: [...pending.values()].reduce((s, v) => s + (v > 0n ? v : 0n), 0n),
  };
}
