
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/chart-of-accounts";

type AccountType =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

const NORMAL: Record<AccountType, "DEBIT" | "CREDIT"> = {
  ASSET: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  REVENUE: "CREDIT",
  EXPENSE: "DEBIT",
};

function value(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function id(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function bool(form: FormData, key: string): number {
  return form.get(key) === "yes" ? 1 : 0;
}

export async function createLedgerAccountAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const code = value(form, "account_code").toUpperCase();
  const name = value(form, "account_name");
  const type = value(form, "account_type") as AccountType;
  const subtype = value(form, "account_subtype").toUpperCase();
  const description = value(form, "description");
  const requiresDivision = bool(form, "requires_division");
  const requiresBranch = bool(form, "requires_branch");

  if (
    !/^[A-Z0-9-]{3,20}$/.test(code) ||
    name.length < 3 ||
    name.length > 150 ||
    !Object.hasOwn(NORMAL, type) ||
    !/^[A-Z0-9_]{2,60}$/.test(subtype) ||
    description.length > 3000 ||
    (requiresBranch === 1 && requiresDivision !== 1)
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  const accountPrefixes: Record<AccountType, string[]> = {
    ASSET: ["1"],
    LIABILITY: ["2"],
    EQUITY: ["3"],
    REVENUE: ["4", "7"],
    EXPENSE: ["5", "6", "7"],
  };

  if (
    !/^\d{4,6}$/.test(code) ||
    !accountPrefixes[type].some((prefix) =>
      code.startsWith(prefix)
    )
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  if (
    subtype === "BANK" ||
    subtype === "CASH" ||
    subtype.startsWith("CONTRA_")
  ) {
    redirect(`${PAGE}?result=restricted-subtype`);
  }

  if (subtype === "DRAWINGS") {
    redirect(`${PAGE}?result=restricted-subtype`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    if (!business.length) {
      result = "not-found";
    } else {
      const [existing] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_chart_of_accounts
         WHERE legal_business_id = ?
           AND account_code = ?`,
        [businessId, code]
      );

      if (existing.length) {
        result = "duplicate";
      } else {
        const [inserted] =
          await conn.execute<ResultSetHeader>(
            `INSERT INTO acct_chart_of_accounts
             (
               legal_business_id,
               account_code,
               account_name,
               account_type,
               account_subtype,
               normal_balance,
               parent_account_id,
               is_posting_account,
               is_system_account,
               requires_division,
               requires_branch,
               status,
               description,
               created_by
             )
             VALUES (
               ?, ?, ?, ?, ?, ?, NULL,
               1, 0, ?, ?, 'ACTIVE', ?, ?
             )`,
            [
              businessId, code, name, type, subtype,
              NORMAL[type], requiresDivision,
              requiresBranch, description || null, user.id,
            ]
          );

        await conn.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId, user.id,
            "LEDGER_ACCOUNT_CREATED",
            "CHART_OF_ACCOUNTS",
            inserted.insertId,
            JSON.stringify({
              account_code: code,
              account_type: type,
              account_subtype: subtype,
            }),
          ]
        );

        await conn.commit();
        result = "created";
      }
    }

    if (result !== "created") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Create ledger account failed:", error);
  } finally {
    conn.release();
  }

  if (result === "created") revalidatePath(PAGE);
  redirect(`${PAGE}?result=${result}`);
}

export async function updateLedgerAccountAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const accountId = id(value(form, "account_id"));
  const name = value(form, "account_name");
  const description = value(form, "description");
  const requiresDivision = bool(form, "requires_division");
  const requiresBranch = bool(form, "requires_branch");

  if (
    !accountId ||
    name.length < 3 ||
    name.length > 150 ||
    description.length > 3000 ||
    (requiresBranch === 1 && requiresDivision !== 1)
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [accounts] = await conn.execute<RowDataPacket[]>(
      `SELECT
         id,
         account_name,
         account_type,
         account_subtype,
         is_system_account,
         requires_division,
         requires_branch
       FROM acct_chart_of_accounts
       WHERE id = ?
         AND legal_business_id = ?
       FOR UPDATE`,
      [accountId, businessId]
    );

    const account = accounts[0];

    if (!business.length || !account) {
      result = "not-found";
    } else {
      const [bankRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_bank_accounts
         WHERE legal_business_id = ?
           AND gl_account_id = ?
         LIMIT 1`,
        [businessId, accountId]
      );

      const bankMapped = bankRows.length > 0;

      // Protected system accounts and mapped bank
      // accounts cannot be renamed or have their
      // dimensions changed through this screen.
      if (
        bankMapped ||
        Number(account.is_system_account) === 1
      ) {
        result = "protected";
      } else {
        await conn.execute(
          `UPDATE acct_chart_of_accounts
           SET account_name = ?,
               description = ?,
               requires_division = ?,
               requires_branch = ?
           WHERE id = ? AND legal_business_id = ?`,
          [
            name, description || null,
            requiresDivision, requiresBranch,
            accountId, businessId,
          ]
        );

        await conn.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId, user.id,
            "LEDGER_ACCOUNT_UPDATED",
            "CHART_OF_ACCOUNTS",
            accountId,
            JSON.stringify({
              previous_name: account.account_name,
              new_name: name,
              requires_division: requiresDivision,
              requires_branch: requiresBranch,
            }),
          ]
        );

        await conn.commit();
        result = "updated";
      }
    }

    if (result !== "updated") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Update ledger account failed:", error);
  } finally {
    conn.release();
  }

  if (result === "updated") revalidatePath(PAGE);
  redirect(`${PAGE}?result=${result}`);
}

export async function changeLedgerAccountStatusAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const accountId = id(value(form, "account_id"));
  const targetStatus = value(form, "target_status");

  if (
    !accountId ||
    !["ACTIVE", "INACTIVE"].includes(targetStatus)
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [accounts] = await conn.execute<RowDataPacket[]>(
      `SELECT id, status, is_system_account
       FROM acct_chart_of_accounts
       WHERE id = ? AND legal_business_id = ?
       FOR UPDATE`,
      [accountId, businessId]
    );

    const account = accounts[0];

    if (!business.length || !account) {
      result = "not-found";
    } else if (
      Number(account.is_system_account) === 1
    ) {
      result = "protected";
    } else if (account.status === targetStatus) {
      result = "no-change";
    } else {
      const [bank] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_bank_accounts
         WHERE legal_business_id = ?
           AND gl_account_id = ?
         LIMIT 1`,
        [businessId, accountId]
      );

      if (bank.length > 0) {
        result = "bank-in-use";
      } else {
        await conn.execute(
          `UPDATE acct_chart_of_accounts
           SET status = ?
           WHERE id = ? AND legal_business_id = ?`,
          [targetStatus, accountId, businessId]
        );

        await conn.execute(
          `INSERT INTO acct_audit_events
           (
             legal_business_id,
             actor_user_id,
             action,
             subject_type,
             subject_id,
             details_json
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            businessId, user.id,
            "LEDGER_ACCOUNT_STATUS_CHANGED",
            "CHART_OF_ACCOUNTS",
            accountId,
            JSON.stringify({
              previous_status: account.status,
              new_status: targetStatus,
            }),
          ]
        );

        await conn.commit();
        result = "status-changed";
      }
    }

    if (result !== "status-changed") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Account status update failed:", error);
  } finally {
    conn.release();
  }

  if (result === "status-changed") revalidatePath(PAGE);
  redirect(`${PAGE}?result=${result}`);
}
