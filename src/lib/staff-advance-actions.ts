"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PoolConnection } from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { nextCode } from "@/lib/codes";

const PAGE = "/accounting/staff-advances";
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

/** Give an advance to a staff member, paid from a cash drawer or bank. */
export async function giveStaffAdvanceAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const businessId = user.legal_business_id;
  const text = (n: string) => String(form.get(n) ?? "").trim();
  const employeeId = Number(text("employee_id"));
  const amount = paise(text("amount"));
  const instalment = text("instalment") === "" ? null : paise(text("instalment"));
  const date = text("given_on");
  const note = text("note").slice(0, 300);
  const account = /^(CASH|BANK):([1-9]\d*)$/.exec(text("account"));
  const how = text("how");
  const fail = (m: string) => redirect(`${PAGE}?error=${encodeURIComponent(m)}`);

  if (!Number.isInteger(employeeId) || employeeId <= 0) fail("Choose the person");
  if (amount <= 0n) fail("Type the amount in rupees");
  if (instalment !== null && (instalment <= 0n || instalment > amount)) fail("The monthly deduction must be more than zero and not more than the advance");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) fail("Check the date");
  if (!account) fail("Choose where the money is paid from");
  const [, kind, accountId] = account!;
  const allowed = kind === "CASH" ? ["CASH"] : ["UPI", "BANK_TRANSFER", "CHEQUE"];
  if (!allowed.includes(how)) fail(kind === "CASH" ? "A cash drawer pays in cash" : "A bank pays by UPI, bank transfer or cheque");

  const conn: PoolConnection = await db.getConnection();
  let target = `${PAGE}?error=${encodeURIComponent("The advance could not be saved. Nothing was changed.")}`;
  try {
    await conn.beginTransaction();
    const [emps] = await conn.execute<Row[]>(
      `SELECT id, full_name FROM acct_employees WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE' FOR UPDATE`,
      [businessId, employeeId]
    );
    if (emps.length !== 1) throw new Stop("That person is not on the active list");
    let bankId: number | null = null;
    let cashId: number | null = null;
    if (kind === "CASH") {
      const [r] = await conn.execute<Row[]>(`SELECT id FROM acct_cash_accounts WHERE legal_business_id = ? AND id = ? AND status = 'ACTIVE'`, [businessId, Number(accountId)]);
      if (r.length !== 1) throw new Stop("That cash drawer cannot be used");
      cashId = Number(accountId);
    } else {
      const [r] = await conn.execute<Row[]>(
        `SELECT id FROM acct_bank_accounts WHERE legal_business_id = ? AND id = ? AND ownership_type = 'BUSINESS' AND status = 'ACTIVE' AND verification_status = 'VERIFIED' AND can_send = 1`,
        [businessId, Number(accountId)]
      );
      if (r.length !== 1) throw new Stop("That bank account cannot be used for payments");
      bankId = Number(accountId);
    }
    const no = await nextCode(conn, { table: "acct_staff_advances", column: "advance_no", prefix: "ADV-", width: 4, where: "legal_business_id = ?", params: [businessId] });
    const [ins] = await conn.execute<ResultSetHeader>(
      `INSERT INTO acct_staff_advances (legal_business_id, employee_id, advance_no, given_on, amount, paid_from, bank_account_id, cash_account_id, payment_method, instalment, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [businessId, employeeId, no, date, rupees(amount), kind, bankId, cashId, how, instalment === null ? null : rupees(instalment), note || null, user.id]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json) VALUES (?, ?, 'STAFF_ADVANCE_GIVEN', 'EMPLOYEE', ?, ?)`,
      [businessId, user.id, employeeId, JSON.stringify({ advanceNo: no, advanceId: ins.insertId, amount: rupees(amount) })]
    );
    await conn.commit();
    target = `${PAGE}?saved=${encodeURIComponent(`${no}: ₹${Number(rupees(amount)).toLocaleString("en-IN")} given to ${emps[0].full_name}.`)}`;
  } catch (error) {
    await conn.rollback().catch(() => {});
    if (isRedirect(error)) throw error;
    if (error instanceof Stop) target = `${PAGE}?error=${encodeURIComponent(error.message)}`;
    else console.error("Staff advance failed:", error);
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/salaries");
  revalidatePath("/accounting/cash-closing");
  redirect(target);
}
