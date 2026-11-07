// Small rules for automatic WhatsApp messages. Plain functions so they can be tested.

/** STOP / START words a customer may reply with. */
export function optWord(text: string | null | undefined): "STOP" | "START" | null {
  const t = (text ?? "").trim().toLowerCase().replace(/[.!\s]+$/g, "");
  if (["stop", "unsubscribe", "stop offers", "stop messages", "cancel offers"].includes(t)) return "STOP";
  if (["start", "subscribe", "start offers"].includes(t)) return "START";
  return null;
}

/** How many more messages may go out today. */
export function roomLeft(dailyMax: number, sentToday: number): number {
  if (!Number.isFinite(dailyMax) || dailyMax <= 0) return 0;
  return Math.max(0, Math.floor(dailyMax) - Math.max(0, sentToday));
}

/** Estimated cost in paise; null when no rate is set. */
export function estimatePaise(count: number, ratePaise: number | null): number | null {
  if (ratePaise === null || !Number.isFinite(ratePaise) || ratePaise <= 0) return null;
  return Math.round(Math.max(0, count) * ratePaise);
}

/** "0.88" or "1" rupees typed by the owner to whole paise; null when empty or not a sensible amount. */
export function rupeesToPaise(raw: string): number | null {
  const t = raw.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const p = Math.round(Number(t) * 100);
  return p > 0 ? p : null;
}

/** First name for the greeting, or "there". */
export function firstName(full: string | null | undefined): string {
  const w = (full ?? "").trim().split(/\s+/)[0] ?? "";
  if (!w || /^(walk-?in|customer|cash|unknown)$/i.test(w) || /\d/.test(w)) return "there";
  return w.slice(0, 30);
}

/** Meta error codes that mean every further send would fail the same way, so stop. */
export function isBlockingCode(code: number | undefined): boolean {
  return code !== undefined && [190, 100, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 133010].includes(code);
}

/** Key that stops the same arrival being sent twice to a customer. */
export function eventKey(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join("-").slice(0, 120);
}

export function whatsappDigits(phone10: string): string | null {
  return /^[6-9]\d{9}$/.test(phone10) ? `91${phone10}` : null;
}
