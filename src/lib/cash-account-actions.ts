
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/cash-accounts";

type CashType =
  | "SHOP_CASH"
  | "PETTY_CASH"
  | "OWNER_HELD"
  | "OTHER";

function field(form: FormData, key: string): string {
  const input = form.get(key);
  return typeof input === "string"
    ? input.trim()
    : "";
}

function parseOptionalId(
  input: string
): number | null | undefined {
  if (input === "") return null;

  if (!/^[1-9]\d*$/.test(input)) {
    return undefined;
  }

  const id = Number(input);

  return Number.isSafeInteger(id)
    ? id
    : undefined;
}

const types = new Set<CashType>([
  "SHOP_CASH",
  "PETTY_CASH",
  "OWNER_HELD",
  "OTHER",
]);

export async function createCashAccountAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const cashCode = field(form, "cash_code")
    .toUpperCase();

  const cashName = field(form, "cash_name");
  const cashType = field(form, "cash_type") as CashType;
  const glCode = field(form, "gl_account_code");
  const custodian = field(form, "custodian_name");
  const notes = field(form, "notes");

  const divisionId = parseOptionalId(
    field(form, "division_id")
  );

  const branchId = parseOptionalId(
    field(form, "branch_id")
  );

  const valid =
    /^[A-Z0-9_-]{2,32}$/.test(cashCode) &&
    cashName.length >= 3 &&
    cashName.length <= 150 &&
    types.has(cashType) &&
    /^1\d{3,5}$/.test(glCode) &&
    custodian.length >= 3 &&
    custodian.length <= 150 &&
    notes.length <= 1000 &&
    divisionId !== undefined &&
    branchId !== undefined &&
    (branchId === null || divisionId !== null) &&
    (
      !["SHOP_CASH", "PETTY_CASH"].includes(cashType) ||
      (divisionId !== null && branchId !== null)
    ) &&
    (
      cashType !== "OWNER_HELD" ||
      (divisionId === null && branchId === null)
    );

  if (!valid) {
    redirect(`${PAGE}?result=invalid`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    // Serialize setup operations for this legal business.
    const [business] =
      await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    if (business.length !== 1) {
      result = "not-found";
    } else {
      const [existing] =
        await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_chart_of_accounts
           WHERE legal_business_id = ?
             AND account_code = ?
           LIMIT 1`,
          [businessId, glCode]
        );

      const [existingCash] =
        await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_cash_accounts
           WHERE legal_business_id = ?
             AND cash_code = ?
           LIMIT 1`,
          [businessId, cashCode]
        );

      if (existing.length || existingCash.length) {
        result = "duplicate";
      } else {
        if (divisionId !== null) {
          const [division] =
            await conn.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_divisions
               WHERE id = ?
                 AND legal_business_id = ?
               LIMIT 1`,
              [divisionId, businessId]
            );

          if (division.length !== 1) {
            result = "invalid-dimension";
          }
        }

        if (
          result !== "invalid-dimension" &&
          branchId !== null
        ) {
          const [branch] =
            await conn.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_branches
               WHERE id = ?
                 AND division_id = ?
                 AND legal_business_id = ?
                 AND status = 'ACTIVE'
               LIMIT 1`,
              [branchId, divisionId, businessId]
            );

          if (branch.length !== 1) {
            result = "invalid-dimension";
          }
        }

        if (result !== "invalid-dimension") {
          const [glInserted] =
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
                 ?, ?, ?,
                 'ASSET', 'CASH', 'DEBIT',
                 NULL, 1, 1,
                 ?, ?, 'ACTIVE', ?, ?
               )`,
              [
                businessId,
                glCode,
                cashName,
                divisionId !== null ? 1 : 0,
                branchId !== null ? 1 : 0,
                `Physical business cash: ${cashCode}`,
                user.id,
              ]
            );

          const [cashInserted] =
            await conn.execute<ResultSetHeader>(
              `INSERT INTO acct_cash_accounts
               (
                 legal_business_id,
                 cash_code,
                 cash_name,
                 cash_type,
                 division_id,
                 branch_id,
                 custodian_name,
                 gl_account_id,
                 status,
                 notes,
                 created_by
               )
               VALUES (
                 ?, ?, ?, ?, ?, ?, ?, ?,
                 'ACTIVE', ?, ?
               )`,
              [
                businessId,
                cashCode,
                cashName,
                cashType,
                divisionId,
                branchId,
                custodian,
                glInserted.insertId,
                notes || null,
                user.id,
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
              businessId,
              user.id,
              "CASH_ACCOUNT_CREATED",
              "CASH_ACCOUNT",
              cashInserted.insertId,
              JSON.stringify({
                cash_code: cashCode,
                cash_type: cashType,
                gl_account_id: glInserted.insertId,
                gl_account_code: glCode,
                division_id: divisionId,
                branch_id: branchId,
              }),
            ]
          );

          await conn.commit();
          result = "created";
        }
      }
    }

    if (result !== "created") {
      await conn.rollback();
    }
  } catch {
    await conn.rollback().catch(() => {});
    console.error("Cash account creation failed");
    result = "failed";
  } finally {
    conn.release();
  }

  if (result === "created") {
    revalidatePath(PAGE);
    revalidatePath("/accounting/chart-of-accounts");
  }

  redirect(`${PAGE}?result=${result}`);
}
