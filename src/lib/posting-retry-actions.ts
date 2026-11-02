"use server";

import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { autoPostPending } from "@/lib/ledger/auto-post";

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
