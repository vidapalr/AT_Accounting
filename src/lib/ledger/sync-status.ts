/**
 * Compares the operational records with the posted ledger.
 * Read-only; takes any mysql2 connection or pool.
 */
import type { RowDataPacket } from "mysql2/promise";

import { formatMoney, type JournalDraft } from "./posting-rules.ts";
import { buildLedgerDrafts, type Queryable } from "./source-events.ts";

export type SyncStatus = {
  /** Records with no journal yet. */
  pending: JournalDraft[];
  /** Posted, but the record has since been changed. */
  changedAfterPosting: string[];
  /** Posted, but the record is no longer valid (voided, deleted, unposted). */
  noLongerValid: string[];
  /** Records the ledger cannot understand yet. */
  problems: string[];
  warnings: string[];
};

const OUR_SOURCES = [
  "DEPOSIT_PAID", "DEPOSIT_REFUND", "EXPENSE", "EXPENSE_PAYMENT",
  "PURCHASE_RECEIPT", "PURCHASE_PAYMENT", "SALES_INVOICE", "SALES_RECEIPT",
];

type Row = RowDataPacket & Record<string, unknown>;

const keyOf = (type: string, id: number) => `${type}#${id}`;
const signature = (lines: { code: string; debit: string; credit: string }[]) =>
  lines.map((l) => `${l.code}|${l.debit}|${l.credit}`).sort().join(";");

export async function getSyncStatus(conn: Queryable, businessId: number): Promise<SyncStatus> {
  const built = await buildLedgerDrafts(conn, businessId);
  const drafts = built.drafts.filter((d) => d.sourceType !== "OPENING_BALANCE");

  const [rows] = await (conn as { query: (s: string, v: unknown[]) => Promise<[Row[], unknown]> }).query(
    `SELECT j.id, j.journal_no, j.source_type, j.source_id,
            a.account_code, l.debit, l.credit
     FROM acct_journal_entries j
     JOIN acct_journal_lines l ON l.journal_entry_id = j.id AND l.legal_business_id = j.legal_business_id
     JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
     WHERE j.legal_business_id = ? AND j.status IN ('POSTED', 'REVERSED')
       AND j.source_type IN (${OUR_SOURCES.map(() => "?").join(",")})`,
    [businessId, ...OUR_SOURCES]
  );

  const posted = new Map<string, { journalNo: string; lines: { code: string; debit: string; credit: string }[] }>();
  for (const r of rows) {
    const key = keyOf(String(r.source_type), Number(r.source_id));
    const entry = posted.get(key) ?? { journalNo: String(r.journal_no), lines: [] };
    entry.lines.push({ code: String(r.account_code), debit: String(r.debit), credit: String(r.credit) });
    posted.set(key, entry);
  }

  const status: SyncStatus = {
    pending: [], changedAfterPosting: [], noLongerValid: [],
    problems: built.problems, warnings: built.warnings,
  };
  const seen = new Set<string>();

  for (const draft of drafts) {
    const key = keyOf(draft.sourceType, draft.sourceId);
    seen.add(key);
    const existing = posted.get(key);
    if (!existing) {
      status.pending.push(draft);
      continue;
    }
    // Compare only the non-zero side of each line.
    const want = signature(
      draft.lines.map((l) => ({
        code: l.accountCode, debit: formatMoney(l.debit), credit: formatMoney(l.credit),
      }))
    );
    if (want !== signature(existing.lines)) {
      status.changedAfterPosting.push(`${existing.journalNo}: ${draft.description}`);
    }
  }

  for (const [key, entry] of posted) {
    if (!seen.has(key)) status.noLongerValid.push(`${entry.journalNo} (${key})`);
  }

  return status;
}
