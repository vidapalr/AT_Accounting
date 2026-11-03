import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { matchStatement, type BookLine } from "@/lib/bank-statement";

type Q = Pool | PoolConnection;

const paise = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/**
 * Book lines on a bank's ledger account that could be matched: posted, not reversed, not a reversal,
 * between the two dates, and not already used by a matched statement line.
 */
export async function loadBookLines(q: Q, businessId: number, glAccountId: number, from: string, to: string, bankAccountId: number): Promise<BookLine[]> {
  const [rows] = await q.execute<RowDataPacket[]>(
    `SELECT jl.id, DATE_FORMAT(je.entry_date, '%Y-%m-%d') AS d, COALESCE(jl.description, je.description) AS descr, jl.debit, jl.credit
       FROM acct_journal_lines jl
       JOIN acct_journal_entries je ON je.id = jl.journal_entry_id
      WHERE jl.legal_business_id = ? AND jl.account_id = ? AND je.status = 'POSTED'
        AND je.entry_date BETWEEN DATE_SUB(?, INTERVAL 3 DAY) AND DATE_ADD(?, INTERVAL 3 DAY)
        AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r
                         WHERE r.original_journal_id = je.id OR r.reversal_journal_id = je.id)
        AND NOT EXISTS (SELECT 1 FROM acct_bank_statement_lines s
                         WHERE s.journal_line_id = jl.id AND s.status = 'MATCHED')
      ORDER BY je.entry_date, jl.id`,
    [businessId, glAccountId, from, to]
  );
  void bankAccountId;
  return rows.map((r) => ({ id: Number(r.id), date: String(r.d), description: String(r.descr ?? ""), debit: paise(r.debit), credit: paise(r.credit) }));
}

/** Match every unmatched statement line of one bank account. Returns how many were matched. */
export async function runMatching(q: Q, businessId: number, bankAccountId: number): Promise<number> {
  const [acc] = await q.execute<RowDataPacket[]>(
    `SELECT gl_account_id FROM acct_bank_accounts WHERE legal_business_id = ? AND id = ?`, [businessId, bankAccountId]);
  const gl = Number(acc[0]?.gl_account_id ?? 0);
  if (!gl) return 0;
  const [open] = await q.execute<RowDataPacket[]>(
    `SELECT id, DATE_FORMAT(line_date, '%Y-%m-%d') AS d, money_out, money_in FROM acct_bank_statement_lines
      WHERE legal_business_id = ? AND bank_account_id = ? AND status = 'UNMATCHED' ORDER BY line_date, id`,
    [businessId, bankAccountId]);
  if (open.length === 0) return 0;
  const lines = open.map((r) => ({ date: String(r.d), description: "", moneyOut: paise(r.money_out), moneyIn: paise(r.money_in), balance: null }));
  const books = await loadBookLines(q, businessId, gl, lines[0].date, lines[lines.length - 1].date, bankAccountId);
  const pairs = matchStatement(lines, books);
  for (const p of pairs) {
    await q.execute(
      `UPDATE acct_bank_statement_lines SET status = 'MATCHED', journal_line_id = ? WHERE id = ? AND status = 'UNMATCHED'`,
      [p.bookId, Number(open[p.statementIndex].id)]
    );
  }
  return pairs.length;
}
