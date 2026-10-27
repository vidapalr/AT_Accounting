// Checks for website customer sign-up and login. No database here.
export type SignUp = { name: string; email: string; phone: string; password: string };

export const normalizeEmail = (v: unknown) => String(v ?? "").trim().toLowerCase().slice(0, 160);

export function checkSignUp(raw: unknown): { ok: true; value: SignUp } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 120);
  const email = normalizeEmail(r.email);
  const phone = String(r.phone ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 30);
  const password = String(r.password ?? "");
  if (name.length < 2) return { ok: false, error: "Please enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!/^[+()\d][\d\s()+-]{6,}$/.test(phone)) return { ok: false, error: "Please enter a phone number, with the country code if outside India." };
  if (password.length < 8) return { ok: false, error: "Your password needs at least 8 characters." };
  if (password.length > 72) return { ok: false, error: "That password is too long. Please use up to 72 characters." };
  return { ok: true, value: { name, email, phone, password } };
}

/** Only follow a safe path inside the shop after login, never another website. */
export function safeNext(next: unknown): string {
  const v = String(next ?? "");
  return /^\/shop(\/[A-Za-z0-9\-_/]*)?$/.test(v) && !v.startsWith("//") ? v : "/shop/account";
}

/** At most `max` tries within `windowMs` for one key (address or email). */
export function tooManyTries(hits: Map<string, number[]>, key: string, now: number, max = 8, windowMs = 15 * 60_000): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
