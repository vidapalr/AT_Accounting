"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { postDrafts } from "@/lib/ledger/post-drafts";
import { buildLedgerDrafts } from "@/lib/ledger/source-events";

const PAGE = "/accounting/reports";

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
