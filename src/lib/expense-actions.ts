"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";

const PAGE = "/accounting/expenses";

const CATEGORIES = new Set([
  "RENT", "ELECTRICITY", "TRANSPORT", "PACKING",
  "SALARY", "MAINTENANCE", "MARKETING",
  "INTERNET_PHONE", "OFFICE_SUPPLIES",
  "BANK_CHARGES", "MISCELLANEOUS",
]);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d;
}

function validMoney(value: string): boolean {
  return /^\d{1,16}(\.\d{1,2})?$/.test(value) &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0 &&
    Number(value) <= 9999999999999999.99;
}

function paise(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"))
  );
}

function segment(value: string): string {
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length < 2) throw new Error("Invalid code");
  return letters.slice(0, 2);
}

export async function createExpenseAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("expenses");
  const TEXTILES_DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const level = String(form.get("allocation_level") ?? "");
  const rawDivision = String(form.get("division_id") ?? "");
  const rawBranch = String(form.get("branch_id") ?? "");
  const expenseDate = String(form.get("expense_date") ?? "");
  const category = String(form.get("category") ?? "");
  const description = String(form.get("description") ?? "").trim();
  const amount = String(form.get("amount") ?? "").trim();
  const remarks = String(form.get("remarks") ?? "").trim();
  const mode = String(form.get("mode") ?? "CONFIRMED");
  const paymentSource = String(
    form.get("initial_payment_source") ?? "UNPAID"
  );

  const paymentDate = String(
    form.get("initial_payment_date") ?? ""
  );

  const paymentMethod = String(
    form.get("initial_payment_method") ?? ""
  );

  const paymentAccount = String(
    form.get("initial_payment_account") ?? ""
  );

  const paidAmount = String(
    form.get("initial_paid_amount") ?? ""
  ).trim();

  const paymentReference = String(
    form.get("initial_payment_reference") ?? ""
  ).trim();

  const investorIdRaw = String(
    form.get("initial_funding_party_id") ?? ""
  );

  const permittedSources = [
    "UNPAID",
    "BUSINESS_BANK",
    "BUSINESS_CASH",
    "INVESTOR_BANK",
    "INVESTOR_CASH",
    "OWNER_PERSONAL",
  ];

  const permittedMethods = [
    "CASH", "UPI", "BANK_TRANSFER",
    "CARD", "CHEQUE", "OTHER",
  ];

  const hasPayment = paymentSource !== "UNPAID";

  const divisionId =
    level === "GROUP" ? null : Number(rawDivision);
  const branchId =
    level === "BRANCH" ? Number(rawBranch) : null;

  const validId = (id: number | null) =>
    id !== null && Number.isSafeInteger(id) && id > 0;

  if (
    !["GROUP", "DIVISION", "BRANCH"].includes(level) ||
    !["DRAFT", "CONFIRMED"].includes(mode) ||
    !validDate(expenseDate) ||
    !CATEGORIES.has(category) ||
    !description || description.length > 500 ||
    remarks.length > 500 ||
    !validMoney(amount) ||
    (level !== "GROUP" && !validId(divisionId)) ||
    (level === "BRANCH" && !validId(branchId))
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  if (
    !permittedSources.includes(paymentSource) ||
    (mode === "DRAFT" && hasPayment) ||
    (
      hasPayment && (
        !validDate(paymentDate) ||
        !permittedMethods.includes(paymentMethod) ||
        paymentReference.length > 150 ||
        !validMoney(paidAmount) ||
        ["BUSINESS_CASH", "INVESTOR_CASH"].includes(paymentSource)
          && paymentMethod !== "CASH"
      )
    )
  ) {
    redirect(`${PAGE}?result=invalid-payment`);
  }

  if (hasPayment && paise(paidAmount) > paise(amount)) {
    redirect(`${PAGE}?result=payment-exceeds-expense`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";
  let createdId = 0;

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      throw new Error("Business not found");
    }

    let divisionCode = "GP";
    let branchCode = "HQ";

    if (level !== "GROUP") {
      // For this release, expenses are restricted to
      // the Abhiram Textiles division.
      if (divisionId !== TEXTILES_DIVISION_ID) {
        outcome = "invalid-division";
      } else {
        const [divisions] = await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_divisions
           WHERE legal_business_id = ? AND id = ?`,
          [businessId, divisionId]
        );

        if (divisions.length !== 1) {
          outcome = "invalid-division";
        } else {
          divisionCode = "AT";
        }
      }
    }

    if (outcome !== "invalid-division" && level === "BRANCH") {
      const [branches] = await conn.execute<RowDataPacket[]>(
        `SELECT branch_code
         FROM acct_branches
         WHERE legal_business_id = ?
           AND division_id = ?
           AND id = ?
           AND status = 'ACTIVE'`,
        [businessId, divisionId, branchId]
      );

      if (branches.length !== 1) {
        outcome = "invalid-branch";
      } else {
        branchCode = segment(String(branches[0].branch_code));
      }
    }

    if (outcome === "failed") {
      // The prefix identifies the allocation scope.
      // EX identifies an expense document.
      const prefix = `AB_${divisionCode}_${branchCode}_EX`;

      await conn.execute(
        `INSERT INTO acct_document_sequences (
           legal_business_id, document_type,
           code_prefix, last_number
         )
         VALUES (?, 'EXPENSE', ?, 0)
         ON DUPLICATE KEY UPDATE id = id`,
        [businessId, prefix]
      );

      const [sequences] = await conn.execute<RowDataPacket[]>(
        `SELECT id, last_number
         FROM acct_document_sequences
         WHERE legal_business_id = ?
           AND document_type = 'EXPENSE'
           AND code_prefix = ?
         FOR UPDATE`,
        [businessId, prefix]
      );

      if (sequences.length !== 1) {
        throw new Error("Expense sequence missing");
      }

      const sequence = sequences[0];
      const next = BigInt(sequence.last_number) + 1n;

      await conn.execute(
        `UPDATE acct_document_sequences
         SET last_number = ?
         WHERE id = ?`,
        [next.toString(), sequence.id]
      );

      const expenseNo =
        `${prefix}_${next.toString().padStart(2, "0")}`;

      const [saved] = await conn.execute<ResultSetHeader>(
        `INSERT INTO acct_expenses (
           legal_business_id, division_id, branch_id,
           allocation_level, expense_no, expense_date,
           category, description, amount, status,
           remarks, created_by, confirmed_by, confirmed_at
         ) VALUES (
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
           ${mode === "CONFIRMED" ? "CURRENT_TIMESTAMP" : "NULL"}
         )`,
        [
          businessId, divisionId, branchId,
          level, expenseNo, expenseDate,
          category, description, amount, mode,
          remarks || null, user.id,
          mode === "CONFIRMED" ? user.id : null,
        ]
      );

      createdId = saved.insertId;

      if (hasPayment) {
        let bankId: number | null = null;
        let cashId: number | null = null;
        let fundingPartyId: number | null = null;

        const bankMatch = /^BANK:([1-9]\d*)$/.exec(paymentAccount);
        const cashMatch = /^CASH:([1-9]\d*)$/.exec(paymentAccount);

        if (
          paymentSource === "BUSINESS_BANK" ||
          paymentSource === "INVESTOR_BANK"
        ) {
          const accountId = bankMatch
            ? Number(bankMatch[1])
            : 0;

          if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new Error("Select a valid paying bank");
          }

          const ownership = paymentSource === "INVESTOR_BANK"
            ? "INVESTOR"
            : "BUSINESS";

          const [bankRows] = await conn.execute<RowDataPacket[]>(
            `SELECT id, funding_party_id
             FROM acct_bank_accounts
             WHERE legal_business_id = ?
               AND id = ?
               AND ownership_type = ?
               AND status = 'ACTIVE'
               AND verification_status = 'VERIFIED'
               AND can_send = 1`,
            [businessId, accountId, ownership]
          );

          if (bankRows.length !== 1) {
            throw new Error("Bank account is not eligible");
          }

          bankId = accountId;

          if (ownership === "INVESTOR") {
            fundingPartyId = Number(bankRows[0].funding_party_id);
          }
        } else if (paymentSource === "BUSINESS_CASH") {
          const accountId = cashMatch
            ? Number(cashMatch[1])
            : 0;

          if (!Number.isSafeInteger(accountId) || accountId <= 0) {
            throw new Error("Select a valid cash account");
          }

          const [cashRows] = await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_cash_accounts
             WHERE legal_business_id = ?
               AND id = ?
               AND status = 'ACTIVE'
               AND (division_id IS NULL OR division_id <=> ?)
               AND (branch_id IS NULL OR branch_id <=> ?)`,
            [businessId, accountId, divisionId, branchId]
          );

          if (cashRows.length !== 1) {
            throw new Error("Cash account is not eligible");
          }

          cashId = accountId;
        } else if (paymentSource === "INVESTOR_CASH") {
          const partyId = Number(investorIdRaw);

          if (
            paymentAccount !== "" ||
            !Number.isSafeInteger(partyId) ||
            partyId <= 0
          ) {
            throw new Error("Select a valid investor");
          }

          const [partyRows] = await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_funding_parties
             WHERE legal_business_id = ?
               AND id = ?
               AND status = 'ACTIVE'`,
            [businessId, partyId]
          );

          if (partyRows.length !== 1) {
            throw new Error("Investor not found");
          }

          fundingPartyId = partyId;
        } else if (
          paymentSource === "OWNER_PERSONAL" &&
          paymentAccount !== ""
        ) {
          throw new Error("Owner personal is not a Group account");
        }

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
           ) VALUES (
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             'RECORDED', ?
           )`,
          [
            businessId,
            divisionId,
            createdId,
            paymentDate,
            paymentMethod,
            paymentSource,
            bankId,
            cashId,
            fundingPartyId,
            paidAmount,
            paymentReference || null,
            user.id,
          ]
        );
      }

      await conn.commit();
      outcome = "created";
    } else {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Create expense failed:", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(PAGE);
    revalidatePath("/accounting/account-balances");
    revalidatePath("/accounting/sales-purchase-report");
  }

  redirect(
    `${PAGE}?result=${encodeURIComponent(outcome)}` +
    (createdId ? `&id=${createdId}` : "")
  );
}
