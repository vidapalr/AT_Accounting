"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { cleanTerms, DEFAULT_TERMS } from "@/lib/bill-terms-text";

const PAGE = "/accounting/bill-terms";

export async function saveBillTermsAction(form: FormData) {
  const owner = await requireGroupOwner();
  const reset = form.get("reset") === "1";
  const body = reset ? DEFAULT_TERMS : cleanTerms(String(form.get("body") ?? ""));
  if (!body) redirect(`${PAGE}?error=${encodeURIComponent("Write at least one term, or press the reset button.")}`);
  try {
    await db.execute(
      `INSERT INTO acct_bill_terms (legal_business_id, body, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE body = VALUES(body), updated_by = VALUES(updated_by)`,
      [owner.legal_business_id, body, owner.id]);
  } catch {
    redirect(`${PAGE}?error=${encodeURIComponent("Not set up yet: run the database file 066_bill_terms first.")}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?saved=${encodeURIComponent(reset ? "Terms put back to the standard two." : "Terms saved. They print on every new bill.")}`);
}
