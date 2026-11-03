"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { normalizePhone } from "@/lib/customer-phone";
import { isStage, neighbour, type Stage } from "@/lib/deals-math";

const PAGE = "/accounting/deals";
const go = (kind: "saved" | "error", text: string): never => redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 200))}`);
const dateOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const txt = (f: FormData, k: string, n: number) => String(f.get(k) ?? "").trim().slice(0, n);
const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export async function addDealAction(form: FormData) {
  const user = await requireAccess("customers");
  const party = txt(form, "party_name", 160), title = txt(form, "title", 200);
  const rawPhone = txt(form, "phone", 30), phone = normalizePhone(rawPhone);
  const value = txt(form, "expected_value", 15), close = txt(form, "expected_close", 10);
  if (party.length < 2 || title.length < 2) return go("error", "Write who the deal is with and what it is for.");
  if (rawPhone && !phone) return go("error", "That mobile number does not look right (10 digits).");
  if (value && !/^\d{1,10}(\.\d{1,2})?$/.test(value)) return go("error", "The expected amount does not look right.");
  if (close && !dateOk(close)) return go("error", "The expected closing date does not look right.");
  let customerId: number | null = null;
  try {
    if (phone) {
      const [c] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_customers WHERE legal_business_id = ? AND phone = ? LIMIT 1`, [user.legal_business_id, phone]);
      customerId = c[0] ? Number(c[0].id) : null;
    }
    await db.execute(
      `INSERT INTO acct_deals (legal_business_id, party_name, phone, customer_id, title, expected_value, expected_close, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, party, phone, customerId, title, value || "0", close || null, txt(form, "note", 500) || null, user.id]);
  } catch {
    return go("error", "The pipeline is not set up yet: run the database file 069_deals.");
  }
  revalidatePath(PAGE);
  return go("saved", "Deal added.");
}

export async function moveDealAction(form: FormData) {
  const user = await requireAccess("customers");
  const id = Number(form.get("deal_id"));
  const to = String(form.get("to") ?? "");
  const [r] = Number.isSafeInteger(id)
    ? await db.execute<RowDataPacket[]>(`SELECT stage FROM acct_deals WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id])
    : [[] as RowDataPacket[]];
  if (!r[0]) return go("error", "Deal not found.");
  const from = String(r[0].stage) as Stage;
  let next: Stage | null = null;
  if (to === "next") next = neighbour(from, 1);
  else if (to === "back") next = neighbour(from, -1);
  else if (isStage(to)) next = to;
  if (!next) return go("error", "That move is not possible.");
  const reason = next === "LOST" ? txt(form, "lost_reason", 200) : "";
  const closing = next === "WON" || next === "LOST";
  await db.execute(
    `UPDATE acct_deals SET stage = ?, lost_reason = ?, closed_on = ? WHERE legal_business_id = ? AND id = ?`,
    [next, reason || null, closing ? todayIst() : null, user.legal_business_id, id]);
  revalidatePath(PAGE);
  return go("saved", next === "WON" ? "Deal won. Make the bill from New sale." : "Saved.");
}

export async function editDealAction(form: FormData) {
  const user = await requireAccess("customers");
  const id = Number(form.get("deal_id"));
  const value = txt(form, "expected_value", 15), close = txt(form, "expected_close", 10);
  if (value && !/^\d{1,10}(\.\d{1,2})?$/.test(value)) return go("error", "The expected amount does not look right.");
  if (close && !dateOk(close)) return go("error", "The expected closing date does not look right.");
  await db.execute(
    `UPDATE acct_deals SET expected_value = ?, expected_close = ?, note = ? WHERE legal_business_id = ? AND id = ?`,
    [value || "0", close || null, txt(form, "note", 500) || null, user.legal_business_id, id]);
  revalidatePath(PAGE);
  return go("saved", "Saved.");
}
