"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { cleanKind, dayOk } from "@/lib/follow-up-math";

export async function addCustomerNoteAction(form: FormData) {
  const user = await requireAccess("customers");
  const id = Number(form.get("customer_id"));
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const page = `/accounting/customers/${id}`;
  if (!Number.isSafeInteger(id) || id <= 0 || note.length < 2) redirect(Number.isSafeInteger(id) && id > 0 ? page : "/accounting/customers");
  const [c] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_customers WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id]);
  if (!c[0]) redirect("/accounting/customers");
  const kind = cleanKind(form.get("kind"));
  const follow = String(form.get("follow_up_on") ?? "").trim();
  if (follow && !dayOk(follow)) redirect(`${page}?result=bad-follow`);
  try {
    if (kind === "NOTE" && !follow) {
      await db.execute(`INSERT INTO acct_customer_notes (legal_business_id, customer_id, note, created_by) VALUES (?, ?, ?, ?)`,
        [user.legal_business_id, id, note, user.id]);
    } else {
      // Calls, visits and follow-up days need the database file 078_follow_ups.
      await db.execute(`INSERT INTO acct_customer_notes (legal_business_id, customer_id, note, created_by, kind, follow_up_on) VALUES (?, ?, ?, ?, ?, ?)`,
        [user.legal_business_id, id, note, user.id, kind, follow || null]);
    }
  } catch {
    redirect(`${page}?result=${kind === "NOTE" && !follow ? "note-not-ready" : "follow-not-ready"}`);
  }
  revalidatePath(page);
  redirect(`${page}#history`);
}
