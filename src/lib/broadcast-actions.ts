"use server";

import type { RowDataPacket } from "mysql2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { botConfigured, sendWhatsAppTemplate } from "@/lib/bot/send";
import { shopBaseUrl } from "@/lib/shop-url";
import { audienceFor, getSettings, loadArrival, sentToday } from "@/lib/broadcast-data";
import { eventKey, firstName, isBlockingCode, roomLeft, rupeesToPaise, whatsappDigits } from "@/lib/broadcast-math";

type Row = RowDataPacket;
const BACK = "/accounting/catalogue/broadcast";

async function put(businessId: number, key: string, value: string, userId: number) {
  await db.execute(
    `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    [businessId, key, value, userId]);
}

/** Owner only: the approved template, its language, the daily maximum and what Meta charges per message. */
export async function saveBroadcastSettingsAction(form: FormData) {
  const user = await requireGroupOwner();
  const template = String(form.get("template") ?? "").trim().replace(/[^a-z0-9_]/gi, "").slice(0, 100);
  const language = String(form.get("language") ?? "en").trim().replace(/[^A-Za-z_]/g, "").slice(0, 12) || "en";
  const max = Math.min(1000, Math.max(0, Math.floor(Number(form.get("daily_max")) || 0)));
  const rate = rupeesToPaise(String(form.get("rate") ?? ""));
  await put(user.legal_business_id, "wa_broadcast_template", template, user.id);
  await put(user.legal_business_id, "wa_broadcast_language", language, user.id);
  await put(user.legal_business_id, "wa_broadcast_daily_max", String(max), user.id);
  await put(user.legal_business_id, "wa_broadcast_rate_paise", rate === null ? "" : String(rate), user.id);
  revalidatePath("/accounting/chatbot");
  redirect("/accounting/chatbot?result=broadcast");
}

function parseEvents(raw: string): number[] {
  return [...new Set(raw.split(",").map((s) => Number(s)).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 100);
}

/** Owner only: make the list of customers for this arrival. Sending starts on the next page. */
export async function startBroadcastAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const events = String(form.get("events") ?? "");
  const back = `${BACK}?events=${encodeURIComponent(events)}`;
  const ids = parseEvents(events);
  if (form.get("confirm") !== "1") redirect(`${back}&error=confirm`);
  if (!botConfigured()) redirect(`${back}&error=keys`);
  const settings = await getSettings(businessId);
  const template = settings.wa_broadcast_template ?? "";
  if (!template) redirect(`${back}&error=template`);
  const arrival = await loadArrival(businessId, ids);
  if ("error" in arrival) redirect(`${back}&error=arrival`);
  if (!arrival.imageId) redirect(`${back}&error=photo`);
  if (!arrival.shopOn) redirect(`${back}&error=shop`);
  const key = eventKey(ids);
  const aud = await audienceFor(businessId, key);
  if (aud.todo.length === 0) redirect(`${back}&error=nobody`);
  if (Number(form.get("count")) !== aud.todo.length) redirect(`${back}&error=changed`);

  const [res] = await db.execute<import("mysql2").ResultSetHeader>(
    `INSERT INTO acct_wa_broadcasts (legal_business_id, kind, product_id, event_ids, event_key, template_name, language_code, image_media_id, product_label, created_by)
     VALUES (?, 'NEW_STOCK', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, arrival.productId, ids.join(","), key, template, settings.wa_broadcast_language || "en", arrival.imageId, arrival.label.slice(0, 200), user.id]);
  const broadcastId = res.insertId;
  for (const c of aud.todo) {
    await db.execute(
      `INSERT IGNORE INTO acct_wa_broadcast_recipients (broadcast_id, legal_business_id, customer_id, event_key, phone) VALUES (?, ?, ?, ?, ?)`,
      [broadcastId, businessId, c.id, key, c.phone]);
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'WA_BROADCAST_STARTED', 'BROADCAST', ?, ?)`,
    [businessId, user.id, broadcastId, JSON.stringify({ customers: aud.todo.length, template })]);
  redirect(`${BACK}/${broadcastId}?go=1`);
}

/** Owner only: one test message to a number you type, to see how it looks. Not part of any list. */
export async function sendBroadcastTestAction(form: FormData) {
  const user = await requireGroupOwner();
  const events = String(form.get("events") ?? "");
  const back = `${BACK}?events=${encodeURIComponent(events)}`;
  const digits = whatsappDigits(String(form.get("phone") ?? "").replace(/\D/g, "").slice(-10));
  if (!digits) redirect(`${back}&test=${encodeURIComponent("Type a 10 digit mobile number.")}`);
  const settings = await getSettings(user.legal_business_id);
  const arrival = await loadArrival(user.legal_business_id, parseEvents(events));
  if (!settings.wa_broadcast_template || "error" in arrival || !arrival.imageId) redirect(`${back}&test=${encodeURIComponent("Set the template and make sure the product has a JPEG or PNG photo first.")}`);
  const r = await sendWhatsAppTemplate(
    digits, settings.wa_broadcast_template, settings.wa_broadcast_language || "en",
    ["Test", arrival.label, `${shopBaseUrl()}/shop/${arrival.productId}`],
    `${shopBaseUrl()}/api/shop/media/${arrival.imageId}`);
  redirect(`${back}&test=${encodeURIComponent(r.ok ? "Test sent. Check that phone." : `Not sent: ${r.reason ?? "unknown reason"}`)}`);
}

export type BatchResult = { state: "more" | "done" | "limit" | "stopped"; sent: number; failed: number; left: number; message?: string };

/** Owner only: sends the next few messages of a list. The page calls this again and again until it is done. */
export async function sendNextBatchAction(broadcastId: number): Promise<BatchResult> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const [bc] = await db.execute<Row[]>(
    `SELECT id, product_id, event_ids, template_name, language_code, image_media_id, product_label FROM acct_wa_broadcasts WHERE legal_business_id = ? AND id = ?`,
    [businessId, broadcastId]);
  if (!bc[0]) return { state: "stopped", sent: 0, failed: 0, left: 0, message: "List not found." };
  const settings = await getSettings(businessId);
  const max = Number(settings.wa_broadcast_daily_max ?? 0);
  let room = roomLeft(max, await sentToday(businessId));

  const countLeft = async () => Number(((await db.execute<Row[]>(`SELECT COUNT(*) AS n FROM acct_wa_broadcast_recipients WHERE broadcast_id = ? AND status = 'QUEUED'`, [broadcastId]))[0][0]).n);
  const [queued] = await db.execute<Row[]>(
    `SELECT r.id, r.phone, c.full_name FROM acct_wa_broadcast_recipients r JOIN acct_customers c ON c.legal_business_id = r.legal_business_id AND c.id = r.customer_id
      WHERE r.broadcast_id = ? AND r.status = 'QUEUED' ORDER BY r.id LIMIT 8`, [broadcastId]);

  let sent = 0, failed = 0;
  const link = `${shopBaseUrl()}/shop/${Number(bc[0].product_id)}`;
  const image = `${shopBaseUrl()}/api/shop/media/${Number(bc[0].image_media_id)}`;
  for (const q of queued) {
    if (room <= 0) return { state: "limit", sent, failed, left: await countLeft(), message: `Today's limit of ${max} messages is reached. Continue tomorrow from this page.` };
    const [claim] = await db.execute<import("mysql2").ResultSetHeader>(
      `UPDATE acct_wa_broadcast_recipients SET status = 'SENDING' WHERE id = ? AND status = 'QUEUED'`, [Number(q.id)]);
    if (claim.affectedRows !== 1) continue; // another page took it
    // Someone may have replied STOP since the list was made.
    const [still] = await db.execute<Row[]>(`SELECT whatsapp_opt_in FROM acct_customers WHERE legal_business_id = ? AND phone = ? LIMIT 1`, [businessId, String(q.phone)]);
    const digits = whatsappDigits(String(q.phone));
    if (!digits || (still[0] && Number(still[0].whatsapp_opt_in) !== 1)) {
      await db.execute(`UPDATE acct_wa_broadcast_recipients SET status = 'SKIPPED', error_reason = 'No longer agreed to messages' WHERE id = ?`, [Number(q.id)]);
      continue;
    }
    const r = await sendWhatsAppTemplate(digits, String(bc[0].template_name), String(bc[0].language_code),
      [firstName(String(q.full_name)), String(bc[0].product_label), link], image);
    if (r.ok) {
      sent++; room--;
      await db.execute(`UPDATE acct_wa_broadcast_recipients SET status = 'SENT', wa_message_id = ?, sent_at = NOW() WHERE id = ?`, [r.id ?? null, Number(q.id)]);
    } else {
      failed++;
      await db.execute(`UPDATE acct_wa_broadcast_recipients SET status = 'FAILED', error_code = ?, error_reason = ?, sent_at = NOW() WHERE id = ?`,
        [r.code ?? null, (r.reason ?? "Not sent").slice(0, 300), Number(q.id)]);
      if (isBlockingCode(r.code)) {
        return { state: "stopped", sent, failed, left: await countLeft(), message: `WhatsApp refused: ${r.reason ?? "check the template and keys"}. Nothing more was sent.` };
      }
    }
    await new Promise((res) => setTimeout(res, 250));
  }

  const left = await countLeft();
  if (left === 0) {
    await db.execute(`UPDATE acct_wa_broadcasts SET status = 'DONE' WHERE id = ?`, [broadcastId]);
    const [any] = await db.execute<Row[]>(`SELECT COUNT(*) AS n FROM acct_wa_broadcast_recipients WHERE broadcast_id = ? AND status = 'SENT'`, [broadcastId]);
    const ids = String(bc[0].event_ids).split(",").map(Number).filter((n) => n > 0);
    if (Number(any[0].n) > 0 && ids.length) {
      await db.execute(`UPDATE acct_stock_events SET status = 'SHARED', shared_at = NOW() WHERE legal_business_id = ? AND status = 'NEW' AND id IN (${ids.map(() => "?").join(",")})`, [businessId, ...ids]);
    }
    revalidatePath("/accounting/catalogue/new-stock");
    return { state: "done", sent, failed, left: 0 };
  }
  return { state: "more", sent, failed, left };
}
