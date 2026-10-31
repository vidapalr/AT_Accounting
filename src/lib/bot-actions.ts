"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { last10 } from "@/lib/bot/engine";

const BACK = "/accounting/chatbot";

async function setSetting(businessId: number, key: string, value: string, userId: number) {
  await db.execute(
    `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [businessId, key, value, userId]
  );
}

/** Owner only: switch the bot on or off and save the owner's own numbers. */
export async function saveBotSettingsAction(formData: FormData) {
  const user = await requireGroupOwner();
  const on = formData.get("enabled") === "1" ? "1" : "0";
  const numbers = String(formData.get("owner_numbers") ?? "")
    .split(/[,\n]/).map((s) => last10(s)).filter((s) => s.length === 10);
  await setSetting(user.legal_business_id, "bot_enabled", on, user.id);
  await setSetting(user.legal_business_id, "bot_owner_numbers", [...new Set(numbers)].join(","), user.id);
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'BOT_SETTINGS_CHANGED', 'SETTING', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify({ enabled: on, ownerNumbers: numbers.length })]
  );
  revalidatePath(BACK);
  redirect(`${BACK}?result=settings`);
}

export async function saveAnswerAction(formData: FormData) {
  const user = await requireAccess("online_orders");
  const id = Number(formData.get("id") ?? 0);
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const keywords = String(formData.get("keywords") ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean).join(", ").slice(0, 500);
  const reply = String(formData.get("reply") ?? "").trim().slice(0, 1500);
  if (!title || !keywords || !reply) redirect(`${BACK}?result=missing`);
  if (id > 0) {
    await db.execute(`UPDATE acct_bot_answers SET title = ?, keywords = ?, reply = ? WHERE id = ? AND legal_business_id = ?`,
      [title, keywords, reply, id, user.legal_business_id]);
  } else {
    await db.execute(`INSERT INTO acct_bot_answers (legal_business_id, title, keywords, reply, created_by) VALUES (?, ?, ?, ?, ?)`,
      [user.legal_business_id, title, keywords, reply, user.id]);
  }
  revalidatePath(BACK);
  redirect(`${BACK}?result=answer`);
}

export async function toggleAnswerAction(formData: FormData) {
  const user = await requireAccess("online_orders");
  await db.execute(
    `UPDATE acct_bot_answers SET status = IF(status = 'ACTIVE', 'PAUSED', 'ACTIVE') WHERE id = ? AND legal_business_id = ?`,
    [Number(formData.get("id")), user.legal_business_id]);
  revalidatePath(BACK);
  redirect(BACK);
}

export async function deleteAnswerAction(formData: FormData) {
  const user = await requireAccess("online_orders");
  await db.execute(`DELETE FROM acct_bot_answers WHERE id = ? AND legal_business_id = ?`, [Number(formData.get("id")), user.legal_business_id]);
  revalidatePath(BACK);
  redirect(BACK);
}

export async function markChatDoneAction(formData: FormData) {
  const user = await requireAccess("online_orders");
  await db.execute(
    `UPDATE acct_bot_conversations SET status = 'DONE', human_active_until = NOW() + INTERVAL 12 HOUR WHERE id = ? AND legal_business_id = ?`,
    [Number(formData.get("id")), user.legal_business_id]);
  revalidatePath(BACK);
  redirect(BACK);
}

/** Owner only: send bills automatically through the WhatsApp service, and which approved template to use. */
export async function saveAutoSendAction(formData: FormData) {
  const user = await requireGroupOwner();
  const on = formData.get("auto") === "1" ? "1" : "0";
  const template = String(formData.get("template") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 100);
  const language = String(formData.get("language") ?? "en").trim().replace(/[^A-Za-z_]/g, "").slice(0, 10) || "en";
  await setSetting(user.legal_business_id, "wa_auto_send", on, user.id);
  await setSetting(user.legal_business_id, "wa_bill_template", template, user.id);
  await setSetting(user.legal_business_id, "wa_bill_language", language, user.id);
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'WA_AUTO_SEND_CHANGED', 'SETTING', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify({ on, template, language })]
  );
  revalidatePath(BACK);
  redirect(`${BACK}?result=auto`);
}
