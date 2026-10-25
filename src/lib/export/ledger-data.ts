import "server-only";
import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

import type { ExportAccount, ExportJournal } from "@/lib/export/tally";
import { toPaise } from "@/lib/reports/money";

type Row = RowDataPacket & Record<string, string | number | null>;

/** Posted journals (with their lines) dated within the range, oldest first. */
export async function loadJournals(db: Pool, businessId: number, from: string, to: string): Promise<ExportJournal[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT j.id, j.journal_no, DATE_FORMAT(j.entry_date, '%Y-%m-%d') AS d, j.source_type, j.description AS j_desc,
            l.line_no, l.description AS l_desc, l.debit, l.credit, a.account_code, a.account_name
       FROM acct_journal_entries j
       JOIN acct_journal_lines l ON l.journal_entry_id = j.id AND l.legal_business_id = j.legal_business_id
       JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
      WHERE j.legal_business_id = ? AND j.status = 'POSTED' AND j.entry_date BETWEEN ? AND ?
      ORDER BY j.entry_date, j.id, l.line_no`,
    [businessId, from, to]
  );
  const out: ExportJournal[] = [];
  let current: ExportJournal | null = null;
  let currentId = -1;
  for (const r of rows) {
    if (Number(r.id) !== currentId) {
      currentId = Number(r.id);
      current = {
        journalNo: String(r.journal_no),
        date: String(r.d),
        sourceType: r.source_type === null ? null : String(r.source_type),
        description: String(r.j_desc ?? ""),
        lines: [],
      };
      out.push(current);
    }
    current!.lines.push({
      accountCode: String(r.account_code),
      accountName: String(r.account_name),
      debitPaise: toPaise(r.debit),
      creditPaise: toPaise(r.credit),
      memo: String(r.l_desc ?? ""),
    });
  }
  return out;
}

export async function loadAccounts(db: Pool, businessId: number): Promise<ExportAccount[]> {
  const [rows] = await db.execute<Row[]>(
    `SELECT account_code, account_name, account_type FROM acct_chart_of_accounts
      WHERE legal_business_id = ? AND is_posting_account = 1 ORDER BY account_code`,
    [businessId]
  );
  return rows.map((r) => ({ code: String(r.account_code), name: String(r.account_name), type: String(r.account_type) }));
}
