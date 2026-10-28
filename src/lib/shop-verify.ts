import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { SHOP_BUSINESS_ID } from "@/lib/shop";
import { sendMail, mailConfigured } from "@/lib/mailer";
import { verifyEmail } from "@/lib/shop-mail-text";
import { shopBaseUrl } from "@/lib/shop-url";

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/** Emails a 2-day, one-time link. Returns whether an email was sent. */
export async function sendVerifyLink(customerId: number): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT full_name, email, email_verified_at FROM acct_shop_customers WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE'`,
    [customerId, SHOP_BUSINESS_ID]
  );
  if (!rows[0] || rows[0].email_verified_at) return false;
  const token = randomBytes(32).toString("hex");
  await db.execute(`DELETE FROM acct_shop_email_verifications WHERE customer_id = ? OR expires_at < NOW()`, [customerId]);
  await db.execute(
    `INSERT INTO acct_shop_email_verifications (customer_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [customerId, tokenHash(token), sqlDate(new Date(Date.now() + 2 * 86_400_000))]
  );
  return sendMail(String(rows[0].email), verifyEmail(String(rows[0].full_name), `${shopBaseUrl()}/shop/account/verify?token=${token}`));
}

export async function confirmEmail(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, customer_id FROM acct_shop_email_verifications WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`,
      [tokenHash(token)]
    );
    if (!rows[0]) { await conn.rollback(); return false; }
    await conn.execute(`UPDATE acct_shop_email_verifications SET used_at = NOW() WHERE id = ?`, [rows[0].id]);
    await conn.execute(`UPDATE acct_shop_customers SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?`, [rows[0].customer_id]);
    await conn.commit();
    return true;
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error("Email confirm failed:", e);
    return false;
  } finally {
    conn.release();
  }
}

/** Ordering needs a confirmed email, but only when the shop can actually send the email. */
export async function emailOkToOrder(customerId: number): Promise<boolean> {
  if (!mailConfigured()) return true;
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT email_verified_at FROM acct_shop_customers WHERE id = ?`, [customerId]);
  return Boolean(rows[0]?.email_verified_at);
}
