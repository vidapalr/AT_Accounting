"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { DEFAULT_TEMPLATES, type TemplateLetterType } from "@/lib/staff-letters";
import { saveBusinessSettings } from "@/lib/business-settings";
import { LETTER_TEMPLATE_KEYS } from "@/lib/letter-accept";

const PAGE = "/accounting/letter-templates";
const isType = (v: string): v is TemplateLetterType => Object.prototype.hasOwnProperty.call(DEFAULT_TEMPLATES, v);

/** Save the company's own wording for a letter. */
export async function saveLetterTemplateAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const type = String(form.get("letter_type") ?? "");
  if (!isType(type)) redirect(`${PAGE}?result=invalid`);
  const heading = String(form.get("heading") ?? "").trim().slice(0, 120);
  const body = String(form.get("body") ?? "").replace(/\r\n/g, "\n").trim().slice(0, 20000);
  const needsAcceptance = form.get("needs_acceptance") === "1" ? 1 : 0;
  if (!heading || !body) redirect(`${PAGE}?type=${type}&result=empty`);
  await db.execute(
    `INSERT INTO acct_letter_templates (legal_business_id, letter_type, heading, body, needs_acceptance, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE heading = VALUES(heading), body = VALUES(body), needs_acceptance = VALUES(needs_acceptance), updated_by = VALUES(updated_by)`,
    [user.legal_business_id, type, heading, body, needsAcceptance, user.id]
  );
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'LETTER_TEMPLATE_SAVED', 'LETTER_TEMPLATE', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify({ type })]
  );
  revalidatePath(PAGE);
  redirect(`${PAGE}?type=${type}&result=saved`);
}

/** Go back to the standard wording for a letter. */
export async function resetLetterTemplateAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const type = String(form.get("letter_type") ?? "");
  if (!isType(type)) redirect(`${PAGE}?result=invalid`);
  await db.execute(`DELETE FROM acct_letter_templates WHERE legal_business_id = ? AND letter_type = ?`, [user.legal_business_id, type]);
  revalidatePath(PAGE);
  redirect(`${PAGE}?type=${type}&result=reset`);
}

/** Every letter back to the standard (corporate) wording: removes all of the company's own wording. */
export async function resetAllLetterTemplatesAction(): Promise<void> {
  const user = await requireAccess("salary");
  await db.execute(`DELETE FROM acct_letter_templates WHERE legal_business_id = ?`, [user.legal_business_id]);
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'LETTER_TEMPLATES_RESET', 'LETTER_TEMPLATE', 0, '{}')`,
    [user.legal_business_id, user.id]
  );
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=resetall`);
}

/** The approved WhatsApp template used to send letters (name and language as approved by Meta). */
export async function saveLetterWhatsAppTemplateAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const name = String(form.get("template_name") ?? "").trim().toLowerCase();
  const language = String(form.get("template_language") ?? "").trim() || "en";
  if (name && !/^[a-z0-9_]{1,80}$/.test(name)) redirect(`${PAGE}?result=badtemplate#whatsapp`);
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(language)) redirect(`${PAGE}?result=badtemplate#whatsapp`);
  await saveBusinessSettings(user.legal_business_id, { [LETTER_TEMPLATE_KEYS.name]: name, [LETTER_TEMPLATE_KEYS.language]: language }, user.id);
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=template#whatsapp`);
}
