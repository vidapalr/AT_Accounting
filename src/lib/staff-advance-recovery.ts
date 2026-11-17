import "server-only";

import type { PoolConnection, RowDataPacket } from "mysql2/promise";

import { recordExpensePayment } from "@/lib/expense-quick";
import { spreadOldestFirst } from "@/lib/setoff-math";

/** A person's advances that are not fully taken back yet, oldest first (rows locked). */
export async function openAdvances(conn: PoolConnection, businessId: number, employeeId: number): Promise<Array<{ id: number; date: string; due: bigint }>> {
  const [adv] = await conn.execute<RowDataPacket[]>(
    `SELECT a.id, DATE_FORMAT(a.given_on, '%Y-%m-%d') AS d,
            ROUND(a.amount * 100) - COALESCE((SELECT SUM(ROUND(r.amount * 100)) FROM acct_staff_advance_recoveries r WHERE r.advance_id = a.id), 0) AS left_paise
       FROM acct_staff_advances a WHERE a.legal_business_id = ? AND a.employee_id = ? ORDER BY a.given_on, a.id FOR UPDATE`,
    [businessId, employeeId]
  );
  return adv.map((a) => ({ id: Number(a.id), date: String(a.d), due: BigInt(a.left_paise) })).filter((a) => a.due > 0n);
}

/** The part of a salary that clears advances: an ADVANCE payment on the salary expense, spread oldest first. */
export async function takeBackAdvance(
  conn: PoolConnection,
  p: { businessId: number; employeeId: number; expenseId: number; divisionId: number | null; amount: bigint; date: string; userId: number }
): Promise<void> {
  if (p.amount <= 0n) return;
  const open = await openAdvances(conn, p.businessId, p.employeeId);
  const shares = spreadOldestFirst(open, p.amount);
  if (!shares) throw new Error("The advance to take back is more than what is owed.");
  const rupees = (x: bigint) => `${x / 100n}.${String(x % 100n).padStart(2, "0")}`;
  const paymentId = await recordExpensePayment(conn, {
    businessId: p.businessId, divisionId: p.divisionId, expenseId: p.expenseId, date: p.date,
    method: "ADVANCE", source: "BUSINESS_CASH", bankId: null, cashId: null, amount: rupees(p.amount),
    remarks: "Taken off salary against advance", userId: p.userId,
  });
  for (const share of shares) {
    await conn.execute(
      `INSERT INTO acct_staff_advance_recoveries (advance_id, employee_id, expense_payment_id, amount, recovered_on) VALUES (?, ?, ?, ?, ?)`,
      [share.id, p.employeeId, paymentId, rupees(share.amount), p.date]
    );
  }
}
