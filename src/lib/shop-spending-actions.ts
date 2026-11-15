"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { CASHIER_SPENDING_LIMIT } from "@/lib/access";
import { QuickExpenseError } from "@/lib/expense-quick";
import { SPENDING_KINDS } from "@/lib/shop-spending-kinds";
import { saveShopSpending } from "@/lib/shop-spending-core";
import { loadLimits } from "@/lib/approval-requests";
import { firstStatus, needsApproval } from "@/lib/approval-rules";
import { isMissingTable } from "@/lib/db-errors";

const PAGE = "/accounting/shop-spending";

function go(kind: "saved" | "error", message: string): never {
  redirect(`${PAGE}?${kind}=${encodeURIComponent(message.slice(0, 220))}`);
}

/** Notes a small cash payment from the shop drawer as a proper expense. A cashier above the limit sends it for approval. */
export async function recordShopSpendingAction(formData: FormData) {
  const user = await requireAccess("shop_spending");
  const businessId = user.legal_business_id;
  const text = (n: string) => String(formData.get(n) ?? "").trim();

  const kind = SPENDING_KINDS[text("kind")];
  const note = text("note").slice(0, 200);
  const payee = text("payee").slice(0, 150);
  const amount = text("amount").replaceAll(",", "");
  const drawerId = Number(text("drawer"));
  if (!kind) go("error", "Choose what the money was spent on.");
  if (note.length < 3) go("error", "Write a few words about what it was for.");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) go("error", "Type the amount in rupees, for example 250.");
  if (!Number.isInteger(drawerId) || drawerId <= 0) go("error", "Choose the cash drawer the money came from.");

  // A cashier may note up to the smaller of the fixed cashier limit and the owner's expense limit.
  // Above that the entry is not posted: it waits for a check and a final approval.
  const [w, f = ""] = amount.split(".");
  const paise = BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
  const limits = await loadLimits(db, businessId).catch(() => null);
  const fixed = BigInt(CASHIER_SPENDING_LIMIT) * 100n;
  const cap = limits?.EXPENSE !== null && limits?.EXPENSE !== undefined && limits.EXPENSE < fixed ? limits.EXPENSE : fixed;
  const ownLimit = user.role === "CASHIER" ? cap : (limits?.EXPENSE ?? null);
  if (needsApproval(user.role, ownLimit, paise)) {
    const payload = { kind: text("kind"), note, payee, amount, drawer: String(drawerId) };
    try {
      await db.execute(
        `INSERT INTO acct_approval_requests
           (legal_business_id, kind, amount, summary, payload_json, requested_by, requested_role, status)
         VALUES (?, 'SHOP_SPENDING', ?, ?, ?, ?, ?, ?)`,
        [businessId, paise.toString(), `${kind.label}: ${note}${payee ? ` · ${payee}` : ""}`.slice(0, 300), JSON.stringify(payload), user.id, user.role, firstStatus(user.role)]
      );
    } catch (e) {
      if (isMissingTable(e)) go("error", "Approvals are not set up yet (database step 081 is missing). Nothing was saved.");
      throw e;
    }
    go("saved", "That is above your limit, so it was not noted yet. It has been sent for approval. Follow it on the Approvals page.");
  }

  try {
    const saved = await saveShopSpending(user, { kind: text("kind"), note, payee, amount, drawerId });
    revalidatePath(PAGE);
    revalidatePath("/accounting/cash-closing");
    if (saved.duplicate) go("saved", "Already noted. Nothing was added twice.");
    go("saved", `Noted ₹${Number(amount).toLocaleString("en-IN")} (${saved.expenseNo}).`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error;
    if (error instanceof QuickExpenseError) go("error", error.message);
    console.error("Shop spending failed:", error);
    go("error", "It could not be saved. Nothing was changed.");
  }
}
