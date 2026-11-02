import "server-only";
import { randomBytes } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

export type AutoReverseResult =
  | { ok: true; reversed: number }
  | { ok: false; reason: "period-closed" | "failed"; journalNo?: string };

/**
 * Used when someone edits a record that is already in the books (like QuickBooks does).
 * Inside the caller's transaction (which must already hold the business-row lock), every live journal of the
 * record is reversed on its own date, so the old entry stays in the books as reversed and nothing is deleted.
 * The record then goes back to "waiting to be posted" and posts again with the new values.
 *
 * If the month of an entry is closed, nothing is changed and the caller shows a plain message.
 */
export async function autoReverseForEdit(
  conn: PoolConnection,
  o: { businessId: number; userId: number; sourceType: string; sourceId: number; reason: string }
): Promise<AutoReverseResult> {
  const [live] = await conn.execute<RowDataPacket[]>(
    `SELECT j.id, j.journal_no, DATE_FORMAT(j.entry_date, '%Y-%m-%d') AS entry_date
       FROM acct_journal_entries j
      WHERE j.legal_business_id = ? AND j.source_type = ? AND j.source_id = ? AND j.status = 'POSTED'
        AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r
                         WHERE r.legal_business_id = j.legal_business_id AND r.original_journal_id = j.id)
      ORDER BY j.id FOR UPDATE`,
    [o.businessId, o.sourceType, o.sourceId]
  );

  let reversed = 0;
  for (const original of live) {
    const date = String(original.entry_date);
    const [periods] = await conn.execute<RowDataPacket[]>(
      `SELECT p.id, p.status, y.id AS year_id,
              DATE_FORMAT(y.starts_on, '%Y') AS y1, DATE_FORMAT(y.ends_on, '%y') AS y2
         FROM acct_accounting_periods p
         JOIN acct_financial_years y ON y.legal_business_id = p.legal_business_id
          AND p.start_date >= y.starts_on AND p.end_date <= y.ends_on
        WHERE p.legal_business_id = ? AND p.start_date <= ? AND p.end_date >= ? FOR UPDATE`,
      [o.businessId, date, date]
    );
    const period = periods[0];
    if (!period || period.status !== "OPEN") return { ok: false, reason: "period-closed", journalNo: String(original.journal_no) };

    const [lines] = await conn.execute<RowDataPacket[]>(
      `SELECT line_no, account_id, division_id, branch_id, description,
              CAST(debit AS CHAR) AS debit, CAST(credit AS CHAR) AS credit
         FROM acct_journal_lines WHERE journal_entry_id = ? AND legal_business_id = ? ORDER BY line_no FOR UPDATE`,
      [original.id, o.businessId]
    );
    if (lines.length < 2) return { ok: false, reason: "failed" };

    const draftNo = "R-" + randomBytes(16).toString("hex");
    const [created] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_journal_entries
         (legal_business_id, financial_year_id, accounting_period_id, journal_no, entry_date, description,
          source_type, source_id, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'JOURNAL_REVERSAL', ?, 'DRAFT', ?)`,
      [o.businessId, period.year_id, period.id, draftNo, date,
       `Reversal of ${original.journal_no}: ${o.reason}`.slice(0, 500), original.id, o.userId]
    );
    const reversalId = created.insertId;
    for (const l of lines) {
      await conn.execute(
        `INSERT INTO acct_journal_lines
           (journal_entry_id, legal_business_id, line_no, account_id, division_id, branch_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reversalId, o.businessId, l.line_no, l.account_id, l.division_id, l.branch_id, l.description, l.credit, l.debit]
      );
    }

    await conn.execute(
      `INSERT INTO acct_journal_post_sequences (legal_business_id, financial_year_id, last_number)
       VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE last_number = last_number`,
      [o.businessId, period.year_id]
    );
    const [seq] = await conn.execute<RowDataPacket[]>(
      `SELECT last_number FROM acct_journal_post_sequences WHERE legal_business_id = ? AND financial_year_id = ? FOR UPDATE`,
      [o.businessId, period.year_id]
    );
    const next = BigInt(seq[0].last_number) + 1n;
    if (next > 999999n) return { ok: false, reason: "failed" };
    const postedNo = `AG-JV-${period.y1}-${period.y2}-` + next.toString().padStart(6, "0");
    const [clash] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_journal_entries WHERE legal_business_id = ? AND journal_no = ? LIMIT 1`,
      [o.businessId, postedNo]
    );
    if (clash.length) return { ok: false, reason: "failed" };
    await conn.execute(
      `UPDATE acct_journal_post_sequences SET last_number = ? WHERE legal_business_id = ? AND financial_year_id = ?`,
      [next.toString(), o.businessId, period.year_id]
    );
    const [posted] = await conn.execute<ResultSetHeader>(
      `UPDATE acct_journal_entries SET journal_no = ?, draft_reference = ?, status = 'POSTED', posted_by = ?, posted_at = CURRENT_TIMESTAMP
        WHERE id = ? AND legal_business_id = ? AND status = 'DRAFT'`,
      [postedNo, draftNo, o.userId, reversalId, o.businessId]
    );
    if (posted.affectedRows !== 1) return { ok: false, reason: "failed" };
    await conn.execute(
      `INSERT INTO acct_journal_reversals (legal_business_id, original_journal_id, reversal_journal_id, reversal_reason, reversed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [o.businessId, original.id, reversalId, o.reason, o.userId]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'JOURNAL_REVERSED', 'JOURNAL', ?, ?)`,
      [o.businessId, o.userId, original.id, JSON.stringify({
        original_journal_no: original.journal_no, reversal_journal_id: reversalId, reversal_journal_no: postedNo,
        reversal_date: date, reason: o.reason, automatic: true,
      })]
    );
    reversed += 1;
  }
  return { ok: true, reversed };
}
