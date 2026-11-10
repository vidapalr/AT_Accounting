"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/owner-accounts";

/** Adds an owner account: a place that holds business money in the owner's name (a personal bank account, say). */
export async function createOwnerAccountAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const name = String(form.get("account_name") ?? "").trim().replace(/\s+/g, " ");
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  if (name.length < 2 || name.length > 100) redirect(`${PAGE}?error=${encodeURIComponent("Give the account a name, for example: My HDFC savings")}`);

  let message = `${PAGE}?saved=${encodeURIComponent(`Added ${name}.`)}`;
  try {
    await db.execute(
      `INSERT INTO acct_owner_accounts (legal_business_id, account_name, note, created_by) VALUES (?, ?, ?, ?)`,
      [user.legal_business_id, name, note || null, user.id]
    );
    await db.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'OWNER_ACCOUNT_ADDED', 'OWNER_ACCOUNT', 0, ?)`,
      [user.legal_business_id, user.id, JSON.stringify({ name })]
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    message = `${PAGE}?error=${encodeURIComponent(
      code === "ER_DUP_ENTRY" ? "You already have an account with that name."
        : code === "ER_NO_SUCH_TABLE" ? "Run the new database step (076_owner_accounts_cash_destinations) first."
        : "It could not be saved. Nothing was changed."
    )}`;
  }
  revalidatePath(PAGE);
  redirect(message);
}
