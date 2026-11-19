import "server-only";

/** Sends through Meta's WhatsApp Cloud API. Does nothing when the keys are not set. */
export function botConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export type SendResult = { ok: boolean; code?: number; reason?: string; id?: string };

async function post(payload: Record<string, unknown>): Promise<SendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, reason: "WhatsApp keys are not set on the server." };
  try {
    const res = await fetch(`${(process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0").replace(/\/+$/, "")}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      let id: string | undefined;
      try { id = ((await res.json()) as { messages?: Array<{ id?: string }> }).messages?.[0]?.id; } catch { /* no id */ }
      return { ok: true, id };
    }
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
export function sendWhatsAppTemplate(toDigits: string, name: string, language: string, params: string[], headerImageUrl?: string): Promise<SendResult> {
  const components: Record<string, unknown>[] = [];
  if (headerImageUrl) components.push({ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] });
  if (params.length) components.push({ type: "body", parameters: params.map((t) => ({ type: "text", text: t.replace(/\s+/g, " ").slice(0, 500) })) });
  return post({ to: toDigits, type: "template", template: { name, language: { code: language }, components } });
}

/** A picture with a short caption, fetched by WhatsApp from a public link. JPEG or PNG only. Free inside 24 hours of the customer's message. */
export function sendWhatsAppImage(toDigits: string, url: string, caption: string): Promise<SendResult> {
  return post({ to: toDigits, type: "image", image: { link: url, caption: caption.slice(0, 900) } });
}

/**
 * Uploads a file to WhatsApp (kept by Meta for 30 days) and returns its media id, so a private
 * document can be sent without putting it on a public web address.
 */
export async function uploadWhatsAppMedia(file: Buffer, mime: string, filename: string): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, reason: "WhatsApp keys are not set on the server." };
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", new Blob([new Uint8Array(file)], { type: mime }), filename);
    const res = await fetch(`${(process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0").replace(/\/+$/, "")}/${encodeURIComponent(phoneId)}/media`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (res.ok && j.id) return { ok: true, id: j.id };
    return { ok: false, reason: (j.error?.message ?? `WhatsApp refused the file (${res.status}).`).slice(0, 200) };
  } catch {
    return { ok: false, reason: "Could not reach WhatsApp." };
  }
}

/**
 * A document with a message and optional reply buttons (button id = what comes back when tapped).
 * Free-form: Meta only delivers it within 24 hours of the person's last message to the business.
 */
export function sendWhatsAppDocumentWithButtons(toDigits: string, mediaId: string, filename: string, body: string, buttons: Array<{ id: string; title: string }>): Promise<SendResult> {
  if (buttons.length === 0) {
    return post({ to: toDigits, type: "document", document: { id: mediaId, filename, caption: body.slice(0, 1000) } });
  }
  return post({
    to: toDigits,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "document", document: { id: mediaId, filename } },
      body: { text: body.slice(0, 1000) },
      action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })) },
    },
  });
}

/**
 * An approved template with a document header, body values and (optionally) a quick-reply button
 * whose payload comes back when tapped. Works any time, billed by Meta.
 */
export function sendWhatsAppDocumentTemplate(toDigits: string, name: string, language: string, mediaId: string, filename: string, params: string[], buttonPayload?: string): Promise<SendResult> {
  const components: Record<string, unknown>[] = [
    { type: "header", parameters: [{ type: "document", document: { id: mediaId, filename } }] },
  ];
  if (params.length) components.push({ type: "body", parameters: params.map((t) => ({ type: "text", text: t.replace(/\s+/g, " ").slice(0, 500) })) });
  if (buttonPayload) components.push({ type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: buttonPayload }] });
  return post({ to: toDigits, type: "template", template: { name, language: { code: language }, components } });
}
