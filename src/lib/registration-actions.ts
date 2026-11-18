"use server";

/**
 * Registrations and portal logins (PF, ESI, GST, income tax ...). Passwords are encrypted before they
 * are saved and only shown on request to the owner or the accountant; every showing is logged.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { isRegistrationKind } from "@/lib/registrations";
import { openSecret, sealSecret, secretsReady } from "@/lib/secret-box";

const PAGE = "/accounting/registrations";
const PURPOSE = "statutory-login";
const text = (f: FormData, n: string) => String(f.get(n) ?? "").trim();
const go = (params: Record<string, string>): never => redirect(`${PAGE}?${new URLSearchParams(params).toString()}`);
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function saveRegistrationAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const id = Number(text(form, "id")) || 0;
  const kind = text(form, "kind");
  const label = text(form, "label").slice(0, 100);
  const url = text(form, "portal_url");
  const password = String(form.get("password") ?? "");
  if (!isRegistrationKind(kind)) go({ error: "Choose what the registration is for." });
  if (!label) go({ error: "Give it a name, e.g. GST login." });
  if (url && !/^https:\/\/[^\s"'<>]+$/.test(url)) go({ error: "The portal address must start with https://." });
  if (password && !secretsReady()) go({ error: "The server has no encryption key, so passwords cannot be saved. Ask for SECRETS_ENCRYPTION_KEY to be set." });
  if (password.length > 200) go({ error: "That password is too long." });
  const sealed = password ? sealSecret(password, PURPOSE) : null;
  const fields = [kind, label, text(form, "registration_no").slice(0, 60) || null, url || null, text(form, "login_id").slice(0, 120) || null,
    date(text(form, "registered_on")), date(text(form, "renewal_due")), text(form, "note").slice(0, 300) || null];
  try {
    if (id) {
      await db.execute(
        `UPDATE acct_statutory_logins SET kind = ?, label = ?, registration_no = ?, portal_url = ?, login_id = ?, registered_on = ?, renewal_due = ?, note = ?
          ${sealed ? ", password_cipher = ?" : ""} WHERE legal_business_id = ? AND id = ?`,
        sealed ? [...fields, sealed, user.legal_business_id, id] : [...fields, user.legal_business_id, id]
      );
    } else {
      await db.execute(
        `INSERT INTO acct_statutory_logins (legal_business_id, kind, label, registration_no, portal_url, login_id, registered_on, renewal_due, note, password_cipher, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.legal_business_id, ...fields, sealed, user.id]
      );
    }
    await db.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, ?, 'STATUTORY_LOGIN', ?, ?)`,
      [user.legal_business_id, user.id, id ? "STATUTORY_LOGIN_CHANGED" : "STATUTORY_LOGIN_ADDED", id || 0, JSON.stringify({ kind, label, passwordChanged: !!sealed })]
    );
  } catch (error) {
    if (isMissingTable(error)) go({ error: "Run migration 091 in phpMyAdmin first." });
    throw error;
  }
  revalidatePath(PAGE);
  go({ saved: id ? "Saved." : "Registration added." });
}

export async function removeRegistrationAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  await db.execute(`UPDATE acct_statutory_logins SET status = 'REMOVED', password_cipher = NULL WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, Number(text(form, "id"))]);
  revalidatePath(PAGE);
  go({ saved: "Removed, and its password deleted." });
}

export type RevealState = { id: number; password?: string; error?: string } | null;

/** Show one password to the owner or accountant, and log who saw it and when. */
export async function revealPasswordAction(_prev: RevealState, form: FormData): Promise<RevealState> {
  const user = await requireAccess("tax");
  const id = Number(text(form, "id"));
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT password_cipher FROM acct_statutory_logins WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id, id]
  );
  const cipher = rows[0]?.password_cipher as Buffer | null | undefined;
  if (!cipher) return { id, error: "No password saved." };
  try {
    const password = openSecret(Buffer.from(cipher), PURPOSE);
    await db.execute(`INSERT INTO acct_statutory_login_views (legal_business_id, login_id, viewed_by) VALUES (?, ?, ?)`, [user.legal_business_id, id, user.id]);
    return { id, password };
  } catch {
    return { id, error: "The password could not be opened (the server key may have changed)." };
  }
}
