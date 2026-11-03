"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

export async function addCustomerNoteAction(form: FormData) {
  const user = await requireAccess("customers");
  const id = Number(form.get("customer_id"));
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const page = `/accounting/customers/${id}`;
  if (!Number.isSafeInteger(id) || id <= 0 || note.length < 2) redirect(Number.isSafeInteger(id) && id > 0 ? page : "/accounting/customers");
  const [c] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_customers WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id]);
  if (!c[0]) redirect("/accounting/customers");
  try {
    await db.execute(`INSERT INTO acct_customer_notes (legal_business_id, customer_id, note, created_by) VALUES (?, ?, ?, ?)`,
      [user.legal_business_id, id, note, user.id]);
  } catch {
    redirect(`${page}?result=note-not-ready`);
  }
  revalidatePath(page);
  redirect(`${page}#history`);
}
