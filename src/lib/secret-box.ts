import "server-only";

/**
 * Encrypting small secrets (portal passwords) with AES-256-GCM and the app's existing key
 * (BANK_ENCRYPTION_KEY, already set on the server). Stored as one value:
 *   1 byte version | 12 bytes IV | 16 bytes tag | ciphertext.
 * The purpose word is bound in (additional data), so a value from one table cannot be used in another.
 * Plain text is only ever produced inside an explicit "show" action, never in lists.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const v = process.env.SECRETS_ENCRYPTION_KEY || process.env.BANK_ENCRYPTION_KEY;
  if (!v || !/^[0-9a-fA-F]{64}$/.test(v)) throw new Error("SECRETS_ENCRYPTION_KEY (or BANK_ENCRYPTION_KEY) must be a 32-byte hex key");
  return Buffer.from(v, "hex");
}

export function sealSecret(plain: string, purpose: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(Buffer.from(purpose, "utf8"));
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), body]);
}

export function openSecret(sealed: Buffer, purpose: string): string {
  if (sealed.length < 29 || sealed[0] !== 1) throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), sealed.subarray(1, 13));
  d.setAAD(Buffer.from(purpose, "utf8"));
  d.setAuthTag(sealed.subarray(13, 29));
  return Buffer.concat([d.update(sealed.subarray(29)), d.final()]).toString("utf8");
}

/** True when the server has a key, so passwords can be saved. */
export function secretsReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}
