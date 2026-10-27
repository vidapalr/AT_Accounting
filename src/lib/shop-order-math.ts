// Checks and totals for orders placed on the public shop. No database here.
export const MAX_LINES = 30;
export const MAX_QTY = 20;

export type OrderInput = {
  name: string; phone: string; email: string; country: string;
  address: string; city: string; state: string; postal: string; note: string;
  lines: { variantId: number; qty: number }[];
};

const clean = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);

/** Returns the cleaned order, or a message the customer can read. */
export function checkOrder(raw: unknown): { ok: true; order: OrderInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const order: OrderInput = {
    name: clean(r.name, 120), phone: clean(r.phone, 30), email: clean(r.email, 160),
    country: clean(r.country, 80), address: clean(r.address, 300), city: clean(r.city, 100),
    state: clean(r.state, 100), postal: clean(r.postal, 20), note: clean(r.note, 500), lines: [],
  };
  if (order.name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!/^[+()\d][\d\s()+-]{6,}$/.test(order.phone)) return { ok: false, error: "Please enter a phone number we can reach you on, with the country code if outside India." };
  if (order.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) return { ok: false, error: "That email address does not look right." };
  if (order.country.length < 2) return { ok: false, error: "Please choose your country." };
  if (order.address.length < 5) return { ok: false, error: "Please enter your address." };
  if (order.city.length < 2) return { ok: false, error: "Please enter your city." };

  const rawLines = Array.isArray(r.lines) ? r.lines : [];
  const merged = new Map<number, number>();
  for (const l of rawLines.slice(0, MAX_LINES)) {
    const id = Number((l as { variantId?: unknown }).variantId);
    const qty = Number((l as { qty?: unknown }).qty);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isInteger(qty) || qty <= 0) continue;
    merged.set(id, Math.min(MAX_QTY, (merged.get(id) ?? 0) + qty));
  }
  order.lines = [...merged].map(([variantId, qty]) => ({ variantId, qty }));
  if (order.lines.length === 0) return { ok: false, error: "Your cart is empty." };
  return { ok: true, order };
}

/** Total in paise from rupee prices (prices may carry paise). */
export function orderTotalPaise(lines: { unitPrice: number; qty: number }[]): bigint {
  return lines.reduce((s, l) => s + BigInt(Math.round(l.unitPrice * 100)) * BigInt(l.qty), 0n);
}

/** Simple per-address limiter: at most `max` orders within `windowMs`. */
export function allowRequest(hits: Map<string, number[]>, key: string, now: number, max = 5, windowMs = 10 * 60_000): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
