
import { PRIVATE_ROOT as PRIVATE_BASE } from "@/lib/private-root";
import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = PRIVATE_BASE;

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

/**
 * A folder of files for one member of staff, kept outside the app folder:
 *   PRIVATE_DIR/staff/<company id>/<person id>/<name>.pdf|jpg|png
 * The storage key is the path under PRIVATE_DIR, so the file can be found again.
 */
const STAFF_KEY = /^staff\/[1-9]\d*\/[1-9]\d*\/[0-9a-f-]{36}\.(pdf|jpg|png)$/;

export function staffFolderPath(businessId: number, employeeId: number): string {
  return path.join(STORAGE_DIR, "staff", String(businessId), String(employeeId));
}

export async function saveStaffFile(
  businessId: number,
  employeeId: number,
  buffer: Buffer,
  mimeType: AllowedDocumentType
): Promise<string> {
  const folder = staffFolderPath(businessId, employeeId);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const extension = mimeType === "application/pdf" ? "pdf" : mimeType === "image/jpeg" ? "jpg" : "png";
  const name = `${randomUUID()}.${extension}`;
  await writeFile(path.join(folder, name), buffer, { flag: "wx", mode: 0o600 });
  return `staff/${businessId}/${employeeId}/${name}`;
}

export async function readStaffFile(storageKey: string): Promise<Buffer> {
  if (!STAFF_KEY.test(storageKey)) throw new Error("Invalid storage key.");
  return readFile(path.join(STORAGE_DIR, storageKey));
}

export async function deleteStaffFile(storageKey: string): Promise<void> {
  if (!STAFF_KEY.test(storageKey)) throw new Error("Invalid storage key.");
  await unlink(path.join(STORAGE_DIR, storageKey));
}
