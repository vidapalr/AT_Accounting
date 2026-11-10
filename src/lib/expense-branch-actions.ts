"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";

/** Gives a head-office / division cost that has no branch the branch it belongs to, so it can reach the books. */
export async function assignExpenseBranchAction(form: FormData): Promise<void> {
  const user = await requireAccess("expenses");
  const businessId = user.legal_business_id;
  const expenseId = Number(form.get("expense_id"));
  const branchId = Number(form.get("branch_id"));
  const back = (result: string) => redirect(`/accounting/expenses/${expenseId}?result=${result}`);
  if (!Number.isSafeInteger(expenseId) || expenseId < 1 || !Number.isSafeInteger(branchId) || branchId < 1) back("invalid-branch");

  const conn = await db.getConnection();
  let outcome = "failed";
  try {
    await conn.beginTransaction();
    const [exp] = await conn.execute<RowDataPacket[]>(
      `SELECT id, allocation_level, status FROM acct_expenses WHERE legal_business_id = ? AND id = ? FOR UPDATE`,
      [businessId, expenseId]
    );
    const [br] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id FROM acct_branches WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`,
      [businessId, branchId]
    );
    const [posted] = await conn.execute<RowDataPacket[]>(
      `SELECT j.id FROM acct_journal_entries j
        WHERE j.legal_business_id = ? AND j.source_type IN ('EXPENSE','EXPENSE_PAYMENT','SETUP_CAPITALISATION') AND j.status = 'POSTED'
          AND j.source_id IN (?, ?)
          AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r WHERE r.legal_business_id = j.legal_business_id AND r.original_journal_id = j.id) LIMIT 1`,
      [businessId, expenseId, expenseId]
    );
    if (exp.length !== 1 || br.length !== 1) outcome = "invalid-branch";
    else if (exp[0].allocation_level === "BRANCH") outcome = "invalid";
    else if (posted.length > 0) outcome = "already-in-books";
    else {
      const divisionId = Number(br[0].division_id);
      await conn.execute(
        `UPDATE acct_expenses SET allocation_level = 'BRANCH', division_id = ?, branch_id = ? WHERE legal_business_id = ? AND id = ?`,
        [divisionId, branchId, businessId, expenseId]
      );
      await conn.execute(`UPDATE acct_expense_payments SET division_id = ? WHERE legal_business_id = ? AND expense_id = ?`, [divisionId, businessId, expenseId]);
      await conn.execute(
        `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
         VALUES (?, ?, 'EXPENSE_BRANCH_ASSIGNED', 'EXPENSE', ?, ?)`,
        [businessId, user.id, expenseId, JSON.stringify({ branchId, divisionId })]
      );
      await conn.commit();
      outcome = "branch-set";
    }
    if (outcome !== "branch-set") await conn.rollback();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Assign expense branch failed", error);
  } finally {
    conn.release();
  }
  revalidatePath(`/accounting/expenses/${expenseId}`);
  revalidatePath("/accounting/expenses");
  back(outcome);
}
