"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { dayOk } from "@/lib/follow-up-math";

const PAGE = "/accounting/follow-ups";

/** Marks a follow-up done (optionally with what happened and the next day), or moves it to another day. */
export async function followUpAction(form: FormData): Promise<void> {
  const user = await requireAccess("customers");
  const biz = user.legal_business_id;
  const type = String(form.get("type"));
  const id = Number(form.get("id"));
  const mode = String(form.get("mode")); // "done" | "move"
  const next = String(form.get("next_day") ?? "").trim();
  const result = String(form.get("result") ?? "").trim().slice(0, 400);
  if ((type !== "LEAD" && type !== "NOTE" && type !== "TICKET") || !Number.isSafeInteger(id) || id < 1 || (mode !== "done" && mode !== "move")) redirect(`${PAGE}?result=invalid`);
  if (next && !dayOk(next)) redirect(`${PAGE}?result=bad-day`);
  if (mode === "move" && !next) redirect(`${PAGE}?result=bad-day`);

  try {
    if (type === "LEAD") {
      const [l] = await db.execute<RowDataPacket[]>(`SELECT id, note FROM acct_leads WHERE legal_business_id = ? AND id = ?`, [biz, id]);
      if (!l[0]) redirect(`${PAGE}?result=invalid`);
      const note = result ? `${result}${l[0].note ? ` | ${String(l[0].note)}` : ""}`.slice(0, 500) : (l[0].note ?? null);
      await db.execute(
        `UPDATE acct_leads SET follow_up_on = ?, status = IF(? <> '', 'FOLLOW_UP', status), note = ? WHERE legal_business_id = ? AND id = ?`,
        [next || null, next, note, biz, id]);
    } else if (type === "TICKET") {
      const [t] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_service_tickets WHERE legal_business_id = ? AND id = ? AND status IN ('OPEN','WORKING')`, [biz, id]);
      if (!t[0]) redirect(`${PAGE}?result=invalid`);
      await db.execute(`UPDATE acct_service_tickets SET follow_up_on = ? WHERE legal_business_id = ? AND id = ?`, [next || null, biz, id]);
      await db.execute(`INSERT INTO acct_service_ticket_log (legal_business_id, ticket_id, status_after, note, created_by)
                        SELECT legal_business_id, id, status, ?, ? FROM acct_service_tickets WHERE legal_business_id = ? AND id = ?`,
        [(result || (mode === "done" ? "Followed up" : "Follow-up day moved")).slice(0, 500), user.id, biz, id]);
    } else {
      const [n] = await db.execute<RowDataPacket[]>(`SELECT id, customer_id, kind FROM acct_customer_notes WHERE legal_business_id = ? AND id = ?`, [biz, id]);
      if (!n[0]) redirect(`${PAGE}?result=invalid`);
      if (mode === "move") {
        await db.execute(`UPDATE acct_customer_notes SET follow_up_on = ? WHERE legal_business_id = ? AND id = ?`, [next, biz, id]);
      } else {
        await db.execute(`UPDATE acct_customer_notes SET follow_done_at = NOW() WHERE legal_business_id = ? AND id = ?`, [biz, id]);
        if (result || next) {
          await db.execute(
            `INSERT INTO acct_customer_notes (legal_business_id, customer_id, note, created_by, kind, follow_up_on) VALUES (?, ?, ?, ?, ?, ?)`,
            [biz, n[0].customer_id, result || "Followed up", user.id, n[0].kind, next || null]);
        }
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    redirect(`${PAGE}?result=failed`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=${mode === "done" ? "done" : "moved"}`);
}
