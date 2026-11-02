/**
 * Automatic posting. Switched OFF until the owner turns it on (Reports page).
 *
 * Safety rules:
 *  - only records that have NEVER had a journal are posted; anything that was posted and then
 *    reversed or changed is left for a person to decide. The one exception: a journal the app
 *    reversed itself because the record was edited (reason starts "Edited:") is posted again with the new values;
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

export type AutoPostSummary = { enabled: boolean; posted: number; skipped: number; ran: boolean; failed?: number; busy?: boolean };

/** Remember why a record could not be posted (ignored before migration 051). */
async function noteFailure(pool: Pool, businessId: number, d: JournalDraft, reason: string) {
  await pool.execute(
    `INSERT INTO acct_posting_failures (legal_business_id, source_type, source_id, reason)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), attempts = attempts + 1, last_failed_at = CURRENT_TIMESTAMP, resolved_at = NULL`,
    [businessId, d.sourceType, d.sourceId, reason.slice(0, 400)]
  ).catch(() => undefined);
}

async function noteSuccess(pool: Pool, businessId: number, d: JournalDraft) {
  await pool.execute(
    `UPDATE acct_posting_failures SET resolved_at = CURRENT_TIMESTAMP
      WHERE legal_business_id = ? AND source_type = ? AND source_id = ? AND resolved_at IS NULL`,
    [businessId, d.sourceType, d.sourceId]
  ).catch(() => undefined);
}

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

/**
 * `manual` = the owner pressed a button: run even when the automatic switch is off.
 * Only one run at a time across the whole server (a database lock), so a page visit, the timed call
 * and a button press can never post the same records together.
 */
export async function autoPostPending(pool: Pool, businessId: number, opts: { force?: boolean; manual?: boolean } = {}): Promise<AutoPostSummary> {
  if (!opts.manual && !(await isAutoPostOn(pool, businessId))) return { enabled: false, posted: 0, skipped: 0, ran: false };
  const now = Date.now();
  if (!opts.force && !opts.manual && now - (lastRun.get(businessId) ?? 0) < THROTTLE_MS) {
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
  let failed = 0;
  const lockName = `abhiram_autopost_${businessId}`;
  let locked = false;
  try {
    const [got] = await conn.query<Row[]>("SELECT GET_LOCK(?, 0) AS ok", [lockName]);
    locked = Number(got[0]?.ok) === 1;
    if (!locked) return { enabled: true, posted: 0, skipped: 0, ran: false, busy: true };
    const built = await buildLedgerDrafts(conn, businessId);
    const [done] = await conn.execute<Row[]>(
      `SELECT DISTINCT j.source_type, j.source_id FROM acct_journal_entries j
        WHERE j.legal_business_id = ? AND j.source_type IS NOT NULL AND j.status = 'POSTED'
          AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r
                           WHERE r.legal_business_id = j.legal_business_id AND r.original_journal_id = j.id
                             AND r.reversal_reason LIKE 'Edited:%')`,
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
        await noteSuccess(pool, businessId, draft);
      } catch (error) {
        await conn.rollback();
        skipped += 1; // closed period, missing account, etc. stays pending for a person to look at
        failed += 1;
        await noteFailure(pool, businessId, draft, error instanceof Error ? error.message : "Could not be posted.");
      }
    }
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
    conn.release();
  }
  return { enabled: true, posted, skipped, ran: true, failed };
}
