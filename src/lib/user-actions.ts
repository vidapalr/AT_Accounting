"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { ASSIGNABLE_ROLES } from "@/lib/access";

const PAGE = "/users";

class UserError extends Error {}

function back(kind: "done" | "error", message: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message.slice(0, 200))}`);
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function checkPassword(password: string) {
  if (password.length < 10) throw new UserError("The password must be at least 10 characters.");
  if (Buffer.byteLength(password, "utf8") > 72) throw new UserError("The password is too long (72 characters at most).");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new UserError("The password needs at least one letter and one number.");
  }
}

function checkRole(role: string) {
  if (!(ASSIGNABLE_ROLES as string[]).includes(role)) throw new UserError("Choose one of the listed access levels.");
}

/** The division a Manager works in, or the investor an Investor login belongs to. Other roles carry neither. */
async function scopeFor(role: string, form: FormData, businessId: number): Promise<{ divisionId: number | null; partyId: number | null }> {
  if (role === "DIVISION_MANAGER") {
    const divisionId = Number(form.get("scope_division_id"));
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_divisions WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [businessId, divisionId]);
    if (rows.length !== 1) throw new UserError("Choose the division this manager works in.");
    return { divisionId, partyId: null };
  }
  if (role === "INVESTOR") {
    const partyId = Number(form.get("party_id"));
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_funding_parties WHERE legal_business_id = ? AND id = ?`, [businessId, partyId]);
    if (rows.length !== 1) throw new UserError("Choose which investor this login belongs to.");
    return { divisionId: null, partyId };
  }
  return { divisionId: null, partyId: null };
}

const ROLE_WORDS: Record<string, string> = { ACCOUNTANT: "Accountant", CASHIER: "Cashier", DIVISION_MANAGER: "Manager", AUDITOR: "Auditor", INVESTOR: "Investor" };

async function audit(
  conn: { execute: typeof db.execute },
  businessId: number,
  actorId: number,
  action: string,
  subjectId: number,
  details: Record<string, unknown>
) {
  await conn.execute(
    `INSERT INTO acct_audit_events
       (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, ?, 'USER', ?, ?)`,
    [businessId, actorId, action, subjectId, JSON.stringify(details)]
  );
}

/** A person other than the signed-in owner, who is not an owner themselves. */
async function staffTarget(userId: number, ownerId: number, businessId: number) {
  if (!Number.isInteger(userId) || userId <= 0) throw new UserError("Choose a user.");
  if (userId === ownerId) throw new UserError("You cannot change your own access here.");
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT u.id, u.email,
            SUM(a.role = 'GROUP_OWNER') AS owner_rows
     FROM acct_app_users u
     JOIN acct_user_access a ON a.user_id = u.id AND a.legal_business_id = ?
     WHERE u.id = ?
     GROUP BY u.id, u.email`,
    [businessId, userId]
  );
  if (rows.length !== 1) throw new UserError("That user was not found.");
  if (Number(rows[0].owner_rows) > 0) throw new UserError("A Group Owner cannot be changed here.");
  return rows[0];
}

export async function addUserAction(form: FormData) {
  const owner = await requireGroupOwner();
  let message = "";

  try {
    const fullName = text(form, "full_name");
    const email = text(form, "email").toLowerCase();
    const role = text(form, "role");
    const password = String(form.get("password") ?? "");

    if (fullName.length < 2 || fullName.length > 160) throw new UserError("Enter the person's full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new UserError("Enter a valid email address.");
    checkRole(role);
    checkPassword(password);
    const scope = await scopeFor(role, form, owner.legal_business_id);

    const hash = await bcrypt.hash(password, 12);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [dup] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_app_users WHERE email = ? LIMIT 1`,
        [email]
      );
      if (dup.length > 0) throw new UserError("That email already has a login.");

      const [created] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_app_users (full_name, email, password_hash, status)
         VALUES (?, ?, ?, 'ACTIVE')`,
        [fullName, email, hash]
      );
      await conn.execute(
        `INSERT INTO acct_user_access (user_id, legal_business_id, division_id, role, scope_division_id, party_id)
         VALUES (?, ?, NULL, ?, ?, ?)`,
        [created.insertId, owner.legal_business_id, role, scope.divisionId, scope.partyId]
      );
      await audit(conn, owner.legal_business_id, owner.id, "USER_CREATED", created.insertId, { email, role });
      await conn.commit();
      message = `${fullName} can now sign in as ${ROLE_WORDS[role] ?? role}.`;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  } catch (error) {
    if (error instanceof UserError) back("error", error.message);
    console.error("addUserAction failed", error);
    back("error", "The user could not be added. Nothing was saved.");
  }

  revalidatePath(PAGE);
  back("done", message);
}

export async function changeRoleAction(form: FormData) {
  const owner = await requireGroupOwner();
  let message = "";

  try {
    const userId = Number(form.get("user_id"));
    const role = text(form, "role");
    checkRole(role);
    const scope = await scopeFor(role, form, owner.legal_business_id);
    const target = await staffTarget(userId, owner.id, owner.legal_business_id);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `DELETE FROM acct_user_access WHERE user_id = ? AND legal_business_id = ?`,
        [userId, owner.legal_business_id]
      );
      await conn.execute(
        `INSERT INTO acct_user_access (user_id, legal_business_id, division_id, role, scope_division_id, party_id)
         VALUES (?, ?, NULL, ?, ?, ?)`,
        [userId, owner.legal_business_id, role, scope.divisionId, scope.partyId]
      );
      await audit(conn, owner.legal_business_id, owner.id, "USER_ROLE_CHANGED", userId, { email: target.email, role });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    message = `Access changed for ${target.email}. It applies on their next click.`;
  } catch (error) {
    if (error instanceof UserError) back("error", error.message);
    console.error("changeRoleAction failed", error);
    back("error", "The change could not be saved.");
  }

  revalidatePath(PAGE);
  back("done", message);
}

export async function setUserStatusAction(form: FormData) {
  const owner = await requireGroupOwner();
  let message = "";

  try {
    const userId = Number(form.get("user_id"));
    const status = text(form, "status");
    if (status !== "ACTIVE" && status !== "DISABLED") throw new UserError("Unknown status.");
    const target = await staffTarget(userId, owner.id, owner.legal_business_id);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`UPDATE acct_app_users SET status = ? WHERE id = ?`, [status, userId]);
      if (status === "DISABLED") {
        await conn.execute(`DELETE FROM acct_sessions WHERE user_id = ?`, [userId]);
      }
      await audit(conn, owner.legal_business_id, owner.id, status === "ACTIVE" ? "USER_ENABLED" : "USER_DISABLED", userId, {
        email: target.email,
      });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    message = status === "ACTIVE" ? `${target.email} can sign in again.` : `${target.email} is signed out and can no longer sign in.`;
  } catch (error) {
    if (error instanceof UserError) back("error", error.message);
    console.error("setUserStatusAction failed", error);
    back("error", "The change could not be saved.");
  }

  revalidatePath(PAGE);
  back("done", message);
}

export async function resetPasswordAction(form: FormData) {
  const owner = await requireGroupOwner();
  let message = "";

  try {
    const userId = Number(form.get("user_id"));
    const password = String(form.get("password") ?? "");
    checkPassword(password);
    const target = await staffTarget(userId, owner.id, owner.legal_business_id);
    const hash = await bcrypt.hash(password, 12);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`UPDATE acct_app_users SET password_hash = ? WHERE id = ?`, [hash, userId]);
      await conn.execute(`DELETE FROM acct_sessions WHERE user_id = ?`, [userId]);
      await audit(conn, owner.legal_business_id, owner.id, "USER_PASSWORD_RESET", userId, { email: target.email });
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    message = `New password set for ${target.email}. They are signed out everywhere.`;
  } catch (error) {
    if (error instanceof UserError) back("error", error.message);
    console.error("resetPasswordAction failed", error);
    back("error", "The password could not be changed.");
  }

  revalidatePath(PAGE);
  back("done", message);
}
