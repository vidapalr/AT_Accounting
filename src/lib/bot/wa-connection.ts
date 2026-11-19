import "server-only";

/**
 * Asks Meta how this app's WhatsApp connection is set up, so the owner can see why incoming
 * messages (staff IN/OUT, customer chats, delivery ticks) are or are not reaching the app.
 * Read-only except subscribeWaba(), which links the WhatsApp Business Account to this Meta app
 * (Meta only forwards messages to apps that are subscribed).
 */

const base = () => (process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");

type Json = Record<string, unknown>;

async function graph(path: string, init?: { method?: "GET" | "POST"; query?: Record<string, string> }): Promise<{ ok: boolean; body: Json; reason?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { ok: false, body: {}, reason: "WHATSAPP_ACCESS_TOKEN is not set on the server." };
  const url = new URL(`${base()}/${path}`);
  for (const [k, v] of Object.entries(init?.query ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    let body: Json = {};
    try { body = (await res.json()) as Json; } catch { /* empty */ }
    if (res.ok) return { ok: true, body };
    const err = body.error as { message?: string; code?: number } | undefined;
    return { ok: false, body, reason: `${err?.message ?? `Meta refused (${res.status})`}${err?.code ? ` (code ${err.code})` : ""}`.slice(0, 300) };
  } catch {
    return { ok: false, body: {}, reason: "Could not reach Meta." };
  }
}

export type WabaCheck = { id: string; hasThisNumber: boolean | null; subscribedApps: string[]; thisAppSubscribed: boolean };

export type WaConnection = {
  settings: { token: boolean; phoneId: boolean; appSecret: boolean; verifyToken: boolean };
  number: { display: string; name: string; platform: string; status: string; quality: string } | null;
  numberProblem?: string;
  appId: string | null;
  appName: string | null;
  tokenProblem?: string;
  wabas: WabaCheck[];
  /** Plain-words verdict, worst problem first. */
  verdict: string[];
};

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export async function checkWaConnection(): Promise<WaConnection> {
  const settings = {
    token: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneId: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    appSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
    verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
  };
  const out: WaConnection = { settings, number: null, appId: null, appName: null, wabas: [], verdict: [] };
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

  if (settings.token && phoneId) {
    const n = await graph(encodeURIComponent(phoneId), {
      query: { fields: "display_phone_number,verified_name,platform_type,status,quality_rating" },
    });
    if (n.ok) {
      out.number = {
        display: s(n.body.display_phone_number), name: s(n.body.verified_name), platform: s(n.body.platform_type),
        status: s(n.body.status), quality: s(n.body.quality_rating),
      };
    } else out.numberProblem = n.reason;
  }

  // The token tells us which Meta app it belongs to and which WhatsApp Business Accounts it can reach.
  let wabaIds: string[] = [];
  if (settings.token) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN!;
    const d = await graph("debug_token", { query: { input_token: token } });
    const data = (d.body.data ?? {}) as { app_id?: string; application?: string; is_valid?: boolean; granular_scopes?: Array<{ scope?: string; target_ids?: string[] }> };
    if (d.ok) {
      out.appId = data.app_id ? String(data.app_id) : null;
      out.appName = data.application ?? null;
      if (data.is_valid === false) out.tokenProblem = "The access token has expired or was revoked.";
      for (const g of data.granular_scopes ?? []) {
        if (g.scope?.startsWith("whatsapp_business")) wabaIds.push(...(g.target_ids ?? []).map(String));
      }
    } else out.tokenProblem = d.reason;
  }
  if (process.env.WHATSAPP_WABA_ID) wabaIds.push(process.env.WHATSAPP_WABA_ID.trim());
  wabaIds = [...new Set(wabaIds.filter((x) => /^\d+$/.test(x)))];

  for (const id of wabaIds) {
    const [phones, subs] = await Promise.all([
      graph(`${id}/phone_numbers`, { query: { fields: "id,display_phone_number" } }),
      graph(`${id}/subscribed_apps`),
    ]);
    const list = (phones.body.data ?? []) as Array<{ id?: string }>;
    const apps = ((subs.body.data ?? []) as Array<{ whatsapp_business_api_data?: { id?: string; name?: string } }>)
      .map((a) => a.whatsapp_business_api_data).filter(Boolean) as Array<{ id?: string; name?: string }>;
    out.wabas.push({
      id,
      hasThisNumber: phones.ok ? list.some((p) => String(p.id) === phoneId) : null,
      subscribedApps: apps.map((a) => a.name || a.id || "?"),
      thisAppSubscribed: out.appId ? apps.some((a) => String(a.id) === out.appId) : apps.length > 0,
    });
  }

  const v = out.verdict;
  if (!settings.token || !settings.phoneId) v.push("WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is missing in Hostinger.");
  if (out.tokenProblem) v.push(`Access token: ${out.tokenProblem}`);
  if (out.numberProblem) v.push(`The phone number id in Hostinger was refused by Meta: ${out.numberProblem}`);
  if (!settings.appSecret) v.push("WHATSAPP_APP_SECRET is not set in Hostinger, so every message from WhatsApp would be turned away.");
  if (!settings.verifyToken) v.push("WHATSAPP_VERIFY_TOKEN is not set in Hostinger, so Meta cannot verify the webhook address.");
  const mine = out.wabas.filter((w) => w.hasThisNumber !== false);
  if (out.wabas.length === 0 && settings.token) v.push("Could not find the WhatsApp Business Account for this token. Add WHATSAPP_WABA_ID in Hostinger (WhatsApp Manager → Account tools → the account ID) and check again.");
  else if (mine.length > 0 && !mine.some((w) => w.thisAppSubscribed)) v.push("The WhatsApp Business Account is NOT subscribed to this Meta app, so Meta sends incoming messages nowhere. Press 'Connect incoming messages' below.");
  return out;
}

/** Links the WhatsApp Business Account to the Meta app that owns the token, so incoming messages are forwarded. */
export async function subscribeWaba(wabaId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!/^\d+$/.test(wabaId)) return { ok: false, reason: "Not a WhatsApp Business Account id." };
  const r = await graph(`${wabaId}/subscribed_apps`, { method: "POST" });
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}
