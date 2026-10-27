"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { emailOrderStatus } from "@/lib/order-mail";
import { parseRupees, paiseText } from "@/lib/cash-math";

const PAGE = "/accounting/online-orders";
const back = (kind: "saved" | "error", text: string): never =>
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);

/** Staff move an order along: confirm (with the shipping charge), complete, or cancel. */
export async function updateOnlineOrderAction(formData: FormData) {
  const user = await requireAccess("online_orders");
  const id = Number(formData.get("order_id"));
  const op = String(formData.get("op") ?? "");
  const note = String(formData.get("staff_note") ?? "").trim().slice(0, 500);
  if (!Number.isInteger(id) || id <= 0 || !["CONFIRMED", "COMPLETED", "CANCELLED"].includes(op)) return back("error", "That order could not be updated.");

  let shipping: string | null = null;
  if (op === "CONFIRMED") {
    const raw = String(formData.get("shipping") ?? "").trim();
    try {
      shipping = raw === "" ? "0.00" : paiseText(parseRupees(raw));
    } catch {
      return back("error", "Enter the shipping charge in rupees, for example 450.");
    }
  }
  const allowedFrom: Record<string, string[]> = { CONFIRMED: ["REQUESTED"], COMPLETED: ["CONFIRMED"], CANCELLED: ["REQUESTED", "CONFIRMED"] };
  const [res] = await db.execute(
    `UPDATE acct_online_orders
        SET status = ?, ${shipping !== null ? "shipping_charge = ?," : ""} staff_note = COALESCE(NULLIF(?, ''), staff_note),
            handled_by = ?, handled_at = NOW()
      WHERE id = ? AND legal_business_id = ? AND status IN (${allowedFrom[op].map(() => "?").join(",")})`,
    [op, ...(shipping !== null ? [shipping] : []), note, user.id, id, user.legal_business_id, ...allowedFrom[op]]
  );
  if ((res as { affectedRows: number }).affectedRows !== 1) return back("error", "That order was already changed. Please refresh.");
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'ONLINE_ORDER_UPDATED', 'ONLINE_ORDER', ?, ?)`,
    [user.legal_business_id, user.id, id, JSON.stringify({ status: op, shipping })]
  );
  await emailOrderStatus(id, op as "CONFIRMED" | "COMPLETED" | "CANCELLED");
  revalidatePath(PAGE);
  return back("saved", op === "CONFIRMED" ? "Order confirmed." : op === "COMPLETED" ? "Order marked complete." : "Order cancelled.");
}
