import "server-only";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";
import { toPaise } from "@/lib/reports/money";

type Row = RowDataPacket & Record<string, string | number | null>;

export type StaffAdvance = {
  id: number; advanceNo: string; givenOn: string; amount: bigint; recovered: bigint; left: bigint;
  instalment: bigint; paidHow: string; note: string;
  /** The journal it is in the books under, or null while it waits to be posted. */
  journalNo: string | null;
  recoveries: Array<{ on: string; amount: bigint; fromSalary: boolean }>;
};

/** One person's salary advances: what was given, taken back from salary, still owed, and the ledger entry. */
export async function staffAdvances(businessId: number, employeeId: number): Promise<StaffAdvance[]> {
  try {
    const [rows] = await db.query<Row[]>(
      `SELECT a.id, a.advance_no, DATE_FORMAT(a.given_on, '%d-%m-%Y') AS given_on, a.amount, a.instalment, a.payment_method, a.paid_from, a.note,
              (SELECT j.journal_no FROM acct_journal_entries j
                WHERE j.legal_business_id = a.legal_business_id AND j.source_type = 'STAFF_ADVANCE' AND j.source_id = a.id AND j.status = 'POSTED'
                  AND NOT EXISTS (SELECT 1 FROM acct_journal_reversals r WHERE r.legal_business_id = j.legal_business_id AND r.original_journal_id = j.id)
                ORDER BY j.id DESC LIMIT 1) AS journal_no
         FROM acct_staff_advances a
        WHERE a.legal_business_id = ? AND a.employee_id = ?
        ORDER BY a.given_on DESC, a.id DESC`,
      [businessId, employeeId]
    );
    if (rows.length === 0) return [];
    const [recs] = await db.query<Row[]>(
      `SELECT advance_id, DATE_FORMAT(recovered_on, '%d-%m-%Y') AS on_date, amount, expense_payment_id
         FROM acct_staff_advance_recoveries WHERE employee_id = ? AND advance_id IN (${rows.map(() => "?").join(",")})
        ORDER BY recovered_on, id`,
      [employeeId, ...rows.map((r) => Number(r.id))]
    );
    return rows.map((r) => {
      const mine = recs.filter((x) => Number(x.advance_id) === Number(r.id));
      const recovered = mine.reduce((t, x) => t + toPaise(x.amount), 0n);
      const amount = toPaise(r.amount);
      return {
        id: Number(r.id), advanceNo: String(r.advance_no ?? ""), givenOn: String(r.given_on), amount, recovered,
        left: amount - recovered > 0n ? amount - recovered : 0n, instalment: toPaise(r.instalment ?? 0),
        paidHow: ({ CASH: "cash", UPI: "UPI", BANK_TRANSFER: "bank transfer", CHEQUE: "cheque" } as Record<string, string>)[String(r.payment_method)] ?? "", note: String(r.note ?? ""),
        journalNo: r.journal_no ? String(r.journal_no) : null,
        recoveries: mine.map((x) => ({ on: String(x.on_date), amount: toPaise(x.amount), fromSalary: x.expense_payment_id != null })),
      };
    });
  } catch (e) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}
