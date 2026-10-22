
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

function toPaise(value: string): bigint {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid amount");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export async function recordExpensePaymentAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const expenseId = Number(form.get("expense_id"));
  const source = String(form.get("payment_source") ?? "");
  const method = String(form.get("payment_method") ?? "");
  const date = String(form.get("payment_date") ?? "");
  const amountText = String(form.get("amount") ?? "").trim();
  const accountInput = String(form.get("account_id") ?? "");
  const [accountKind, rawAccountId] = accountInput.split(":");
  const accountId =
    /^(BANK|CASH):[1-9]\d*$/.test(accountInput)
      ? Number(rawAccountId)
      : 0;
  const partyId = Number(form.get("funding_party_id") || 0);
  const reference = String(
    form.get("payment_reference") ?? ""
  ).trim();

  const returnUrl = `/accounting/expenses/${expenseId}`;

  if (
    !Number.isSafeInteger(expenseId) ||
    expenseId <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    ![
      "BUSINESS_BANK", "BUSINESS_CASH",
      "INVESTOR_BANK", "INVESTOR_CASH",
      "OWNER_PERSONAL",
    ].includes(source) ||
    ![
      "CASH", "UPI", "BANK_TRANSFER",
      "CARD", "CHEQUE", "OTHER",
    ].includes(method) ||
    reference.length > 150
  ) {
    redirect("/accounting/expenses?result=invalid");
  }

  const expectsBank = [
    "BUSINESS_BANK",
    "INVESTOR_BANK",
  ].includes(source);

  const expectsCash = source === "BUSINESS_CASH";

  const noAccount = [
    "INVESTOR_CASH",
    "OWNER_PERSONAL",
  ].includes(source);

  if (
    (expectsBank && (
      accountKind !== "BANK" ||
      !Number.isSafeInteger(accountId) ||
      accountId <= 0
    )) ||
    (expectsCash && (
      accountKind !== "CASH" ||
      !Number.isSafeInteger(accountId) ||
      accountId <= 0
    )) ||
    (noAccount && accountInput !== "")
  ) {
    redirect(`${returnUrl}?result=invalid-account`);
  }

  let amount: bigint;
  try {
    amount = toPaise(amountText);
    if (amount <= 0n) throw new Error("Amount must be positive");
  } catch {
    redirect(`${returnUrl}?result=invalid-amount`);
  }

  const conn = await db.getConnection();
  let result = "failed";

  try {
    await conn.beginTransaction();

    await conn.execute(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    const [expenses] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, branch_id, amount, status
       FROM acct_expenses
       WHERE legal_business_id = ? AND id = ?
       FOR UPDATE`,
      [businessId, expenseId]
    );

    const expense = expenses[0];

    if (!expense || expense.status !== "CONFIRMED") {
      result = "not-confirmed";
    } else {
      const [totals] = await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(amount), 0) AS paid
         FROM acct_expense_payments
         WHERE legal_business_id = ?
           AND expense_id = ?
           AND status = 'RECORDED'`,
        [businessId, expenseId]
      );

      const remaining =
        toPaise(String(expense.amount)) -
        toPaise(String(totals[0].paid));

      if (amount > remaining) {
        result = "exceeds-balance";
      } else {
        let bankId: number | null = null;
        let cashId: number | null = null;
        let fundingPartyId: number | null = null;

        if (
          source === "BUSINESS_BANK" ||
          source === "INVESTOR_BANK"
        ) {
          const expectedOwnership =
            source === "BUSINESS_BANK"
              ? "BUSINESS"
              : "INVESTOR";

          const [banks] = await conn.execute<RowDataPacket[]>(
            `SELECT id, funding_party_id
             FROM acct_bank_accounts
             WHERE legal_business_id = ?
               AND id = ?
               AND ownership_type = ?
               AND status = 'ACTIVE'
               AND verification_status = 'VERIFIED'
               AND can_send = 1`,
            [businessId, accountId, expectedOwnership]
          );

          if (banks.length !== 1) {
            result = "invalid-account";
          } else {
            bankId = accountId;
            fundingPartyId =
              source === "INVESTOR_BANK"
                ? Number(banks[0].funding_party_id)
                : null;
          }
        } else if (source === "BUSINESS_CASH") {
          if (method !== "CASH") {
            result = "invalid-method";
          } else {
            const [cash] = await conn.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_cash_accounts
               WHERE legal_business_id = ?
                 AND id = ?
                 AND status = 'ACTIVE'
                 AND (
                   division_id IS NULL OR division_id = ?
                 )
                 AND (
                   branch_id IS NULL OR branch_id = ?
                 )`,
              [
                businessId,
                accountId,
                expense.division_id,
                expense.branch_id,
              ]
            );

            if (cash.length !== 1) {
              result = "invalid-account";
            } else {
              cashId = accountId;
            }
          }
        } else if (source === "INVESTOR_CASH") {
          if (method !== "CASH" ||
              !Number.isSafeInteger(partyId) ||
              partyId <= 0) {
            result = "invalid-account";
          } else {
            const [parties] = await conn.execute<RowDataPacket[]>(
              `SELECT id FROM acct_funding_parties
               WHERE legal_business_id = ?
                 AND id = ?
                 AND status = 'ACTIVE'`,
              [businessId, partyId]
            );

            if (parties.length !== 1) {
              result = "invalid-account";
            } else {
              fundingPartyId = partyId;
            }
          }
        } else if (source === "OWNER_PERSONAL") {
          // Personal money is tracked separately;
          // no business bank/cash balance is reduced.
          if (accountId > 0 || partyId > 0) {
            result = "invalid-account";
          }
        }

        if (result === "failed") {
          await conn.execute(
            `INSERT INTO acct_expense_payments (
               legal_business_id,
               division_id,
               expense_id,
               payment_date,
               payment_method,
               payment_source,
               bank_account_id,
               cash_account_id,
               funding_party_id,
               amount,
               payment_reference,
               status,
               created_by
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                     ?, 'RECORDED', ?)`,
            [
              businessId,
              expense.division_id,
              expenseId,
              date,
              method,
              source,
              bankId,
              cashId,
              fundingPartyId,
              money(amount),
              reference || null,
              user.id,
            ]
          );

          await conn.commit();
          result = "recorded";
        }
      }
    }

    if (result !== "recorded") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Expense payment failed:", error);
    result = "failed";
  } finally {
    conn.release();
  }

  if (result === "recorded") {
    revalidatePath("/accounting/expenses");
    revalidatePath(returnUrl);
    revalidatePath("/accounting/account-balances");
  }

  redirect(`${returnUrl}?result=${encodeURIComponent(result)}`);
}
