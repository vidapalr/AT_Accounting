
import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = path.join(
  process.cwd(),
  "private_uploads"
);

export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024;

export type AllowedDocumentType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png";

export function detectDocumentType(
  buffer: Buffer
): AllowedDocumentType | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString("ascii") === "%PDF-"
  ) {
    return "application/pdf";
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from("89504e470d0a1a0a", "hex")
    )
  ) {
    return "image/png";
  }

  return null;
}

export async function savePrivateDocument(
  buffer: Buffer,
  mimeType: AllowedDocumentType
) {
  await mkdir(STORAGE_DIR, {
    recursive: true,
    mode: 0o700,
  });

  const extension =
    mimeType === "application/pdf"
      ? "pdf"
      : mimeType === "image/jpeg"
        ? "jpg"
        : "png";

  const storageKey = `${randomUUID()}.${extension}`;

  const fullPath = path.join(
    STORAGE_DIR,
    storageKey
  );

  await writeFile(fullPath, buffer, {
    flag: "wx",
    mode: 0o600,
  });

  return storageKey;
}

export async function readPrivateDocument(
  storageKey: string
) {
  if (
    !/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(storageKey)
  ) {
    throw new Error("Invalid storage key.");
  }

  return readFile(path.join(STORAGE_DIR, storageKey));
}

export async function deletePrivateDocument(
  storageKey: string
) {
  if (
    !/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(storageKey)
  ) {
    throw new Error("Invalid storage key.");
  }

  await unlink(path.join(STORAGE_DIR, storageKey));
}
