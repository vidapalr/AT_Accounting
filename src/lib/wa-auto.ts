import "server-only";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { botConfigured } from "@/lib/bot/send";

export type AutoSendSettings = { on: boolean; template: string; language: string };

/** Whether bills are sent automatically through the WhatsApp service (owner's switch on the chatbot page). */
export async function autoSendSettings(businessId: number): Promise<AutoSendSettings> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key IN ('wa_auto_send','wa_bill_template','wa_bill_language')`, [businessId]);
  const m = new Map(rows.map((r) => [String(r.setting_key), String(r.setting_value)]));
  return { on: m.get("wa_auto_send") === "1" && botConfigured(), template: m.get("wa_bill_template") ?? "", language: m.get("wa_bill_language") || "en" };
}
