import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { findReporterByPhone, saveStockDrafts } from "@/lib/stock-drafts";

/**
 * Where WhatsApp (Meta Cloud API) delivers messages that employees send to the
 * business number. Needs on the server:
 *   WHATSAPP_VERIFY_TOKEN  any long secret you also type into Meta's webhook settings
 *   WHATSAPP_APP_SECRET    the app secret from Meta, used to check messages are genuine
 * Messages from numbers that are not registered staff are ignored.
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
      value?: {
        messages?: Array<{ id?: string; from?: string; type?: string; text?: { body?: string } }>;
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
      for (const message of change.value?.messages ?? []) {
        if (message.type !== "text" || !message.text?.body || !message.from) continue;
        try {
          const reporter = await findReporterByPhone(db, BUSINESS_ID, message.from);
          if (!reporter) continue;
          await saveStockDrafts({
            businessId: BUSINESS_ID,
            source: "WHATSAPP",
            reporter,
            text: message.text.body,
            waMessageId: message.id ?? null,
          });
        } catch (error) {
          console.error("Stock message failed:", error);
        }
      }
    }
  }

  // Always answer 200 quickly so WhatsApp does not keep retrying.
  return new NextResponse("ok", { status: 200 });
}
