import "server-only";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { canUseDivision } from "@/lib/scope";
import { QuickExpenseError, recordQuickExpense } from "@/lib/expense-quick";
import { SPENDING_KINDS } from "@/lib/shop-spending-kinds";

export const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export type ShopSpendUser = { id: number; legal_business_id: number; scope_division_id?: number | null };
export type ShopSpendInput = { kind: string; note: string; payee: string; amount: string; drawerId: number };
export type ShopSpendResult = { id: number; expenseNo: string; duplicate: boolean };

/** Notes a cash payment from a shop drawer as a proper expense. Throws QuickExpenseError with a plain message. */
export async function saveShopSpending(user: ShopSpendUser, input: ShopSpendInput, opts: { skipDuplicateCheck?: boolean } = {}): Promise<ShopSpendResult> {
  const businessId = user.legal_business_id;
  const kind = SPENDING_KINDS[input.kind];
  if (!kind) throw new QuickExpenseError("Choose what the money was spent on.");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [drawers] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, branch_id FROM acct_cash_accounts
       WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [businessId, input.drawerId]
    );
    if (drawers.length !== 1 || !canUseDivision(user, Number(drawers[0].division_id))) throw new QuickExpenseError("That cash drawer is not available.");

    // The same person sending the same entry twice within a minute is a double tap, not two payments.
    if (!opts.skipDuplicateCheck) {
      const [dup] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM acct_expenses
         WHERE legal_business_id = ? AND created_by = ? AND amount = ? AND description = ?
           AND created_at > (NOW() - INTERVAL 60 SECOND) LIMIT 1`,
        [businessId, user.id, input.amount, `${kind.label}: ${input.note}`.slice(0, 500)]
      );
      if (dup.length > 0) {
        await conn.rollback();
        return { id: Number(dup[0].id), expenseNo: "", duplicate: true };
      }
    }

    const saved = await recordQuickExpense(conn, {
      businessId,
      userId: user.id,
      date: todayIst(),
      category: kind.category,
      description: `${kind.label}: ${input.note}`,
      payee: input.payee || undefined,
      amount: input.amount,
      divisionId: drawers[0].division_id === null ? null : Number(drawers[0].division_id),
      branchId: drawers[0].branch_id === null ? null : Number(drawers[0].branch_id),
      pay: { source: "BUSINESS_CASH", accountId: input.drawerId, method: "CASH" },
    });
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'SHOP_SPENDING_NOTED', 'EXPENSE', ?, ?)`,
      [businessId, user.id, saved.id, JSON.stringify({ amount: input.amount, kind: input.kind })]
    );
    await conn.commit();
    return { id: saved.id, expenseNo: saved.expenseNo, duplicate: false };
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}
