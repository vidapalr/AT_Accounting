import "server-only";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { SHOP_BUSINESS_ID } from "@/lib/shop";
import { normalizeEmail, tooManyTries } from "@/lib/shop-account-math";
import { sendMail } from "@/lib/mailer";
import { resetEmail } from "@/lib/shop-mail-text";

const hits = new Map<string, number[]>();
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
export const shopBaseUrl = () => (process.env.SHOP_PUBLIC_URL || "https://textiles.abhiraminc.com").replace(/\/+$/, "");

/** Makes a one-hour, one-time link for an active customer and emails it. Returns whether an email was sent. */
export async function sendResetLink(customerId: number): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT full_name, email FROM acct_shop_customers WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
    [customerId, SHOP_BUSINESS_ID]
  );
  if (!rows[0]) return false;
  const token = randomBytes(32).toString("hex");
  await db.execute(`DELETE FROM acct_shop_password_resets WHERE customer_id = ? OR expires_at < NOW()`, [customerId]);
  await db.execute(
    `INSERT INTO acct_shop_password_resets (customer_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [customerId, tokenHash(token), sqlDate(new Date(Date.now() + 3_600_000))]
  );
  return sendMail(String(rows[0].email), resetEmail(String(rows[0].full_name), `${shopBaseUrl()}/shop/account/reset?token=${token}`));
}

/** The same quiet answer whether or not the email exists, so nobody can probe for customers. */
export async function requestReset(raw: unknown, ip: string): Promise<{ ok: boolean; error?: string }> {
  const email = normalizeEmail((raw as { email?: unknown } | null)?.email);
  const now = Date.now();
  if (tooManyTries(hits, `ip:${ip}`, now, 10, 60 * 60_000) || tooManyTries(hits, `em:${email}`, now, 3, 60 * 60_000)) {
    return { ok: false, error: "Too many requests. Please try again in a while." };
  }
  if (!email) return { ok: true };
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_shop_customers WHERE legal_business_id = ? AND email = ?`, [SHOP_BUSINESS_ID, email]
  );
  if (rows[0]) await sendResetLink(Number(rows[0].id)).catch((e) => console.error("Reset link failed:", e));
  return { ok: true };
}

export async function resetPassword(raw: unknown, ip: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const token = String(r.token ?? "");
  const password = String(r.password ?? "");
  if (tooManyTries(hits, `rs:${ip}`, Date.now(), 20, 60 * 60_000)) return { ok: false, error: "Too many tries. Please wait and try again." };
  if (password.length < 8) return { ok: false, error: "Your password needs at least 8 characters." };
  if (password.length > 72) return { ok: false, error: "That password is too long. Please use up to 72 characters." };
  const bad = { ok: false as const, error: "This link has expired or was already used. Please ask for a new one." };
  if (!/^[a-f0-9]{64}$/.test(token)) return bad;
  const hash = await bcrypt.hash(password, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, customer_id FROM acct_shop_password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`,
      [tokenHash(token)]
    );
    if (!rows[0]) { await conn.rollback(); return bad; }
    await conn.execute(`UPDATE acct_shop_password_resets SET used_at = NOW() WHERE id = ?`, [rows[0].id]);
    await conn.execute(`UPDATE acct_shop_customers SET password_hash = ? WHERE id = ?`, [hash, rows[0].customer_id]);
    await conn.execute(`DELETE FROM acct_shop_sessions WHERE customer_id = ?`, [rows[0].customer_id]);
    await conn.commit();
    return { ok: true };
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Password reset failed:", error);
    return { ok: false, error: "Sorry, something went wrong. Please try again." };
  } finally {
    conn.release();
  }
}
