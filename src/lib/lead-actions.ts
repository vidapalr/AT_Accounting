"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";
import { findOrCreateCustomer } from "@/lib/customers";
import { cleanSource } from "@/lib/leads-math";

const PAGE = "/accounting/leads";
const go = (kind: "saved" | "error", text: string): never => redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);
const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const text = (f: FormData, k: string, n: number) => String(f.get(k) ?? "").trim().slice(0, n);

export async function addLeadAction(form: FormData) {
  const user = await requireAccess("customers");
  const name = text(form, "full_name", 160);
  const rawPhone = text(form, "phone", 30);
  const phone = normalizePhone(rawPhone);
  const follow = text(form, "follow_up_on", 10);
  if (name.length < 2) return go("error", "Write the person's name.");
  if (rawPhone && !phone) return go("error", "That mobile number does not look right (10 digits).");
  if (follow && !dateOk(follow)) return go("error", "The follow-up date does not look right.");
  try {
    if (phone) {
      const [dup] = await db.execute<RowDataPacket[]>(
        `SELECT id FROM acct_leads WHERE legal_business_id = ? AND phone = ? AND status IN ('NEW','FOLLOW_UP') LIMIT 1`, [user.legal_business_id, phone]);
      if (dup[0]) return go("error", "This number is already in your open leads.");
    }
    await db.execute(
      `INSERT INTO acct_leads (legal_business_id, full_name, phone, source, interest, status, follow_up_on, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, name, phone, cleanSource(form.get("source")), text(form, "interest", 300) || null,
       follow ? "FOLLOW_UP" : "NEW", follow || null, text(form, "note", 500) || null, user.id]);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return go("error", "Leads are not set up yet: run the database file 068_leads.");
  }
  revalidatePath(PAGE);
  return go("saved", "Lead added.");
}

async function mine(user: { legal_business_id: number }, id: number) {
  const [r] = await db.execute<RowDataPacket[]>(`SELECT * FROM acct_leads WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id]);
  return r[0];
}

export async function updateLeadAction(form: FormData) {
  const user = await requireAccess("customers");
  const id = Number(form.get("lead_id"));
  const lead = Number.isSafeInteger(id) ? await mine(user, id) : undefined;
  if (!lead) return go("error", "Lead not found.");
  const action = String(form.get("action") ?? "");
  const follow = text(form, "follow_up_on", 10);
  const note = text(form, "note", 500);

  if (action === "lost") {
    await db.execute(`UPDATE acct_leads SET status = 'LOST', note = COALESCE(NULLIF(?, ''), note) WHERE id = ?`, [note, id]);
  } else if (action === "reopen") {
    await db.execute(`UPDATE acct_leads SET status = 'NEW' WHERE id = ?`, [id]);
  } else if (action === "customer") {
    if (!lead.phone) return go("error", "Add a mobile number first; customers are found by mobile number.");
    const c = await findOrCreateCustomer(db, { businessId: user.legal_business_id, userId: user.id, name: String(lead.full_name), phone10: String(lead.phone) });
    await db.execute(`UPDATE acct_leads SET status = 'WON', customer_id = ? WHERE id = ?`, [c.id, id]);
    revalidatePath(PAGE);
    redirect(`/accounting/customers/${c.id}`);
  } else {
    if (follow && !dateOk(follow)) return go("error", "The follow-up date does not look right.");
    await db.execute(`UPDATE acct_leads SET follow_up_on = ?, status = IF(? = '', status, 'FOLLOW_UP'), note = ? WHERE id = ?`,
      [follow || null, follow, note || null, id]);
  }
  revalidatePath(PAGE);
  return go("saved", "Saved.");
}
