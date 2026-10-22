
import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";

const COOKIE_NAME = "abhiram_accounting_session";
const SESSION_HOURS = 8;

interface UserRow extends RowDataPacket {
  id: number;
  full_name: string;
  email: string;
  password_hash: string;
  status: string;
}

interface SessionUser extends RowDataPacket {
  id: number;
  full_name: string;
  email: string;
  role: string;
  legal_business_id: number;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function verifyCredentials(
  email: string,
  password: string
) {
  const [rows] = await db.execute<UserRow[]>(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.password_hash,
       u.status
     FROM acct_app_users u
     WHERE u.email = ?
       AND EXISTS (
         SELECT 1
         FROM acct_user_access a
         WHERE a.user_id = u.id
           AND a.legal_business_id = 1
           AND a.division_id IS NULL
           AND a.role = 'GROUP_OWNER'
       )
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );

  const user = rows[0];

  if (!user || user.status !== "ACTIVE") {
    return null;
  }

  const valid = await bcrypt.compare(
    password,
    user.password_hash
  );

  return valid ? user : null;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_HOURS * 60 * 60 * 1000
  );

  await db.execute(
    `INSERT INTO acct_sessions
       (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
    [
      userId,
      tokenHash,
      expiresAt
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
    ]
  );

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }

  const [rows] = await db.execute<SessionUser[]>(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       a.role,
       a.legal_business_id
     FROM acct_sessions s
     JOIN acct_app_users u
       ON u.id = s.user_id
     JOIN acct_user_access a
       ON a.user_id = u.id
     WHERE s.token_hash = ?
       AND s.expires_at > UTC_TIMESTAMP()
       AND u.status = 'ACTIVE'
       AND a.legal_business_id = 1
       AND a.role = 'GROUP_OWNER'
       AND a.division_id IS NULL
     LIMIT 1`,
    [hashToken(token)]
  );

  return rows[0] ?? null;
}

export async function requireGroupOwner() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await db.execute(
      `DELETE FROM acct_sessions WHERE token_hash = ?`,
      [hashToken(token)]
    );
  }

  cookieStore.delete(COOKIE_NAME);
}
