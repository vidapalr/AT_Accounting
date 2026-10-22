
import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

function getKey(name: string): Buffer {
  const value = process.env[name];

  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 32-byte hex key`);
  }

  return Buffer.from(value, "hex");
}

export function normalizeAccountNumber(
  input: string
): string {
  const normalized = input.replace(/[\s-]/g, "");

  // Preserve leading zeroes; never convert bank
  // account numbers into JavaScript numbers.
  if (!/^[0-9]{6,24}$/.test(normalized)) {
    throw new Error(
      "Account number must contain 6–24 digits"
    );
  }

  return normalized;
}

export function protectBankAccount(
  accountNumber: string
) {
  const normalized = normalizeAccountNumber(
    accountNumber
  );

  const iv = randomBytes(12);

  const cipher = createCipheriv(
    "aes-256-gcm",
    getKey("BANK_ENCRYPTION_KEY"),
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const fingerprint = createHmac(
    "sha256",
    getKey("BANK_FINGERPRINT_KEY")
  )
    .update(normalized)
    .digest("hex");

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    last4: normalized.slice(-4),
    fingerprint,
  };
}

// Intended only for a future explicitly authorized
// account-detail operation. Never send the plaintext
// to list pages, audit records or client components.
export function decryptBankAccount(input: {
  encrypted: string;
  iv: string;
  authTag: string;
}): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey("BANK_ENCRYPTION_KEY"),
    Buffer.from(input.iv, "hex")
  );

  decipher.setAuthTag(
    Buffer.from(input.authTag, "hex")
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(input.encrypted, "base64")
    ),
    decipher.final(),
  ]).toString("utf8");
}
