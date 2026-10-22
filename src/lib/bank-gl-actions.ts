
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { getBankReturnPath } from "@/lib/bank-action-navigation";

function getText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidId(value: string): boolean {
  return (
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}

export async function mapBankToGLAction(form: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const bankText = getText(form, "bank_account_id");
  const glText = getText(form, "gl_account_id");

  const back = getBankReturnPath(form);

  if (!isValidId(bankText) || !isValidId(glText)) {
    redirect(`${back}?mapping=invalid`);
  }

  const bankId = Number(bankText);
  const glId = Number(glText);

  const connection = await db.getConnection();
  let outcome = "failed";

  try {
    await connection.beginTransaction();

    // Same lock-order convention as other
    // Abhiram Group financial operations.
    const [businesses] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    if (businesses.length !== 1) {
      outcome = "not-found";
    } else {
      const [bankRows] =
        await connection.execute<RowDataPacket[]>(
          `SELECT
             id,
             ownership_type,
             status,
             gl_account_id
           FROM acct_bank_accounts
           WHERE id = ?
             AND legal_business_id = ?
           FOR UPDATE`,
          [bankId, businessId]
        );

      const bank = bankRows[0];

      if (!bank) {
        outcome = "not-found";
      } else if (
        bank.ownership_type !== "BUSINESS" ||
        bank.status !== "ACTIVE"
      ) {
        outcome = "not-eligible";
      } else if (bank.gl_account_id !== null) {
        // Do not silently replace a mapping.
        // Correcting an existing mapping will
        // require a separate audited workflow.
        outcome = "already-mapped";
      } else {
        const [accounts] =
          await connection.execute<RowDataPacket[]>(
            `SELECT
               id,
               account_code,
               account_type,
               account_subtype,
               normal_balance,
               is_posting_account,
               status
             FROM acct_chart_of_accounts
             WHERE id = ?
               AND legal_business_id = ?
             FOR UPDATE`,
            [glId, businessId]
          );

        const gl = accounts[0];

        if (
          !gl ||
          gl.account_type !== "ASSET" ||
          gl.account_subtype !== "BANK" ||
          gl.normal_balance !== "DEBIT" ||
          Number(gl.is_posting_account) !== 1 ||
          gl.status !== "ACTIVE"
        ) {
          outcome = "invalid-gl";
        } else {
          const [conflicts] =
            await connection.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_bank_accounts
               WHERE legal_business_id = ?
                 AND gl_account_id = ?
               LIMIT 1`,
              [businessId, glId]
            );

          if (conflicts.length) {
            outcome = "gl-in-use";
          } else {
            const [updated] =
              await connection.execute<ResultSetHeader>(
                `UPDATE acct_bank_accounts
                 SET gl_account_id = ?
                 WHERE id = ?
                   AND legal_business_id = ?
                   AND ownership_type = 'BUSINESS'
                   AND status = 'ACTIVE'
                   AND gl_account_id IS NULL`,
                [glId, bankId, businessId]
              );

            if (updated.affectedRows !== 1) {
              outcome = "stale";
            } else {
              await connection.execute(
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
                  "BANK_GL_ACCOUNT_MAPPED",
                  "BANK_ACCOUNT",
                  bankId,
                  JSON.stringify({
                    bank_account_id: bankId,
                    gl_account_id: glId,
                    gl_account_code: gl.account_code,
                  }),
                ]
              );

              await connection.commit();
              outcome = "mapped";
            }
          }
        }
      }
    }

    if (outcome !== "mapped") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});

    console.error("Bank GL mapping failed:", error);
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "mapped") {
    revalidatePath("/accounting/bank-accounts");
    if (back !== "/accounting/bank-accounts") {
      revalidatePath(back);
    }
  }

  redirect(`${back}?mapping=${outcome}`);
}
