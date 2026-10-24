/**
 * Writes journal drafts into the ledger as POSTED journals.
 *
 * The caller owns the transaction (BEGIN / COMMIT / ROLLBACK) so a whole
 * backfill is all-or-nothing. A record that already has a posted (or
 * reversed) journal is skipped, so running twice never doubles anything.
 */
import type { Connection, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";

import { formatMoney, type JournalDraft } from "./posting-rules.ts";
import type { ChartAccount } from "./source-events.ts";

type Row = RowDataPacket & Record<string, unknown>;

export type PostResult = {
  posted: { journalId: number; journalNo: string; draft: JournalDraft }[];
  skipped: JournalDraft[];
};

export async function postDrafts(
  conn: PoolConnection | Connection,
  input: {
    businessId: number;
    userId: number;
    drafts: JournalDraft[];
    chart: Map<string, ChartAccount>;
    auditAction: string;
  }
): Promise<PostResult> {
  const { businessId, userId, drafts, chart } = input;
  const result: PostResult = { posted: [], skipped: [] };

  const [years] = await conn.execute<Row[]>(
    `SELECT id, status,
            DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
            DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on
     FROM acct_financial_years WHERE legal_business_id = ?`,
    [businessId]
  );
  const [periods] = await conn.execute<Row[]>(
    `SELECT id, status,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
     FROM acct_accounting_periods WHERE legal_business_id = ?`,
    [businessId]
  );

  // Check everything we can before writing anything.
  const plan = drafts.map((draft) => {
    const year = years.find(
      (y) => draft.entryDate >= String(y.starts_on) && draft.entryDate <= String(y.ends_on)
    );
    const period = periods.find(
      (p) => draft.entryDate >= String(p.start_date) && draft.entryDate <= String(p.end_date)
    );
    const label = `${draft.sourceType} ${draft.sourceId} (${draft.entryDate})`;
    if (!year || year.status !== "OPEN") throw new Error(`${label}: financial year is not open`);
    if (!period || period.status !== "OPEN") {
      throw new Error(`${label}: accounting period is not open`);
    }
    return { draft, year, period };
  });

  for (const { draft, year, period } of plan) {
    // Serialise numbering and the "already posted?" check per business.
    await conn.execute(
      `INSERT INTO acct_journal_post_sequences (legal_business_id, financial_year_id, last_number)
       VALUES (?, ?, 0)
       ON DUPLICATE KEY UPDATE last_number = last_number`,
      [businessId, year.id]
    );
    const [seq] = await conn.execute<Row[]>(
      `SELECT last_number FROM acct_journal_post_sequences
       WHERE legal_business_id = ? AND financial_year_id = ? FOR UPDATE`,
      [businessId, year.id]
    );

    const [existing] = await conn.execute<Row[]>(
      `SELECT id FROM acct_journal_entries
       WHERE legal_business_id = ? AND source_type = ? AND source_id = ?
         AND status = 'POSTED' LIMIT 1`,
      [businessId, draft.sourceType, draft.sourceId]
    );
    if (existing.length > 0) {
      result.skipped.push(draft);
      continue;
    }

    const draftRef = `DRF-${randomBytes(8).toString("hex")}`;
    const [header] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_journal_entries
         (legal_business_id, financial_year_id, accounting_period_id, journal_no,
          entry_date, description, source_type, source_id, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [
        businessId, year.id, period.id, draftRef, draft.entryDate,
        draft.description.slice(0, 500), draft.sourceType, draft.sourceId, userId,
      ]
    );
    const journalId = header.insertId;

    let lineNo = 0;
    for (const line of draft.lines) {
      lineNo += 1;
      const account = chart.get(line.accountCode);
      if (!account) throw new Error(`Account ${line.accountCode} not found`);
      await conn.execute(
        `INSERT INTO acct_journal_lines
           (journal_entry_id, legal_business_id, line_no, account_id,
            division_id, branch_id, description, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journalId, businessId, lineNo, account.id, line.divisionId, line.branchId,
          line.memo.slice(0, 500), formatMoney(line.debit), formatMoney(line.credit),
        ]
      );
    }

    // The database must agree that the entry balances before it is posted.
    const [sums] = await conn.execute<Row[]>(
      `SELECT SUM(debit) AS d, SUM(credit) AS c FROM acct_journal_lines
       WHERE journal_entry_id = ? AND legal_business_id = ?`,
      [journalId, businessId]
    );
    if (String(sums[0].d) !== String(sums[0].c)) {
      throw new Error(`${draft.description}: stored lines do not balance`);
    }

    const next = BigInt(seq[0].last_number as string | number) + 1n;
    const label = `${String(year.starts_on).slice(0, 4)}-${String(year.ends_on).slice(2, 4)}`;
    const journalNo = `AG-JV-${label}-${next.toString().padStart(6, "0")}`;

    await conn.execute(
      `UPDATE acct_journal_post_sequences SET last_number = ?
       WHERE legal_business_id = ? AND financial_year_id = ?`,
      [next.toString(), businessId, year.id]
    );
    const [posted] = await conn.execute<ResultSetHeader>(
      `UPDATE acct_journal_entries
       SET journal_no = ?, draft_reference = ?, status = 'POSTED',
           posted_by = ?, posted_at = CURRENT_TIMESTAMP
       WHERE id = ? AND legal_business_id = ? AND status = 'DRAFT'`,
      [journalNo, draftRef, userId, journalId, businessId]
    );
    if (posted.affectedRows !== 1) throw new Error(`${journalNo}: could not be posted`);

    await conn.execute(
      `INSERT INTO acct_audit_events
         (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, ?, 'JOURNAL', ?, ?)`,
      [
        businessId, userId, input.auditAction, journalId,
        JSON.stringify({ journalNo, sourceType: draft.sourceType, sourceId: draft.sourceId }),
      ]
    );

    result.posted.push({ journalId, journalNo, draft });
  }

  return result;
}
