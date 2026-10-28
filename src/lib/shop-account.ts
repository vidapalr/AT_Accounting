import { sendVerifyLink } from "@/lib/shop-verify";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { SHOP_BUSINESS_ID } from "@/lib/shop";
import { checkSignUp, normalizeEmail, tooManyTries } from "@/lib/shop-account-math";

const COOKIE = "abhiram_shop_session";
const SESSION_DAYS = 30;
const hits = new Map<string, number[]>();
// A real hash to compare against when the email is unknown, so the reply takes the same time either way.
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("not-a-real-password", 10));

const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

export type ShopCustomer = { id: number; name: string; email: string; phone: string };
type Result = { ok: true } | { ok: false; error: string };

async function startSession(customerId: number) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.execute(`INSERT INTO acct_shop_sessions (customer_id, token_hash, expires_at) VALUES (?, ?, ?)`, [customerId, tokenHash(token), sqlDate(expires)]);
  await db.execute(`DELETE FROM acct_shop_sessions WHERE expires_at < NOW()`).catch(() => undefined);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function registerCustomer(raw: unknown, ip: string): Promise<Result> {
  if (tooManyTries(hits, `reg:${ip}`, Date.now(), 10, 60 * 60_000)) return { ok: false, error: "Too many sign-ups from this connection. Please try again later." };
  const checked = checkSignUp(raw);
  if (!checked.ok) return checked;
  const { name, email, phone, password } = checked.value;
  const hash = await bcrypt.hash(password, 10);
  try {
    const [res] = await db.execute<ResultSetHeader>(
      `INSERT INTO acct_shop_customers (legal_business_id, email, full_name, phone, password_hash) VALUES (?, ?, ?, ?, ?)`,
      [SHOP_BUSINESS_ID, email, name, phone, hash]
    );
    await startSession(res.insertId);
    sendVerifyLink(res.insertId).catch((e) => console.error("Verify link failed:", e));
    return { ok: true };
  } catch (error) {
    if ((error as { code?: string }).code === "ER_DUP_ENTRY") return { ok: false, error: "There is already an account with this email. Please log in instead." };
    console.error("Shop sign-up failed:", error);
    return { ok: false, error: "Sorry, we could not create your account. Please try again." };
  }
}

export async function loginCustomer(raw: unknown, ip: string): Promise<Result> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(r.email);
  const password = String(r.password ?? "").slice(0, 200);
  const now = Date.now();
  if (tooManyTries(hits, `ip:${ip}`, now, 30) || tooManyTries(hits, `em:${email}`, now, 8)) {
    return { ok: false, error: "Too many tries. Please wait a few minutes and try again." };
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, password_hash, status FROM acct_shop_customers WHERE legal_business_id = ? AND email = ?`,
    [SHOP_BUSINESS_ID, email]
  );
  const row = rows[0];
  const valid = await bcrypt.compare(password, row ? String(row.password_hash) : getDummyHash());
  if (!row || !valid || row.status !== "ACTIVE") return { ok: false, error: "The email or password is not right." };
  await db.execute(`UPDATE acct_shop_customers SET last_login_at = NOW() WHERE id = ?`, [row.id]);
  await startSession(Number(row.id));
  return { ok: true };
}

export async function logoutCustomer() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    await db.execute(`DELETE FROM acct_shop_sessions WHERE token_hash = ?`, [tokenHash(token)]).catch(() => undefined);
  }
  store.delete(COOKIE);
}

/** The logged-in website customer, or null. */
export async function getShopCustomer(): Promise<ShopCustomer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.full_name, c.email, c.phone
       FROM acct_shop_sessions s JOIN acct_shop_customers c ON c.id = s.customer_id
      WHERE s.token_hash = ? AND s.expires_at > NOW() AND c.status = 'ACTIVE' AND c.legal_business_id = ?`,
    [tokenHash(token), SHOP_BUSINESS_ID]
  );
  const r = rows[0];
  return r ? { id: Number(r.id), name: String(r.full_name), email: String(r.email), phone: String(r.phone) } : null;
}
