import "server-only";
import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

export const MAX_WRONG_PER_EMAIL = 5;
export const MAX_WRONG_PER_IP = 20;
export const WINDOW_MINUTES = 15;

/** Pure rule, kept separate so it can be tested. */
export function isLockedOut(wrongForEmail: number, wrongForIp: number): boolean {
  return wrongForEmail >= MAX_WRONG_PER_EMAIL || wrongForIp >= MAX_WRONG_PER_IP;
}

/** True when this email or address has had too many wrong passwords recently.
 *  If the table is missing (migration 054 not run yet) login keeps working. */
export async function tooManyAttempts(email: string, ip: string): Promise<boolean> {
  try {
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT
         SUM(email = ?) AS e,
         SUM(ip = ?) AS i
       FROM acct_login_attempts
       WHERE attempted_at > (NOW() - INTERVAL ${WINDOW_MINUTES} MINUTE)`,
      [email, ip]
    );
    return isLockedOut(Number(rows[0]?.e ?? 0), Number(rows[0]?.i ?? 0));
  } catch {
    return false;
  }
}

export async function recordWrongPassword(email: string, ip: string): Promise<void> {
  try {
    await db.execute("INSERT INTO acct_login_attempts (email, ip) VALUES (?, ?)", [email, ip]);
  } catch {
    /* table not there yet */
  }
}

/** After a good login: forget this email's wrong tries and tidy old rows and expired sessions. */
export async function tidyAfterLogin(email: string): Promise<void> {
  try {
    await db.execute("DELETE FROM acct_login_attempts WHERE email = ? OR attempted_at < (NOW() - INTERVAL 1 DAY)", [email]);
  } catch {
    /* ignore */
  }
  try {
    await db.execute("DELETE FROM acct_sessions WHERE expires_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)");
  } catch {
    /* ignore */
  }
}
