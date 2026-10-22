import "server-only";

import { templateFor, type ReportType } from "./core";

export type OutgoingMessage = {
  /** +E.164 */
  to: string;
  type: ReportType;
  params: string[];
  document: { filename: string; buffer: Buffer };
};

export interface WhatsAppProvider {
  readonly name: string;
  /** False until the account details are in the environment. */
  readonly configured: boolean;
  send(message: OutgoingMessage): Promise<{ id: string }>;
}

class NotConfigured implements WhatsAppProvider {
  readonly name = "none";
  readonly configured = false;
  async send(): Promise<{ id: string }> {
    throw new Error("WhatsApp is not connected yet. Add the account details to the server settings.");
  }
}

/**
 * Meta WhatsApp Cloud API. Needs, in the environment:
 *   WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
 * Optional: WHATSAPP_API_VERSION (default v21.0), WHATSAPP_TEMPLATE_<TYPE> to rename a template.
 */
class MetaCloud implements WhatsAppProvider {
  readonly name = "meta";
  readonly configured = true;
  constructor(
    private readonly phoneNumberId: string,
    private readonly token: string,
    private readonly version: string,
    private readonly env: Record<string, string | undefined>
  ) {}

  private url(path: string) {
    return `https://graph.facebook.com/${this.version}/${path}`;
  }

  async send(message: OutgoingMessage): Promise<{ id: string }> {
    const upload = new FormData();
    upload.append("messaging_product", "whatsapp");
    upload.append("type", "application/pdf");
    upload.append("file", new Blob([new Uint8Array(message.document.buffer)], { type: "application/pdf" }), message.document.filename);

    const uploaded = await fetch(this.url(`${this.phoneNumberId}/media`), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}` },
      body: upload,
    });
    const uploadJson = (await uploaded.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!uploaded.ok || !uploadJson.id) {
      throw new Error(`Could not upload the PDF: ${uploadJson.error?.message ?? uploaded.status}`);
    }

    const template = templateFor(message.type, this.env);
    if (message.params.length !== template.paramCount) {
      throw new Error(`Template ${template.name} expects ${template.paramCount} values, got ${message.params.length}.`);
    }

    const sent = await fetch(this.url(`${this.phoneNumberId}/messages`), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: message.to.replace(/^\+/, ""),
        type: "template",
        template: {
          name: template.name,
          language: { code: template.language },
          components: [
            { type: "header", parameters: [{ type: "document", document: { id: uploadJson.id, filename: message.document.filename } }] },
            { type: "body", parameters: message.params.map((text) => ({ type: "text", text })) },
          ],
        },
      }),
    });
    const sentJson = (await sent.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!sent.ok || !sentJson.messages?.[0]?.id) {
      throw new Error(`WhatsApp refused the message: ${sentJson.error?.message ?? sent.status}`);
    }
    return { id: sentJson.messages[0].id };
  }
}

export function getProvider(env: Record<string, string | undefined> = process.env): WhatsAppProvider {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const token = env.WHATSAPP_ACCESS_TOKEN?.trim();
  if ((env.WHATSAPP_PROVIDER ?? "meta") === "meta" && phoneNumberId && token) {
    return new MetaCloud(phoneNumberId, token, env.WHATSAPP_API_VERSION?.trim() || "v21.0", env);
  }
  return new NotConfigured();
}
