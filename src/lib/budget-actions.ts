"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { monthRange, rupeesToPaise } from "@/lib/budget-math";

const PAGE = "/accounting/budgets";

/** Saves the sales target and spending limit for every branch for one month. Empty or 0 means no budget. */
export async function saveBudgetsAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const biz = user.legal_business_id;
  const month = String(form.get("month") ?? "");
  if (!monthRange(month)) redirect(`${PAGE}?result=invalid`);
  try {
    const [branches] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_branches WHERE legal_business_id = ?`, [biz]);
    for (const b of branches) {
      const id = Number(b.id);
      const sales = rupeesToPaise(String(form.get(`sales_${id}`) ?? ""));
      const exp = rupeesToPaise(String(form.get(`exp_${id}`) ?? ""));
      if (sales === null || exp === null) redirect(`${PAGE}?month=${month}&result=invalid`);
      await db.execute(
        `INSERT INTO acct_budgets (legal_business_id, month, branch_id, sales_target, expense_limit, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE sales_target = VALUES(sales_target), expense_limit = VALUES(expense_limit), updated_by = VALUES(updated_by)`,
        [biz, month, id, sales.toString(), exp.toString(), user.id]);
    }
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    redirect(`${PAGE}?month=${month}&result=failed`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?month=${month}&result=saved`);
}
