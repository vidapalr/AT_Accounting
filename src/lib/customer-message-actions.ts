"use server";

import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

/** Remember that a message was opened in WhatsApp for this customer. */
export async function markMessageSentAction(
  customerId: number,
  batchKey: string,
  messageType: "NEW_STOCK" | "DUES_REMINDER" | "OTHER"
): Promise<{ ok: boolean }> {
  const user = await requireAccess("customers");
  if (
    !Number.isSafeInteger(customerId) || customerId <= 0 ||
    typeof batchKey !== "string" || batchKey.length === 0 || batchKey.length > 120 ||
    !["NEW_STOCK", "DUES_REMINDER", "OTHER"].includes(messageType)
  ) {
    return { ok: false };
  }

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_customers WHERE legal_business_id = ? AND id = ?`,
    [user.legal_business_id, customerId]
  );
  if (rows.length !== 1) return { ok: false };

  await db.execute(
    `INSERT INTO acct_customer_messages
       (legal_business_id, customer_id, message_type, batch_key, sent_by)
     VALUES (?, ?, ?, ?, ?)`,
    [user.legal_business_id, customerId, messageType, batchKey, user.id]
  );
  return { ok: true };
}
