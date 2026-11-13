import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";
import { checkCode, newBackupCodes, normaliseBackupCode } from "@/lib/totp";

const CHALLENGE_COOKIE = "abhiram_accounting_2fa";
const CHALLENGE_MINUTES = 5;
export const MAX_CODE_TRIES = 5;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

/**
 * True when this person has finished setting up two-step login.
 * Only a missing table (migration 065 not run) counts as "not set up". Any other database
 * error is thrown, so a sign-in can never skip the code just because the lookup failed.
 */
export async function hasTwoStep(userId: number): Promise<boolean> {
  try {
    const [r] = await db.execute<RowDataPacket[]>(
      `SELECT 1 FROM acct_user_totp WHERE user_id = ? AND enabled_at IS NOT NULL`, [userId]);
    return r.length > 0;
  } catch (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
}

/** After a right password: remember who is waiting to type a code (cookie + 5-minute row). */
export async function startChallenge(userId: number) {
  const token = randomBytes(32).toString("hex");
  await db.execute(`DELETE FROM acct_login_challenges WHERE expires_at < UTC_TIMESTAMP() OR user_id = ?`, [userId]);
  await db.execute(
    `INSERT INTO acct_login_challenges (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
    [sha(token), userId, sqlTime(new Date(Date.now() + CHALLENGE_MINUTES * 60_000))]);
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: CHALLENGE_MINUTES * 60,
  });
}

export async function readChallenge(): Promise<{ userId: number; attempts: number; hash: string } | null> {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  try {
    const [r] = await db.execute<RowDataPacket[]>(
      `SELECT user_id, attempts FROM acct_login_challenges WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()`, [sha(token)]);
    return r[0] ? { userId: Number(r[0].user_id), attempts: Number(r[0].attempts), hash: sha(token) } : null;
  } catch { return null; }
}

export async function endChallenge(hash: string) {
  await db.execute(`DELETE FROM acct_login_challenges WHERE token_hash = ?`, [hash]);
  (await cookies()).delete(CHALLENGE_COOKIE);
}

export async function countWrongCode(hash: string) {
  await db.execute(`UPDATE acct_login_challenges SET attempts = attempts + 1 WHERE token_hash = ?`, [hash]);
}

/** Check an app code (6 digits) or a backup code. A used code never works twice. */
export async function checkLoginCode(userId: number, typed: string): Promise<boolean> {
  const [r] = await db.execute<RowDataPacket[]>(
    `SELECT secret, last_step FROM acct_user_totp WHERE user_id = ? AND enabled_at IS NOT NULL`, [userId]);
  if (!r[0]) return false;
  const step = checkCode(String(r[0].secret), typed, Date.now(), Number(r[0].last_step));
  if (step !== null) {
    const [u] = await db.execute<ResultSetHeader>(
      `UPDATE acct_user_totp SET last_step = ? WHERE user_id = ? AND last_step < ?`, [step, userId, step]);
    return u.affectedRows === 1;
  }
  const clean = normaliseBackupCode(typed);
  if (clean.length !== 10) return false;
  const [used] = await db.execute<ResultSetHeader>(
    `UPDATE acct_user_backup_codes SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1`,
    [userId, sha(clean)]);
  return used.affectedRows === 1;
}

/** Start (or restart) setup: a fresh secret that is not active until the first code is confirmed. */
export async function beginSetup(userId: number, secret: string) {
  await db.execute(`DELETE FROM acct_user_totp WHERE user_id = ? AND enabled_at IS NULL`, [userId]);
  await db.execute(`INSERT IGNORE INTO acct_user_totp (user_id, secret) VALUES (?, ?)`, [userId, secret]);
}

export async function pendingSecret(userId: number): Promise<string | null> {
  const [r] = await db.execute<RowDataPacket[]>(
    `SELECT secret FROM acct_user_totp WHERE user_id = ? AND enabled_at IS NULL`, [userId]);
  return r[0] ? String(r[0].secret) : null;
}

/** Confirm setup with a first code; returns the one-time backup codes, or null if the code was wrong. */
export async function confirmSetup(userId: number, typed: string): Promise<string[] | null> {
  const secret = await pendingSecret(userId);
  if (!secret) return null;
  const step = checkCode(secret, typed, Date.now());
  if (step === null) return null;
  await db.execute(`UPDATE acct_user_totp SET enabled_at = UTC_TIMESTAMP(), last_step = ? WHERE user_id = ?`, [step, userId]);
  return replaceBackupCodes(userId);
}

export async function replaceBackupCodes(userId: number): Promise<string[]> {
  const codes = newBackupCodes();
  await db.execute(`DELETE FROM acct_user_backup_codes WHERE user_id = ?`, [userId]);
  for (const c of codes) {
    await db.execute(`INSERT INTO acct_user_backup_codes (user_id, code_hash) VALUES (?, ?)`, [userId, sha(normaliseBackupCode(c))]);
  }
  return codes;
}

export async function backupCodesLeft(userId: number): Promise<number> {
  const [r] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM acct_user_backup_codes WHERE user_id = ? AND used_at IS NULL`, [userId]);
  return Number(r[0]?.n ?? 0);
}

export async function removeTwoStep(userId: number) {
  await db.execute(`DELETE FROM acct_user_totp WHERE user_id = ?`, [userId]);
  await db.execute(`DELETE FROM acct_user_backup_codes WHERE user_id = ?`, [userId]);
  await db.execute(`DELETE FROM acct_login_challenges WHERE user_id = ?`, [userId]);
}
