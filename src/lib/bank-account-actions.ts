
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  protectBankAccount,
} from "@/lib/bank-crypto";

function field(
  data: FormData,
  name: string
): string {
  const value = data.get(name);
  return typeof value === "string"
    ? value.trim()
    : "";
}

function validId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

export async function createBankAccountAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const ownership = field(form, "ownership_type");
  const partyText = field(form, "funding_party_id");
  const label = field(form, "account_label");
  const holder = field(form, "account_holder_name");
  const bank = field(form, "bank_name");
  const branch = field(form, "branch_name");
  const ifsc = field(form, "ifsc_code").toUpperCase();
  const accountType = field(form, "account_type");
  const notes = field(form, "notes");

  const canReceive =
    form.get("can_receive") === "yes" ? 1 : 0;

  const canSend =
    form.get("can_send") === "yes" ? 1 : 0;

  const partyId =
    ownership === "INVESTOR" && validId(partyText)
      ? Number(partyText)
      : null;

  const invalid =
    !["BUSINESS", "INVESTOR"].includes(ownership) ||
    (ownership === "INVESTOR" && partyId === null) ||
    label.length < 2 || label.length > 120 ||
    holder.length < 2 || holder.length > 160 ||
    bank.length < 2 || bank.length > 160 ||
    branch.length > 160 ||
    !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) ||
    !["CURRENT", "SAVINGS", "OD_CC", "OTHER"]
      .includes(accountType) ||
    notes.length > 2000 ||
    (canReceive === 0 && canSend === 0);

  if (invalid) {
    redirect("/accounting/bank-accounts?result=invalid");
  }

  let protectedNumber: ReturnType<
    typeof protectBankAccount
  >;

  try {
    protectedNumber = protectBankAccount(
      field(form, "account_number")
    );
  } catch {
    redirect(
      "/accounting/bank-accounts?result=invalid-number"
    );
  }

  const connection = await db.getConnection();
  let outcome = "failed";

  try {
    await connection.beginTransaction();

    const [business] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    if (business.length !== 1) {
      outcome = "invalid";
    } else {
      if (partyId !== null) {
        const [parties] =
          await connection.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_funding_parties
             WHERE id = ?
               AND legal_business_id = ?
             LIMIT 1`,
            [partyId, businessId]
          );

        if (parties.length !== 1) {
          outcome = "invalid-party";
        }
      }

      if (outcome !== "invalid-party") {
        const [duplicates] =
          await connection.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_bank_accounts
             WHERE legal_business_id = ?
               AND account_number_fingerprint = ?
             LIMIT 1`,
            [
              businessId,
              protectedNumber.fingerprint,
            ]
          );

        if (duplicates.length > 0) {
          outcome = "duplicate";
        } else {
          const [result] =
            await connection.execute<ResultSetHeader>(
              `INSERT INTO acct_bank_accounts
               (
                 legal_business_id,
                 ownership_type,
                 funding_party_id,
                 account_label,
                 account_holder_name,
                 bank_name,
                 branch_name,
                 ifsc_code,
                 account_type,
                 account_number_encrypted,
                 account_number_iv,
                 account_number_auth_tag,
                 account_number_last4,
                 account_number_fingerprint,
                 can_receive,
                 can_send,
                 status,
                 verification_status,
                 notes,
                 created_by
               )
               VALUES (
                 ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?,
                 'ACTIVE', 'UNVERIFIED', ?, ?
               )`,
              [
                businessId,
                ownership,
                partyId,
                label,
                holder,
                bank,
                branch || null,
                ifsc,
                accountType,
                protectedNumber.encrypted,
                protectedNumber.iv,
                protectedNumber.authTag,
                protectedNumber.last4,
                protectedNumber.fingerprint,
                canReceive,
                canSend,
                notes || null,
                user.id,
              ]
            );

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
              "BANK_ACCOUNT_CREATED",
              "BANK_ACCOUNT",
              result.insertId,
              JSON.stringify({
                ownership_type: ownership,
                funding_party_id: partyId,
                bank_name: bank,
                account_last4: protectedNumber.last4,
                // Never log the full account number.
              }),
            ]
          );

          await connection.commit();
          outcome = "created";
        }
      }
    }

    if (outcome !== "created") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    // Never log the submitted FormData.
    console.error(
      "Bank account registration failed"
    );
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "created") {
    revalidatePath("/accounting/bank-accounts");
  }

  redirect(
    `/accounting/bank-accounts?result=${outcome}`
  );
}
