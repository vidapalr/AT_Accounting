import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { findReporterByPhone, saveStockDrafts } from "@/lib/stock-drafts";
import { handleEcho, handleIncoming } from "@/lib/bot/handle";
import { sendWhatsAppText } from "@/lib/bot/send";
import { optWord } from "@/lib/broadcast-math";

/**
 * Where WhatsApp (Meta Cloud API) delivers messages that employees send to the
 * business number. Needs on the server:
 *   WHATSAPP_VERIFY_TOKEN  any long secret you also type into Meta's webhook settings
 *   WHATSAPP_APP_SECRET    the app secret from Meta, used to check messages are genuine
 * Staff messages become stock drafts. Other messages go to the shop chatbot (when it is switched on).
 */

const BUSINESS_ID = 1;

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === token) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const given = header.slice(7);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Incoming = {
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string } }>;
        message_echoes?: Array<{ to?: string }>;
        statuses?: Array<{ id?: string; status?: string; errors?: Array<{ code?: number; title?: string; message?: string }> }>;
      };
    }>;
  }>;
};

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let body: Incoming;
  try {
    body = JSON.parse(raw) as Incoming;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const echo of change.value?.message_echoes ?? []) {
        // A person answered from the phone: the bot steps back.
        if (!echo.to) continue;
        try { await handleEcho(echo.to); } catch (error) { console.error("Echo failed:", error); }
      }
      for (const st of change.value?.statuses ?? []) {
        if (!st.id || !st.status) continue;
        try { await saveDelivery(st.id, st.status, st.errors?.[0]); } catch (error) { console.error("Delivery status failed:", error); }
      }
      for (const message of change.value?.messages ?? []) {
        if (!message.from) continue;
        const text = message.type === "text" ? (message.text?.body ?? null) : null;
        try {
          // STOP / START about offer messages work even when the bot is off.
          const word = optWord(text);
          if (word) {
            await handleOptWord(message.from, word);
            continue;
          }
          const reporter = text ? await findReporterByPhone(db, BUSINESS_ID, message.from) : null;
          if (reporter && text) {
            await saveStockDrafts({
              businessId: BUSINESS_ID,
              source: "WHATSAPP",
              reporter,
              text,
              waMessageId: message.id ?? null,
            });
            continue;
          }
          const name = change.value?.contacts?.find(c => c.wa_id === message.from)?.profile?.name ?? null;
          await handleIncoming({ from: message.from, text, id: message.id ?? null, name });
        } catch (error) {
          console.error("WhatsApp message failed:", error);
        }
      }
    }
  }

  // Always answer 200 quickly so WhatsApp does not keep retrying.
  return new NextResponse("ok", { status: 200 });
}


const RANK = ["sent", "delivered", "read", "failed"];

/** Meta tells us afterwards whether a message was delivered, read or failed. Remember the furthest state reached. */
async function saveDelivery(id: string, status: string, error?: { code?: number; title?: string; message?: string }) {
  if (!RANK.includes(status)) return;
  const reason = status === "failed" ? String(error?.message ?? error?.title ?? "Not delivered").slice(0, 300) : null;
  await db.execute(
    `INSERT INTO acct_wa_delivery (wa_message_id, status, error_code, error_reason) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       error_code = IF(VALUES(status) = 'failed', VALUES(error_code), error_code),
       error_reason = IF(VALUES(status) = 'failed', VALUES(error_reason), error_reason),
       status = IF(FIELD(VALUES(status), 'sent','delivered','read','failed') >= FIELD(status, 'sent','delivered','read','failed'), VALUES(status), status)`,
    [id, status, status === "failed" ? (error?.code ?? null) : null, reason]
  );
}

/** A customer replied STOP or START: change their offers tick and answer. Free, because they just wrote to us. */
async function handleOptWord(from: string, word: "STOP" | "START") {
  const phone = from.replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) return;
  const [found] = await db.execute<import("mysql2").RowDataPacket[]>(
    `SELECT id FROM acct_customers WHERE legal_business_id = ? AND phone = ?`, [BUSINESS_ID, phone]);
  if (word === "STOP") {
    try {
      await db.execute(`UPDATE acct_customers SET whatsapp_opt_in = 0, whatsapp_opted_out_at = NOW() WHERE legal_business_id = ? AND phone = ?`, [BUSINESS_ID, phone]);
    } catch {
      await db.execute(`UPDATE acct_customers SET whatsapp_opt_in = 0 WHERE legal_business_id = ? AND phone = ?`, [BUSINESS_ID, phone]);
    }
    await sendWhatsAppText(from, "You will not get offer messages from Abhiram Textiles any more. Reply START if you want them again.");
  } else if (found.length) {
    try {
      await db.execute(`UPDATE acct_customers SET whatsapp_opt_in = 1, whatsapp_opted_out_at = NULL WHERE legal_business_id = ? AND phone = ?`, [BUSINESS_ID, phone]);
    } catch {
      await db.execute(`UPDATE acct_customers SET whatsapp_opt_in = 1 WHERE legal_business_id = ? AND phone = ?`, [BUSINESS_ID, phone]);
    }
    await sendWhatsAppText(from, "Thank you. You will get new-stock messages from Abhiram Textiles. Reply STOP any time to stop them.");
  }
}
