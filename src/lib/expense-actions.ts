"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";
import { createExpenseCore, ExpenseOutcome } from "@/lib/expense-create";
import { loadLimits } from "@/lib/approval-requests";
import { firstStatus, needsApproval } from "@/lib/approval-rules";
import { isMissingTable } from "@/lib/db-errors";

const PAGE = "/accounting/expenses";

export async function createExpenseAction(form: FormData): Promise<void> {
  const user = await requireAccess("expenses");
  const activeDivisionId = await getActiveDivisionId(user);

  // An expense above the limit is not posted: it waits for a check and a final approval.
  const amountText = String(form.get("amount") ?? "").trim();
  const mode = String(form.get("mode") ?? "CONFIRMED");
  if (mode === "CONFIRMED" && /^\d{1,13}(\.\d{1,2})?$/.test(amountText)) {
    const [w, f = ""] = amountText.split(".");
    const amount = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
    const limits = await loadLimits(db, user.legal_business_id);
    if (needsApproval(user.role, limits.EXPENSE, amount)) {
      const payload: Record<string, string> = { __activeDivision: String(activeDivisionId) };
      for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) payload[k] = v;
      const summary = `${String(form.get("category") ?? "")} · ${String(form.get("description") ?? "").trim()} · ${String(form.get("payee_name") ?? "").trim()}`.slice(0, 300);
      try {
        await db.execute(
          `INSERT INTO acct_approval_requests
             (legal_business_id, kind, amount, summary, payload_json, requested_by, requested_role, status)
           VALUES (?, 'EXPENSE', ?, ?, ?, ?, ?, ?)`,
          [user.legal_business_id, amount.toString(), summary, JSON.stringify(payload), user.id, user.role, firstStatus(user.role)]
        );
      } catch (e) {
        if (isMissingTable(e)) redirect(`${PAGE}?result=approval-setup`);
        throw e;
      }
      redirect(`${PAGE}?result=sent-for-approval`);
    }
  }

  try {
    await createExpenseCore(user, form, { activeDivisionId });
  } catch (e) {
    if (e instanceof ExpenseOutcome) redirect(e.url);
    throw e;
  }
}
