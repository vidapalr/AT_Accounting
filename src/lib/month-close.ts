import "server-only";
import type { Pool, RowDataPacket } from "mysql2/promise";

import { getSyncStatus } from "@/lib/ledger/sync-status";
import { getCashTieOut } from "@/lib/reports/cash-tieout";
import { monthBounds } from "@/lib/month-math";

export type CloseCheck = {
  key: string;
  title: string;
  ok: boolean;
  /** Plain-words result, shown under the title. */
  detail: string;
  /** Where to fix it. */
  href: string;
  linkText: string;
  /** Soft checks are advice only and do not hold the month back. */
  soft?: boolean;
};

const n = (v: unknown) => Number(v ?? 0);
const plural = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;

async function safe(
  key: string, title: string, href: string, linkText: string,
  run: () => Promise<Omit<CloseCheck, "key" | "title" | "href" | "linkText"> & { href?: string }>
): Promise<CloseCheck> {
  try {
    const r = await run();
    return { key, title, linkText, ...r, href: r.href ?? href };
  } catch {
    return { key, title, href, linkText, ok: true, soft: true, detail: "Could not be checked here (a database file may not be run yet)." };
  }
}

export async function monthCloseChecks(db: Pool, businessId: number, ym: string): Promise<CloseCheck[]> {
  const { start, end } = monthBounds(ym);
  const one = async (sql: string, params: Array<string | number>) => {
    const [r] = await db.execute<RowDataPacket[]>(sql, params);
    return r[0] ?? {};
  };

  return Promise.all([
    safe("ledger", "Every record is in the books", "/accounting/reports", "Reports", async () => {
      const s = await getSyncStatus(db, businessId);
      const waiting = s.pending.length;
      const review = s.changedAfterPosting.length + s.noLongerValid.length + s.problems.length;
      return {
        ok: waiting === 0 && review === 0,
        detail: waiting === 0 && review === 0
          ? "Nothing is waiting and nothing needs review."
          : `${plural(waiting, "record is", "records are")} not in the books yet and ${plural(review, "item needs", "items need")} review.`,
      };
    }),

    safe("drafts", "No unfinished bills, purchases or expenses", "/accounting/invoices", "Open the list", async () => {
      const s = await one(
        `SELECT COUNT(*) c FROM acct_sales_headers WHERE legal_business_id = ? AND status = 'DRAFT' AND is_estimate = 0 AND invoice_date BETWEEN ? AND ?`,
        [businessId, start, end]);
      const p = await one(
        `SELECT COUNT(*) c FROM acct_purchase_headers WHERE legal_business_id = ? AND status = 'DRAFT' AND invoice_date BETWEEN ? AND ?`,
        [businessId, start, end]);
      const e = await one(
        `SELECT COUNT(*) c FROM acct_expenses WHERE legal_business_id = ? AND status = 'DRAFT' AND expense_date BETWEEN ? AND ?`,
        [businessId, start, end]);
      const total = n(s.c) + n(p.c) + n(e.c);
      return {
        href: n(s.c) > 0 ? "/accounting/invoices" : n(p.c) > 0 ? "/accounting/purchases" : "/accounting/expenses",
        ok: total === 0,
        detail: total === 0 ? "Nothing is left half-done in this month."
          : `Left unfinished: ${n(s.c)} bill(s), ${n(p.c)} purchase(s), ${n(e.c)} expense(s). Confirm or cancel them.`,
      };
    }),

    safe("cash", "Cash drawer closed on every day it was used", "/accounting/cash-closing", "Cash closing", async () => {
      const r = await one(
        `SELECT COUNT(*) c FROM (
           SELECT DISTINCT pay.cash_account_id, pay.payment_date
             FROM acct_sales_payments pay
            WHERE pay.legal_business_id = ? AND pay.status = 'RECORDED'
              AND pay.cash_account_id IS NOT NULL AND pay.payment_date BETWEEN ? AND ?
              AND NOT EXISTS (SELECT 1 FROM acct_cash_closings c
                               WHERE c.legal_business_id = pay.legal_business_id
                                 AND c.cash_account_id = pay.cash_account_id
                                 AND c.closing_date = pay.payment_date)
         ) x`,
        [businessId, start, end]);
      const c = n(r.c);
      return { ok: c === 0, detail: c === 0 ? "Every day with cash sales has a cash closing." : `${plural(c, "day has", "days have")} cash sales but no cash closing.` };
    }),

    safe("tie", "Bank and cash records agree with the books", "/accounting/health", "Accounting health", async () => {
      const rows = await getCashTieOut(db, businessId);
      const bad = rows.filter((r) => r.difference !== 0n);
      return { ok: bad.length === 0, detail: bad.length === 0 ? "Every bank and cash account agrees." : `${plural(bad.length, "account differs", "accounts differ")}: ${bad.map((b) => b.name).slice(0, 4).join(", ")}.` };
    }),

    safe("salary", "Salaries paid for the month", "/accounting/salaries", "Salaries", async () => {
      const r = await one(
        `SELECT COUNT(*) c FROM acct_employees e
          WHERE e.legal_business_id = ? AND e.status = 'ACTIVE'
            AND NOT EXISTS (SELECT 1 FROM acct_salary_payments s
                             WHERE s.legal_business_id = e.legal_business_id AND s.employee_id = e.id AND s.salary_month = ?)`,
        [businessId, ym]);
      const c = n(r.c);
      return { ok: c === 0, detail: c === 0 ? "Everyone on the staff list has been paid." : `${plural(c, "person has", "people have")} not been paid for this month.` };
    }),

    safe("dep", "Depreciation run for the month", "/accounting/fixed-assets", "Fixed assets", async () => {
      const a = await one(`SELECT COUNT(*) c FROM acct_fixed_assets WHERE legal_business_id = ? AND status = 'ACTIVE'`, [businessId]);
      if (n(a.c) === 0) return { ok: true, detail: "No fixed assets, nothing to run." };
      const r = await one(`SELECT COUNT(*) c FROM acct_asset_dep_runs WHERE legal_business_id = ? AND period = ?`, [businessId, ym]);
      return { ok: n(r.c) > 0, detail: n(r.c) > 0 ? "Depreciation is posted for this month." : "Depreciation has not been run for this month." };
    }),

    safe("count", "Stock counted this month", "/accounting/stock-count", "Stock count", async () => {
      const r = await one(`SELECT COUNT(*) c FROM acct_stock_counts WHERE legal_business_id = ? AND count_date BETWEEN ? AND ?`, [businessId, start, end]);
      return { ok: n(r.c) > 0, soft: true, detail: n(r.c) > 0 ? "A stock count was done in this month." : "No stock count this month. Advice only: count at least once a quarter." };
    }),
  ]);
}
