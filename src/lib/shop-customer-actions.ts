"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { mailConfigured } from "@/lib/mailer";
import { sendResetLink } from "@/lib/shop-reset";

const PAGE = "/accounting/shop-customers";
const back = (kind: "saved" | "error", text: string): never =>
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);

/** Staff can block or unblock a website customer, or email them a reset link. Staff never see or set passwords. */
export async function shopCustomerAction(formData: FormData) {
  const user = await requireAccess("online_orders");
  const id = Number(formData.get("customer_id"));
  const op = String(formData.get("op") ?? "");
  if (!Number.isInteger(id) || id <= 0 || !["BLOCK", "UNBLOCK", "RESET"].includes(op)) return back("error", "That could not be done.");
  const [found] = await db.execute(`SELECT id FROM acct_shop_customers WHERE id = ? AND legal_business_id = ?`, [id, user.legal_business_id]);
  if ((found as unknown[]).length !== 1) return back("error", "That customer was not found.");

  if (op === "RESET") {
    if (!mailConfigured()) return back("error", "The shop mailbox is not set up yet, so no email can be sent.");
    const sent = await sendResetLink(id);
    if (sent) await audit(user.legal_business_id, user.id, id, "RESET_EMAIL");
    return sent ? back("saved", "Reset email sent.") : back("error", "The email could not be sent (is the customer blocked?).");
  }
  const status = op === "BLOCK" ? "BLOCKED" : "ACTIVE";
  await db.execute(`UPDATE acct_shop_customers SET status = ? WHERE id = ? AND legal_business_id = ?`, [status, id, user.legal_business_id]);
  if (status === "BLOCKED") await db.execute(`DELETE FROM acct_shop_sessions WHERE customer_id = ?`, [id]);
  await audit(user.legal_business_id, user.id, id, status);
  revalidatePath(PAGE);
  return back("saved", status === "BLOCKED" ? "Customer blocked. They are logged out and cannot order." : "Customer unblocked.");
}

async function audit(businessId: number, userId: number, customerId: number, what: string) {
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'SHOP_CUSTOMER_UPDATED', 'SHOP_CUSTOMER', ?, ?)`,
    [businessId, userId, customerId, JSON.stringify({ what })]
  );
}
