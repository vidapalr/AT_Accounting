import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { toPaise } from "@/lib/reports/money";
import type { ReconLine } from "@/lib/bank-reconcile";

type Q = Pool | PoolConnection;

export type ReconBank = { id: number; name: string; glAccountId: number | null };
export type ReconCheck = { date: string; bankBalance: bigint; tickedBalance: bigint; booksBalance: bigint };

export async function loadReconBanks(q: Q, businessId: number): Promise<ReconBank[]> {
  const [rows] = await q.execute<RowDataPacket[]>(
    `SELECT id, COALESCE(NULLIF(account_label, ''), bank_name) AS name, account_number_last4, gl_account_id
       FROM acct_bank_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY bank_name, id`,
    [businessId]
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: `${String(r.name)}${r.account_number_last4 ? ` ••••${String(r.account_number_last4)}` : ""}`,
    glAccountId: r.gl_account_id == null ? null : Number(r.gl_account_id),
  }));
}

/**
 * Every entry on the bank's ledger account, ticked or not. A wrong entry and its reversal cancel out,
 * so both are left out. An entry matched from an uploaded statement file counts as ticked.
 */
export async function loadReconLines(q: Q, businessId: number, bank: ReconBank): Promise<{ ready: boolean; lines: ReconLine[]; lastCheck: ReconCheck | null }> {
  if (!bank.glAccountId) return { ready: true, lines: [], lastCheck: null };
  let ticked = new Set<number>();
  let lastCheck: ReconCheck | null = null;
  try {
    const [t] = await q.execute<RowDataPacket[]>(
      `SELECT journal_line_id FROM acct_bank_reconcile_ticks WHERE legal_business_id = ? AND bank_account_id = ?`, [businessId, bank.id]);
    ticked = new Set(t.map((r) => Number(r.journal_line_id)));
    const [c] = await q.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(statement_date, '%Y-%m-%d') AS d, statement_balance, ticked_balance, books_balance
         FROM acct_bank_reconcile_checks WHERE legal_business_id = ? AND bank_account_id = ? ORDER BY statement_date DESC, id DESC LIMIT 1`,
      [businessId, bank.id]);
    if (c[0]) lastCheck = { date: String(c[0].d), bankBalance: toPaise(String(c[0].statement_balance)), tickedBalance: toPaise(String(c[0].ticked_balance)), booksBalance: toPaise(String(c[0].books_balance)) };
  } catch {
    return { ready: false, lines: [], lastCheck: null }; // 100_bank_reconcile not run yet
  }
  try {
    const [m] = await q.execute<RowDataPacket[]>(
      `SELECT journal_line_id FROM acct_bank_statement_lines
        WHERE legal_business_id = ? AND bank_account_id = ? AND status = 'MATCHED' AND journal_line_id IS NOT NULL`, [businessId, bank.id]);
    for (const r of m) ticked.add(Number(r.journal_line_id));
  } catch { /* no uploaded statements */ }

  const [rows] = await q.execute<RowDataPacket[]>(
    `SELECT jl.id, DATE_FORMAT(je.entry_date, '%Y-%m-%d') AS d, je.journal_no, je.source_type,
            COALESCE(NULLIF(jl.description, ''), je.description) AS descr, jl.debit, jl.credit
       FROM acct_journal_lines jl
       JOIN acct_journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.legal_business_id = ? AND jl.account_id = ? AND je.status = 'POSTED'
        AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r WHERE r.original_journal_id = je.id OR r.reversal_journal_id = je.id)
      ORDER BY je.entry_date, jl.id`,
    [businessId, bank.glAccountId]
  );
  return {
    ready: true,
    lastCheck,
    lines: rows.map((r) => ({
      id: Number(r.id), date: String(r.d),
      text: `${String(r.source_type) === "OPENING_BALANCE" ? "Opening balance" : String(r.descr ?? "")} · ${String(r.journal_no)}`,
      moneyIn: toPaise(String(r.debit)), moneyOut: toPaise(String(r.credit)), ticked: ticked.has(Number(r.id)),
    })),
  };
}
