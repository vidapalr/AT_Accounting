import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { loadAccountFlow } from "@/lib/reports/account-flow";
import { getAccountPositions } from "@/lib/reports/report-data";
import { todayInIndia } from "@/lib/reports/money";
import { compareCashFlow, type CashTieRow } from "@/lib/reports/cash-compare";

export type { CashTieRow };
export type CashTieRowWithWhy = CashTieRow & { why: Array<{ label: string; amount: bigint }> };

// Ledger movement types the Account Balances page does not list, in plain words.
// Anything else the page already covers (sales collections, supplier and expense
// payments, staff advances, asset purchases and sales).
const NOT_LISTED: Record<string, string> = {
  SALES_REFUND: "Money refunded to customers",
  SUPPLIER_REFUND: "Money received back from suppliers",
  OWNER_MONEY: "Owner money put in or taken out",
  CASH_TAKEN: "Cash taken to the bank (or from it)",
  FUNDING_RECEIPT: "Funding received",
  JOURNAL_REVERSAL: "Corrections (reversed entries)",
};

/** For each business bank and cash account: do the records and the books show the same money movement? */
export async function getCashTieOut(db: Pool, businessId: number): Promise<CashTieRowWithWhy[]> {
  const [flow, positions] = await Promise.all([
    loadAccountFlow(db, businessId),
    getAccountPositions(db, businessId, todayInIndia()),
  ]);
  const books = new Map<string, bigint>();
  for (const b of positions.banks) books.set(`BANK:${b.id}`, b.trading);
  for (const c of positions.cash) books.set(`CASH:${c.id}`, c.trading);
  const records = flow.accountSummaries
    .filter((a) => a.category === "GROUP_BANK" || a.category === "CASH")
    .map((a) => ({ key: a.key, name: a.name, net: a.net }));
  const rows = compareCashFlow(records, books);
  const glByKey = new Map<string, number>();
  const [bk] = await db.execute<RowDataPacket[]>(
    "SELECT id, gl_account_id FROM acct_bank_accounts WHERE legal_business_id = ? AND gl_account_id IS NOT NULL", [businessId]);
  const [ca] = await db.execute<RowDataPacket[]>(
    "SELECT id, gl_account_id FROM acct_cash_accounts WHERE legal_business_id = ? AND gl_account_id IS NOT NULL", [businessId]);
  for (const b of bk) glByKey.set(`BANK:${b.id}`, Number(b.gl_account_id));
  for (const c of ca) glByKey.set(`CASH:${c.id}`, Number(c.gl_account_id));
  const glIds = [...new Set(glByKey.values())];
  const moves = new Map<number, Map<string, bigint>>();
  if (glIds.length > 0) {
    const [lines] = await db.execute<RowDataPacket[]>(
      `SELECT l.account_id AS a, j.source_type AS t,
              CAST(ROUND(SUM(l.debit - l.credit) * 100) AS SIGNED) AS v
         FROM acct_journal_lines l
         JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
        WHERE l.legal_business_id = ? AND j.status = 'POSTED'
          AND l.account_id IN (${glIds.map(() => "?").join(",")})
        GROUP BY l.account_id, j.source_type`,
      [businessId, ...glIds]
    );
    for (const r of lines) {
      const m = moves.get(Number(r.a)) ?? new Map<string, bigint>();
      m.set(String(r.t), BigInt(r.v));
      moves.set(Number(r.a), m);
    }
  }
  return rows.map((r) => {
    const gl = glByKey.get(r.key);
    const m = gl ? moves.get(gl) : undefined;
    const why = m
      ? [...m.entries()]
          .filter(([t, v]) => NOT_LISTED[t] && v !== 0n)
          .map(([t, v]) => ({ label: NOT_LISTED[t], amount: v }))
      : [];
    return { ...r, why };
  });
}
