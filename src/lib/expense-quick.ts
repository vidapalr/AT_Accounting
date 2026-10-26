import "server-only";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

export class QuickExpenseError extends Error {}

export type QuickExpense = {
  businessId: number;
  userId: number;
  date: string;
  category: string;
  description: string;
  amount: string; // plain rupees, two decimals at most, greater than zero
  /** Paid in cash or bank now, when that is less than the whole amount (the rest is settled another way). Zero means no cash or bank payment. */
  payAmount?: string;
  remarks?: string;
  divisionId: number | null;
  branchId: number | null;
  pay: {
    source: "BUSINESS_CASH" | "BUSINESS_BANK";
    accountId: number;
    method: "CASH" | "UPI" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER";
    reference?: string;
  };
};

const letters2 = (value: string) => {
  const l = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (l.length < 2) throw new QuickExpenseError("The branch code is not usable for numbering.");
  return l.slice(0, 2);
};

/**
 * Saves a confirmed expense and the payment that settled it, in one go, the same way
 * the full Expenses screen does. Call inside a transaction. Returns the new expense.
 */
export async function recordQuickExpense(conn: PoolConnection, e: QuickExpense): Promise<{ id: number; expenseNo: string }> {
  const level = e.branchId ? "BRANCH" : e.divisionId ? "DIVISION" : "GROUP";

  let divisionCode = "GP";
  let branchCode = "HQ";
  if (level !== "GROUP") {
    divisionCode = "AT";
    if (level === "BRANCH") {
      const [branches] = await conn.execute<RowDataPacket[]>(
        `SELECT branch_code FROM acct_branches
         WHERE legal_business_id = ? AND division_id = ? AND id = ? AND status = 'ACTIVE'`,
        [e.businessId, e.divisionId, e.branchId]
      );
      if (branches.length !== 1) throw new QuickExpenseError("That branch is not available.");
      branchCode = letters2(String(branches[0].branch_code));
    }
  }

  // The account paying must exist, be active and belong to this place.
  let bankId: number | null = null;
  let cashId: number | null = null;
  if (e.pay.source === "BUSINESS_CASH") {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_cash_accounts
       WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'
         AND (division_id IS NULL OR division_id <=> ?) AND (branch_id IS NULL OR branch_id <=> ?)`,
      [e.businessId, e.pay.accountId, e.divisionId, e.branchId]
    );
    if (rows.length !== 1) throw new QuickExpenseError("That cash drawer cannot be used here.");
    cashId = e.pay.accountId;
  } else {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_bank_accounts
       WHERE legal_business_id = ? AND id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE'
         AND verification_status = 'VERIFIED' AND can_send = 1`,
      [e.businessId, e.pay.accountId]
    );
    if (rows.length !== 1) throw new QuickExpenseError("That bank account cannot be used for payments.");
    bankId = e.pay.accountId;
  }

  const prefix = `AB_${divisionCode}_${branchCode}_EX`;
  await conn.execute(
    `INSERT INTO acct_document_sequences (legal_business_id, document_type, code_prefix, last_number)
     VALUES (?, 'EXPENSE', ?, 0) ON DUPLICATE KEY UPDATE id = id`,
    [e.businessId, prefix]
  );
  const [seq] = await conn.execute<RowDataPacket[]>(
    `SELECT id, last_number FROM acct_document_sequences
     WHERE legal_business_id = ? AND document_type = 'EXPENSE' AND code_prefix = ? FOR UPDATE`,
    [e.businessId, prefix]
  );
  if (seq.length !== 1) throw new Error("Expense sequence missing");
  // Never reuse a number: also look at expenses already saved with this prefix.
  const [used] = await conn.execute<RowDataPacket[]>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(expense_no, '_', -1) AS UNSIGNED)), 0) AS top
     FROM acct_expenses WHERE legal_business_id = ? AND expense_no LIKE ?`,
    [e.businessId, `${prefix}\\_%`]
  );
  const counter = BigInt(seq[0].last_number);
  const highest = BigInt(used[0]?.top ?? 0);
  const next = (counter > highest ? counter : highest) + 1n;
  await conn.execute(`UPDATE acct_document_sequences SET last_number = ? WHERE id = ?`, [next.toString(), seq[0].id]);
  const expenseNo = `${prefix}_${next.toString().padStart(2, "0")}`;

  const [saved] = await conn.execute<ResultSetHeader>(
    `INSERT INTO acct_expenses
       (legal_business_id, division_id, branch_id, allocation_level, expense_no, expense_date,
        category, description, amount, status, remarks, created_by, confirmed_by, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      e.businessId, e.divisionId, e.branchId, level, expenseNo, e.date,
      e.category, e.description.slice(0, 500), e.amount, e.remarks || null, e.userId, e.userId,
    ]
  );
  const paid = e.payAmount ?? e.amount;
  if (Number(paid) > 0) {
    await conn.execute(
      `INSERT INTO acct_expense_payments
         (legal_business_id, division_id, expense_id, payment_date, payment_method, payment_source,
          bank_account_id, cash_account_id, amount, payment_reference, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECORDED', ?)`,
      [
        e.businessId, e.divisionId, saved.insertId, e.date, e.pay.method, e.pay.source,
        bankId, cashId, paid, e.pay.reference || null, e.userId,
      ]
    );
  }
  return { id: saved.insertId, expenseNo };
}
