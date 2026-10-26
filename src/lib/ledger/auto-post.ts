/**
 * Automatic posting. Switched OFF until the owner turns it on (Reports page).
 *
 * Safety rules:
 *  - only records that have NEVER had a journal are posted; anything that was posted and then
 *    reversed or changed is left for a person to decide;
 *  - each record is posted on its own, so one problem record never blocks the others;
 *  - a record with any problem (closed period, missing account, no bank/cash recorded) is skipped;
 *  - the journals are marked LEDGER_AUTO_POSTED in the audit trail.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

import { postDrafts } from "./post-drafts.ts";
import { buildLedgerDrafts } from "./source-events.ts";
import type { JournalDraft } from "./posting-rules.ts";

type Row = RowDataPacket & Record<string, unknown>;

export const AUTO_POST_KEY = "auto_post_ledger";
const THROTTLE_MS = 45_000;
const lastRun = new Map<number, number>();

export type AutoPostSummary = { enabled: boolean; posted: number; skipped: number; ran: boolean };

export async function isAutoPostOn(pool: Pool, businessId: number): Promise<boolean> {
  const [rows] = await pool.execute<Row[]>(
    `SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = ?`,
    [businessId, AUTO_POST_KEY]
  );
  return rows[0]?.setting_value === "ON";
}

/** Drafts that may be auto-posted: not flagged as a problem and never journalled before. */
export function pickAutoPostable(drafts: JournalDraft[], problems: string[], everJournalled: Set<string>): JournalDraft[] {
  return drafts.filter((d) => {
    if (d.sourceType === "OPENING_BALANCE") return false;
    if (everJournalled.has(`${d.sourceType}#${d.sourceId}`)) return false;
    const tag = `${d.sourceType} ${d.sourceId} `;
    return !problems.some((p) => p.startsWith(tag));
  });
}

export async function autoPostPending(pool: Pool, businessId: number, opts: { force?: boolean } = {}): Promise<AutoPostSummary> {
  if (!(await isAutoPostOn(pool, businessId))) return { enabled: false, posted: 0, skipped: 0, ran: false };
  const now = Date.now();
  if (!opts.force && now - (lastRun.get(businessId) ?? 0) < THROTTLE_MS) {
    return { enabled: true, posted: 0, skipped: 0, ran: false };
  }
  lastRun.set(businessId, now);

  const [owners] = await pool.execute<Row[]>(
    `SELECT u.id FROM acct_app_users u JOIN acct_user_access a ON a.user_id = u.id
      WHERE a.legal_business_id = ? AND a.role = 'GROUP_OWNER' ORDER BY u.id LIMIT 1`,
    [businessId]
  );
  if (owners.length === 0) return { enabled: true, posted: 0, skipped: 0, ran: false };
  const ownerId = Number(owners[0].id);

  const conn = await pool.getConnection();
  let posted = 0;
  let skipped = 0;
  try {
    const built = await buildLedgerDrafts(conn, businessId);
    const [done] = await conn.execute<Row[]>(
      `SELECT DISTINCT source_type, source_id FROM acct_journal_entries
        WHERE legal_business_id = ? AND source_type IS NOT NULL AND status = 'POSTED'`,
      [businessId]
    );
    const everJournalled = new Set(done.map((r) => `${r.source_type}#${r.source_id}`));
    const todo = pickAutoPostable(built.drafts, built.problems, everJournalled);
    skipped = built.drafts.filter((d) => d.sourceType !== "OPENING_BALANCE").length - todo.length;

    for (const draft of todo) {
      try {
        await conn.beginTransaction();
        const r = await postDrafts(conn, {
          businessId, userId: ownerId, drafts: [draft], chart: built.chart, auditAction: "LEDGER_AUTO_POSTED",
        });
        await conn.commit();
        posted += r.posted.length;
      } catch {
        await conn.rollback();
        skipped += 1; // closed period, missing account, etc. stays pending for a person to look at
      }
    }
  } finally {
    conn.release();
  }
  return { enabled: true, posted, skipped, ran: true };
}
