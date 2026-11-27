"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { autoPostPending } from "@/lib/ledger/auto-post";
import { getSyncStatus } from "@/lib/ledger/sync-status";
import { autoReverseForEdit } from "@/lib/ledger/reverse-in-tx";

/** Owner presses "Try again now": posts everything that is waiting, even when automatic posting is off. */
export async function retryPostingAction(): Promise<void> {
  const user = await requireGroupOwner();
  let note: string;
  try {
    const r = await autoPostPending(db, user.legal_business_id, { manual: true });
    if (r.busy) note = "busy";
    else note = `posted-${r.posted}-failed-${r.failed ?? 0}`;
  } catch {
    note = "error";
  }
  redirect(`/accounting/health?retry=${note}`);
}

/**
 * Owner presses "Put these right": every posted entry whose record was cancelled or changed afterwards is
 * reversed on its own date (kept in the books, marked reversed). A changed record then posts again with
 * its new figures. Entries in a closed month are left, and the page says which.
 */
export async function reverseStaleEntriesAction(): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  let reversed = 0;
  const closed: string[] = [];
  let failed = false;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`SELECT id FROM acct_legal_businesses WHERE id = ? FOR UPDATE`, [businessId]);
    const sync = await getSyncStatus(conn, businessId);
    for (const s of sync.stale) {
      const r = await autoReverseForEdit(conn, {
        businessId, userId: user.id, sourceType: s.sourceType, sourceId: s.sourceId,
        reason: s.changed ? "Record changed after it was posted" : "Record cancelled after it was posted",
      });
      if (r.ok) reversed += r.reversed;
      else if (r.reason === "period-closed") closed.push(r.journalNo ?? s.journalNo);
      else { failed = true; break; }
    }
    if (failed) await conn.rollback();
    else await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Reversing stale entries failed:", error);
    failed = true;
  } finally {
    conn.release();
  }
  if (!failed && reversed > 0) {
    try { await autoPostPending(db, user.legal_business_id, { manual: true }); } catch { /* the 15-minute job posts them */ }
  }
  const note = failed ? "fix-error" : `fixed-${reversed}${closed.length ? `-closed-${closed.length}` : ""}`;
  redirect(`/accounting/health?retry=${note}${closed.length ? `&closed=${encodeURIComponent(closed.join(", ").slice(0, 300))}` : ""}`);
}
