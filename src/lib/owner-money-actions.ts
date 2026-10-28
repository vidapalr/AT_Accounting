"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { nextCode } from "@/lib/codes";

const PAGE = "/accounting/owner-money";
type Row = RowDataPacket & Record<string, string | number | null>;
const todayIso = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const isRedirect = (e: unknown) =>
  typeof (e as { digest?: unknown })?.digest === "string" && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT");
class Stop extends Error {}

function paise(value: string): bigint {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value.replace(/,/g, "").trim());
  return m ? BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0") : -1n;
}
const rupees = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;

/** The owner records money put into, or taken out of, a business bank or cash account. */
export async function recordOwnerMoneyAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const text = (n: string) => String(form.get(n) ?? "").trim();
  const direction = text("direction") === "OUT" ? "OUT" : "IN";
  const amount = paise(text("amount"));
  const date = text("entry_date");
  const note = text("note").slice(0, 300);
  const reference = text("reference").slice(0, 80);
  const account = /^(CASH|BANK):([1-9]\d*)$/.exec(text("account"));
  const how = text("how");
  const fail = (m: string) => redirect(`${PAGE}?error=${encodeURIComponent(m)}`);

  if (amount <= 0n) fail("Type the amount in rupees");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) fail("Check the date");
  if (!account) fail("Choose the bank or cash account");
  const [, kind, accountId] = account!;
  const allowed = kind === "CASH" ? ["CASH"] : ["UPI", "BANK_TRANSFER", "CHEQUE"];
  if (!allowed.includes(how)) fail(kind === "CASH" ? "A cash drawer is used with cash" : "A bank is used with UPI, bank transfer or cheque");

  const conn: PoolConnection = await db.getConnection();
  let target = `${PAGE}?error=${encodeURIComponent("It could not be saved. Nothing was changed.")}`;
  try {
    await conn.beginTransaction();
    let bankId: number | null = null;
    let cashId: number | null = null;
    if (kind === "CASH") {
      const [r] = await conn.execute<Row[]>(`SELECT id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [businessId, Number(accountId)]);
      if (r.length !== 1) throw new Stop("That cash drawer cannot be used");
      cashId = Number(accountId);
    } else {
      const [r] = await conn.execute<Row[]>(
        `SELECT id FROM acct_bank_accounts WHERE legal_business_id = ? AND id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE'`,
        [businessId, Number(accountId)]
      );
      if (r.length !== 1) throw new Stop("That bank account cannot be used");
      bankId = Number(accountId);
    }
    const no = await nextCode(conn, { table: "acct_owner_money", column: "entry_no", prefix: "OWN-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_owner_money (legal_business_id, entry_no, direction, entry_date, amount, account_kind, bank_account_id, cash_account_id, payment_method, reference, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, no, direction, date, rupees(amount), kind, bankId, cashId, how, reference || null, note || null, user.id]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'OWNER_MONEY_RECORDED', 'OWNER_MONEY', ?, ?)`,
      [businessId, user.id, ins.insertId, JSON.stringify({ entryNo: no, direction, amount: rupees(amount) })]
    );
    await conn.commit();
    target = `${PAGE}?saved=${encodeURIComponent(`${no}: ₹${Number(rupees(amount)).toLocaleString("en-IN")} ${direction === "IN" ? "put in" : "taken out"}. It reaches the books by itself.`)}`;
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isRedirect(error)) throw error;
    if (error instanceof Stop) target = `${PAGE}?error=${encodeURIComponent(error.message)}`;
    else console.error("Owner money failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/account-balances");
  redirect(target);
}
