/**
 * Two-step login codes (TOTP, RFC 6238): the 6-digit code in an authenticator app
 * (Google Authenticator, Microsoft Authenticator, Authy...). Pure functions, no database.
 */
import { createHmac, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

export const STEP_SECONDS = 30;

/** The code for a 30-second step number. */
export function codeForStep(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

/**
 * Check a typed code. Accepts the step before and after (clock drift). Returns the matching step number
 * (so a code can be refused if it was already used), or null.
 */
export function checkCode(secret: string, typed: string, nowMs: number, lastUsedStep = 0): number | null {
  const code = typed.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const now = Math.floor(nowMs / 1000 / STEP_SECONDS);
  for (const step of [now, now - 1, now + 1]) {
    if (step > lastUsedStep && codeForStep(secret, step) === code) return step;
  }
  return null;
}

/** The text an authenticator app reads from the QR code. */
export function otpAuthUrl(secret: string, account: string, issuer = "Abhiram Group"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Ten-character backup codes like "K7QD-4M2X9P", easy to read out and to type. */
export function newBackupCodes(count = 8): string[] {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: count }, () => {
    const b = randomBytes(10);
    const s = Array.from(b, (x) => letters[x % letters.length]).join("");
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

export function normaliseBackupCode(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
