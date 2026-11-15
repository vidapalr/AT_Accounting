import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { APPROVAL_KINDS, limitKey, parseLimit, type ApprovalKind } from "@/lib/approval-rules";
import { createExpenseCore, ExpenseOutcome } from "@/lib/expense-create";
import { QuickExpenseError } from "@/lib/expense-quick";
import { saveShopSpending } from "@/lib/shop-spending-core";
import { paySupplierCore, SupplierPayOutcome } from "@/lib/supplier-pay-create";

type Row = RowDataPacket & Record<string, unknown>;

/** The limit for each kind in paise, or null when none is set. */
export async function loadLimits(db: Pool, businessId: number): Promise<Record<ApprovalKind, bigint | null>> {
  const [rows] = await db.execute<Row[]>(
    `SELECT setting_key, setting_value FROM acct_business_settings
      WHERE legal_business_id = ? AND setting_key LIKE 'approval\\_limit\\_%'`, [businessId]);
  const byKey = new Map(rows.map((r) => [String(r.setting_key), String(r.setting_value)]));
  const out = {} as Record<ApprovalKind, bigint | null>;
  for (const k of APPROVAL_KINDS) out[k] = parseLimit(byKey.get(limitKey(k)));
  return out;
}

export type ReplayResult = { ok: boolean; id: number | null; note: string };

const EXPENSE_PROBLEMS: Record<string, string> = {
  invalid: "Some details are not valid.",
  "invalid-payment": "The payment details are not valid.",
  "payment-exceeds-expense": "The payment is more than the expense.",
  "invalid-division": "The division is not available.",
  "invalid-branch": "The branch is not available.",
  "choose-branch": "No branch was chosen.",
  failed: "The entry could not be saved.",
};
const SUPPLIER_PROBLEMS: Record<string, string> = {
  invalid: "Some details are not valid.",
  "source-invalid": "That account, investor or agreement can no longer be used.",
  "more-than-owed": "That is more than is owed to this supplier now.",
  "parts-differ": "The amounts against the bills do not add up.",
  "part-too-big": "One bill has more against it than is still due.",
  "duplicate-reference": "A payment with this reference was already saved.",
  failed: "The payment could not be saved.",
};

/** Posts an approved request by running the normal save code as the person who asked. */
export async function replayRequest(
  db: Pool,
  kind: string,
  payload: Record<string, string>,
  requesterId: number,
  approverName: string
): Promise<ReplayResult> {
  if (kind !== "EXPENSE" && kind !== "SUPPLIER_PAYMENT" && kind !== "SHOP_SPENDING") {
    return { ok: false, id: null, note: "This kind cannot be posted by approval yet." };
  }

  const [users] = await db.execute<Row[]>(
    `SELECT u.id, a.legal_business_id, a.scope_division_id
       FROM acct_app_users u JOIN acct_user_access a ON a.user_id = u.id
      WHERE u.id = ? AND u.status = 'ACTIVE' AND a.division_id IS NULL
      ORDER BY FIELD(a.role, 'GROUP_OWNER', 'ACCOUNTANT', 'DIVISION_MANAGER', 'CASHIER') LIMIT 1`, [requesterId]);
  if (!users[0]) return { ok: false, id: null, note: "The person who asked no longer has access." };
  const user = {
    id: Number(users[0].id),
    legal_business_id: Number(users[0].legal_business_id),
    scope_division_id: users[0].scope_division_id === null ? null : Number(users[0].scope_division_id),
  };

  if (kind === "SHOP_SPENDING") {
    const tag = ` · Approved by ${approverName}`;
    try {
      const saved = await saveShopSpending(
        user,
        { kind: String(payload.kind ?? ""), note: String(payload.note ?? "").slice(0, 200 - tag.length) + tag, payee: String(payload.payee ?? ""), amount: String(payload.amount ?? ""), drawerId: Number(payload.drawer) },
        { skipDuplicateCheck: true }
      );
      return { ok: true, id: saved.id, note: `Posted as ${saved.expenseNo}.` };
    } catch (e) {
      if (e instanceof QuickExpenseError) return { ok: false, id: null, note: e.message };
      console.error("Approved shop spending failed:", e);
      return { ok: false, id: null, note: "The entry could not be saved." };
    }
  }

  const form = new FormData();
  for (const [k, v] of Object.entries(payload)) if (!k.startsWith("__")) form.set(k, v);
  const tag = `Approved by ${approverName}`;
  const base = String(payload.remarks ?? "").trim().slice(0, 500 - tag.length - 3);
  form.set("remarks", base ? `${base} · ${tag}` : tag);
  const activeDivisionId = Number(payload.__activeDivision) || undefined;

  const problems = kind === "EXPENSE" ? EXPENSE_PROBLEMS : SUPPLIER_PROBLEMS;
  try {
    if (kind === "EXPENSE") await createExpenseCore(user, form, { activeDivisionId });
    else await paySupplierCore(user, form, { activeDivisionId });
    return { ok: false, id: null, note: "Nothing was saved." };
  } catch (e) {
    const url = e instanceof ExpenseOutcome || e instanceof SupplierPayOutcome ? e.url : null;
    if (url === null) {
      console.error("Approved entry failed:", e);
      return { ok: false, id: null, note: problems.failed };
    }
    const parsed = new URL(url, "http://x");
    const result = parsed.searchParams.get("result") ?? "failed";
    if (result === "created") {
      const idNum = Number(parsed.searchParams.get("id")) || null;
      const batch = parsed.pathname.split("/").pop() ?? "";
      return { ok: true, id: idNum, note: kind === "SUPPLIER_PAYMENT" ? `Posted as ${batch}. It still needs the owner to verify it, as usual.` : "Posted." };
    }
    return { ok: false, id: null, note: problems[result] ?? problems.failed };
  }
}
