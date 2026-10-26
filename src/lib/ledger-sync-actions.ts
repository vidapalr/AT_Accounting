"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { postDrafts } from "@/lib/ledger/post-drafts";
import { buildLedgerDrafts } from "@/lib/ledger/source-events";

const PAGE = "/accounting/reports";

/** Owner switch for automatic posting. */
export async function setAutoPostAction(formData: FormData) {
  const user = await requireGroupOwner();
  const on = String(formData.get("mode") ?? "") === "ON";
  await db.execute(
    `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
     VALUES (?, 'auto_post_ledger', ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [user.legal_business_id, on ? "ON" : "OFF", user.id]
  );
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'AUTO_POST_SWITCHED', 'SETTING', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify({ mode: on ? "ON" : "OFF" })]
  );
  revalidatePath(PAGE);
  redirect(PAGE);
}

/**
 * Posts every record that has no journal yet. Owner only. All-or-nothing:
 * if any record cannot be posted (for example the period is closed), nothing
 * is posted and the reason is shown.
 */
export async function postPendingEntriesAction() {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  let message = "";
  const conn = await db.getConnection();
  try {
    const built = await buildLedgerDrafts(conn, businessId);
    if (built.problems.length > 0) {
      message = `error=${encodeURIComponent(`Cannot post: ${built.problems[0]}`)}`;
    } else {
      await conn.beginTransaction();
      try {
        const result = await postDrafts(conn, {
          businessId,
          userId: user.id,
          drafts: built.drafts.filter((d) => d.sourceType !== "OPENING_BALANCE"),
          chart: built.chart,
          auditAction: "LEDGER_SYNC_POSTED",
        });
        await conn.commit();
        message = `posted=${result.posted.length}`;
      } catch (error) {
        await conn.rollback();
        const text = error instanceof Error ? error.message : "Posting failed";
        message = `error=${encodeURIComponent(text.slice(0, 200))}`;
      }
    }
  } finally {
    conn.release();
  }

  revalidatePath(PAGE);
  revalidatePath("/accounting/journals");
  redirect(`${PAGE}?${message}`);
}
