"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { CASHIER_SPENDING_LIMIT } from "@/lib/access";
import { QuickExpenseError, recordQuickExpense } from "@/lib/expense-quick";
import { SPENDING_KINDS } from "@/lib/shop-spending-kinds";

const PAGE = "/accounting/shop-spending";

const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function go(kind: "saved" | "error", message: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

/** Notes a small cash payment from the shop drawer as a proper expense. */
export async function recordShopSpendingAction(formData: FormData) {
  const user = await requireAccess("shop_spending");
  const businessId = user.legal_business_id;
  const text = (n: string) => String(formData.get(n) ?? "").trim();

  const kind = SPENDING_KINDS[text("kind")];
  const note = text("note").slice(0, 200);
  const amount = text("amount").replaceAll(",", "");
  const drawerId = Number(text("drawer"));
  if (!kind) go("error", "Choose what the money was spent on.");
  if (note.length < 3) go("error", "Write a few words about what it was for.");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) go("error", "Type the amount in rupees, for example 250.");
  if (!Number.isInteger(drawerId) || drawerId <= 0) go("error", "Choose the cash drawer the money came from.");
  if (user.role === "CASHIER" && Number(amount) > CASHIER_SPENDING_LIMIT) {
    go("error", `Above ₹${CASHIER_SPENDING_LIMIT.toLocaleString("en-IN")} the owner or accountant must record it.`);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [drawers] = await conn.execute<RowDataPacket[]>(
      `SELECT id, division_id, branch_id FROM acct_cash_accounts
       WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [businessId, drawerId]
    );
    if (drawers.length !== 1) throw new QuickExpenseError("That cash drawer is not available.");

    // The same person sending the same entry twice within a minute is a double tap, not two payments.
    const [dup] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_expenses
       WHERE legal_business_id = ? AND created_by = ? AND amount = ? AND description = ?
         AND created_at > (NOW() - INTERVAL 60 SECOND) LIMIT 1`,
      [businessId, user.id, amount, `${kind.label}: ${note}`.slice(0, 500)]
    );
    if (dup.length > 0) {
      await conn.rollback();
      go("saved", "Already noted. Nothing was added twice.");
    }

    const saved = await recordQuickExpense(conn, {
      businessId,
      userId: user.id,
      date: todayIso(),
      category: kind.category,
      description: `${kind.label}: ${note}`,
      amount,
      divisionId: drawers[0].division_id === null ? null : Number(drawers[0].division_id),
      branchId: drawers[0].branch_id === null ? null : Number(drawers[0].branch_id),
      pay: { source: "BUSINESS_CASH", accountId: drawerId, method: "CASH" },
    });
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'SHOP_SPENDING_NOTED', 'EXPENSE', ?, ?)`,
      [businessId, user.id, saved.id, JSON.stringify({ amount, kind: text("kind") })]
    );
    await conn.commit();
    revalidatePath(PAGE);
    revalidatePath("/accounting/cash-closing");
    go("saved", `Noted ₹${Number(amount).toLocaleString("en-IN")} (${saved.expenseNo}).`);
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof QuickExpenseError) go("error", error.message);
    console.error("Shop spending failed:", error);
    go("error", "It could not be saved. Nothing was changed.");
  } finally {
    conn.release();
  }
}
