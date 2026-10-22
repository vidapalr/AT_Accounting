
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

const PAGE = "/accounting/advances-deposits";

const ADVANCE_TYPES = new Set([
  "REFUNDABLE_SHOP_DEPOSIT",
  "SUPPLIER_ADVANCE",
  "EMPLOYEE_ADVANCE",
  "PREPAID_RENT",
  "OTHER",
]);

const PAYMENT_METHODS = new Set([
  "CASH", "UPI", "BANK_TRANSFER",
  "CARD", "CHEQUE", "OTHER",
]);

const PAYMENT_SOURCES = new Set([
  "BUSINESS_BANK", "BUSINESS_CASH",
  "INVESTOR_BANK", "INVESTOR_CASH",
  "OWNER_PERSONAL",
]);

function parseMoney(value: string): string {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) {
    throw new Error("Invalid amount");
  }

  const [whole, fraction = ""] = value.split(".");
  const paise =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  if (paise <= 0n || paise > 999999999999999999n) {
    throw new Error("Amount outside permitted range");
  }

  return `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  return date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d;
}

function redirectResult(code: string): never {
  redirect(`${PAGE}?result=${encodeURIComponent(code)}`);
}

export async function createAdvanceAction(
  form: FormData
): Promise<void> {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;

  const allocation = String(
    form.get("allocation_level") ?? ""
  );

  const divisionId =
    allocation === "GROUP"
      ? null
      : Number(form.get("division_id"));

  const branchId =
    allocation === "BRANCH"
      ? Number(form.get("branch_id"))
      : null;

  const advanceType = String(
    form.get("advance_type") ?? ""
  );

  const date = String(form.get("advance_date") ?? "");
  const recipient = String(
    form.get("recipient_name") ?? ""
  ).trim();

  const description = String(
    form.get("description") ?? ""
  ).trim();

  const amountInput = String(form.get("amount") ?? "");
  const source = String(form.get("payment_source") ?? "");
  const method = String(form.get("payment_method") ?? "");
  const account = String(form.get("payment_account") ?? "");
  const partyInput = String(
    form.get("funding_party_id") ?? ""
  );

  const reference = String(
    form.get("payment_reference") ?? ""
  ).trim();

  const remarks = String(form.get("remarks") ?? "").trim();

  const validId = (id: number | null) =>
    id !== null &&
    Number.isSafeInteger(id) &&
    id > 0;

  if (
    !["GROUP", "DIVISION", "BRANCH"].includes(allocation) ||
    !ADVANCE_TYPES.has(advanceType) ||
    !PAYMENT_SOURCES.has(source) ||
    !PAYMENT_METHODS.has(method) ||
    !isDate(date) ||
    !recipient ||
    recipient.length > 180 ||
    !description ||
    description.length > 500 ||
    remarks.length > 500 ||
    reference.length > 150 ||
    (allocation !== "GROUP" && !validId(divisionId)) ||
    (allocation === "BRANCH" && !validId(branchId)) ||
    (["BUSINESS_CASH", "INVESTOR_CASH"].includes(source) &&
      method !== "CASH")
  ) {
    redirectResult("invalid");
  }

  let amount: string;

  try {
    amount = parseMoney(amountInput);
  } catch {
    redirectResult("invalid-amount");
  }

  const conn = await db.getConnection();
  let outcome = "failed";
  let advanceId = 0;

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      throw new Error("Business not found");
    }

    let divisionSegment = "GP";
    let branchSegment = "HQ";

    if (divisionId !== null) {
      const [division] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_divisions
         WHERE legal_business_id = ? AND id = ?`,
        [businessId, divisionId]
      );

      if (division.length !== 1) {
        throw new Error("Division not found");
      }

      // Current implementation: Abhiram Textiles.
      if (divisionId !== 1) {
        throw new Error("Unsupported division");
      }

      divisionSegment = "AT";
    }

    if (branchId !== null) {
      const [branch] = await conn.execute<RowDataPacket[]>(
        `SELECT branch_code
         FROM acct_branches
         WHERE legal_business_id = ?
           AND division_id = ?
           AND id = ?
           AND status = 'ACTIVE'`,
        [businessId, divisionId, branchId]
      );

      if (branch.length !== 1) {
        throw new Error("Branch not found");
      }

      const letters = String(branch[0].branch_code)
        .toUpperCase()
        .replace(/[^A-Z]/g, "");

      if (letters.length < 2) {
        throw new Error("Invalid branch prefix");
      }

      branchSegment = letters.slice(0, 2);
    }

    let bankId: number | null = null;
    let cashId: number | null = null;
    let partyId: number | null = null;

    const bankMatch = /^BANK:([1-9]\d*)$/.exec(account);
    const cashMatch = /^CASH:([1-9]\d*)$/.exec(account);

    if (source === "BUSINESS_BANK" ||
        source === "INVESTOR_BANK") {
      const id = bankMatch ? Number(bankMatch[1]) : 0;

      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("Invalid bank selection");
      }

      const ownership =
        source === "INVESTOR_BANK"
          ? "INVESTOR"
          : "BUSINESS";

      const [banks] = await conn.execute<RowDataPacket[]>(
        `SELECT id, funding_party_id
         FROM acct_bank_accounts
         WHERE legal_business_id = ?
           AND id = ?
           AND ownership_type = ?
           AND status = 'ACTIVE'
           AND verification_status = 'VERIFIED'
           AND can_send = 1`,
        [businessId, id, ownership]
      );

      if (banks.length !== 1) {
        throw new Error("Paying bank is unavailable");
      }

      bankId = id;
      partyId = ownership === "INVESTOR"
        ? Number(banks[0].funding_party_id)
        : null;

    } else if (source === "BUSINESS_CASH") {
      const id = cashMatch ? Number(cashMatch[1]) : 0;

      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("Invalid cash selection");
      }

      const [cash] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_cash_accounts
         WHERE legal_business_id = ?
           AND id = ?
           AND status = 'ACTIVE'`,
        [businessId, id]
      );

      if (cash.length !== 1) {
        throw new Error("Cash account unavailable");
      }

      cashId = id;

    } else if (source === "INVESTOR_CASH") {
      partyId = Number(partyInput);

      if (
        account !== "" ||
        !Number.isSafeInteger(partyId) ||
        partyId <= 0
      ) {
        throw new Error("Invalid investor cash payment");
      }

      const [investors] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_funding_parties
         WHERE legal_business_id = ?
           AND id = ?
           AND status = 'ACTIVE'`,
        [businessId, partyId]
      );

      if (investors.length !== 1) {
        throw new Error("Investor unavailable");
      }

    } else if (source === "OWNER_PERSONAL") {
      if (account !== "") {
        throw new Error("Owner funds cannot use a Group account");
      }
    }

    const prefix =
      `AB_${divisionSegment}_${branchSegment}_AD`;

    await conn.execute(
      `INSERT INTO acct_document_sequences (
         legal_business_id,
         document_type,
         code_prefix,
         last_number
       ) VALUES (?, 'ADVANCE', ?, 0)
       ON DUPLICATE KEY UPDATE id = id`,
      [businessId, prefix]
    );

    const [sequence] = await conn.execute<RowDataPacket[]>(
      `SELECT id, last_number
       FROM acct_document_sequences
       WHERE legal_business_id = ?
         AND document_type = 'ADVANCE'
         AND code_prefix = ?
       FOR UPDATE`,
      [businessId, prefix]
    );

    if (sequence.length !== 1) {
      throw new Error("Advance sequence missing");
    }

    const next = BigInt(sequence[0].last_number) + 1n;

    await conn.execute(
      `UPDATE acct_document_sequences
       SET last_number = ?
       WHERE id = ?`,
      [next.toString(), sequence[0].id]
    );

    const advanceNo =
      `${prefix}_${next.toString().padStart(2, "0")}`;

    const [saved] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_advances (
         legal_business_id,
         division_id,
         branch_id,
         advance_no,
         advance_type,
         advance_date,
         recipient_name,
         description,
         original_amount,
         status,
         remarks,
         created_by
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?,
         'ACTIVE', ?, ?
       )`,
      [
        businessId,
        divisionId,
        branchId,
        advanceNo,
        advanceType,
        date,
        recipient,
        description,
        amount,
        remarks || null,
        user.id,
      ]
    );

    advanceId = saved.insertId;

    await conn.execute(
      `INSERT INTO acct_advance_transactions (
         legal_business_id,
         advance_id,
         transaction_date,
         transaction_type,
         amount,
         payment_method,
         payment_source,
         bank_account_id,
         cash_account_id,
         funding_party_id,
         payment_reference,
         remarks,
         status,
         created_by
       ) VALUES (
         ?, ?, ?, 'ADVANCE_PAID', ?, ?, ?, ?, ?, ?, ?,
         ?, 'CONFIRMED', ?
       )`,
      [
        businessId,
        advanceId,
        date,
        amount,
        method,
        source,
        bankId,
        cashId,
        partyId,
        reference || null,
        "Original advance payment",
        user.id,
      ]
    );

    await conn.commit();
    outcome = "created";

  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Advance creation failed:", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(PAGE);
    revalidatePath("/accounting/account-balances");
  }

  redirect(
    `${PAGE}?result=${outcome}` +
    (advanceId ? `&id=${advanceId}` : "")
  );
}
