import "server-only";

/** Sends through Meta's WhatsApp Cloud API. Does nothing when the keys are not set. */
export function botConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export type SendResult = { ok: boolean; code?: number; reason?: string };

async function post(payload: Record<string, unknown>): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, reason: "WhatsApp keys are not set on the server." };
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    let code: number | undefined;
    let reason = `WhatsApp refused it (${res.status}).`;
    try {
      const j = (await res.json()) as { error?: { code?: number; message?: string } };
      code = j.error?.code;
      reason = j.error?.message ? j.error.message.slice(0, 200) : reason;
    } catch { /* keep the generic reason */ }
    console.error("WhatsApp send failed:", res.status, code, reason);
    return { ok: false, code, reason };
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return { ok: false, reason: "Could not reach WhatsApp." };
  }
}

export async function sendWhatsAppText(toDigits: string, body: string): Promise<boolean> {
  return (await post({ to: toDigits, type: "text", text: { body: body.slice(0, 3800), preview_url: false } })).ok;
}

/** Free text. Meta only allows it within 24 hours of the customer's last message. */
export function sendWhatsAppTextDetailed(toDigits: string, body: string): Promise<SendResult> {
  return post({ to: toDigits, type: "text", text: { body: body.slice(0, 3800), preview_url: true } });
}

/** An approved message template with its {{1}}, {{2}}... filled in. Works any time, billed by Meta. */
export function sendWhatsAppTemplate(toDigits: string, name: string, language: string, params: string[]): Promise<SendResult> {
  return post({
    to: toDigits,
    type: "template",
    template: {
      name,
      language: { code: language },
      components: params.length ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: t.replace(/\s+/g, " ").slice(0, 500) })) }] : [],
    },
  });
}
