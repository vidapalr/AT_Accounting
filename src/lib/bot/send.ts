import "server-only";

/** Sends one text message through Meta's WhatsApp Cloud API. Does nothing when the keys are not set. */
export function botConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export async function sendWhatsAppText(toDigits: string, body: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return false;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: body.slice(0, 3800), preview_url: false } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("WhatsApp send failed:", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error("WhatsApp send error:", error);
    return false;
  }
}
