"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { generatePeriods, nextYearStart, yearLabel } from "@/lib/period-math";
import { getSyncStatus } from "@/lib/ledger/sync-status";

const PAGE = "/accounting/year-end";
const done = (kind: "saved" | "error", text: string): never =>
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text.slice(0, 250))}`);

/** Creates the next April-March year (year row + 12 months) and opens its first month. Safe to repeat. */
export async function startNextYearAction() {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const conn = await db.getConnection();
  let label = "";
  try {
    await conn.beginTransaction();
    const [last] = await conn.execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(MAX(ends_on), '%Y-%m-%d') AS e FROM acct_financial_years WHERE legal_business_id = ?`,
      [businessId]
    );
    if (!last[0]?.e) { await conn.rollback(); return done("error", "No financial year exists yet."); }
    const startYear = nextYearStart(String(last[0].e));
    label = yearLabel(startYear);
    const months = generatePeriods(startYear);

    await conn.execute(
      `INSERT IGNORE INTO acct_financial_years (legal_business_id, label, starts_on, ends_on, status) VALUES (?, ?, ?, ?, 'OPEN')`,
      [businessId, label, months[0].start, months[11].end]
    );
    for (const m of months) {
      await conn.execute<ResultSetHeader>(
        `INSERT IGNORE INTO acct_accounting_periods
           (legal_business_id, fiscal_year_label, period_no, period_name, start_date, end_date, status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'NOT_OPENED', ?)`,
        [businessId, label, m.periodNo, m.periodName, m.start, m.end, user.id]
      );
    }
    await conn.execute(
      `UPDATE acct_accounting_periods
          SET status = 'OPEN', opened_by = ?, opened_at = CURRENT_TIMESTAMP, status_reason = 'Opened at the start of the year'
        WHERE legal_business_id = ? AND fiscal_year_label = ? AND period_no = 1 AND status = 'NOT_OPENED'`,
      [user.id, businessId, label]
    );
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'FINANCIAL_YEAR_STARTED', 'FINANCIAL_YEAR', ?, ?)`,
      [businessId, user.id, startYear, JSON.stringify({ label })]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Start next year failed:", error);
    return done("error", "Could not start the next year. Nothing was changed.");
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/periods");
  return done("saved", `Year ${label} is ready. April is open for posting.`);
}

/** Closes a year that has ended: every month closed, then the year locked. Needs a clean ledger. */
export async function closeYearAction(formData: FormData) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;
  const yearId = Number(formData.get("year_id"));
  if (!Number.isInteger(yearId) || yearId <= 0) return done("error", "Choose a year.");
  if (String(formData.get("confirm") ?? "") !== "yes") return done("error", "Tick the box to confirm.");

  const [years] = await db.execute<RowDataPacket[]>(
    `SELECT id, label, status, DATE_FORMAT(starts_on,'%Y-%m-%d') AS s, DATE_FORMAT(ends_on,'%Y-%m-%d') AS e
       FROM acct_financial_years WHERE id = ? AND legal_business_id = ?`,
    [yearId, businessId]
  );
  const fy = years[0];
  if (!fy || fy.status !== "OPEN") return done("error", "That year is not open.");
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  if (today <= String(fy.e)) return done("error", `${fy.label} has not ended yet.`);

  const sync = await getSyncStatus(db, businessId);
  if (sync.pending.length + sync.changedAfterPosting.length + sync.noLongerValid.length + sync.problems.length > 0) {
    return done("error", "Some records are not in the ledger or need review. Fix those on Reports first.");
  }
  const [drafts] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS n FROM acct_journal_entries WHERE legal_business_id = ? AND status = 'DRAFT' AND entry_date BETWEEN ? AND ?`,
    [businessId, fy.s, fy.e]
  );
  if (Number(drafts[0].n) > 0) return done("error", "There are draft journals in this year. Post or remove them first.");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(
      `UPDATE acct_accounting_periods
          SET status = 'CLOSED', closed_by = ?, closed_at = CURRENT_TIMESTAMP, status_reason = 'Closed at year end'
        WHERE legal_business_id = ? AND fiscal_year_label = ? AND status <> 'CLOSED'`,
      [user.id, businessId, fy.label]
    );
    await conn.execute(`UPDATE acct_financial_years SET status = 'CLOSED' WHERE id = ? AND legal_business_id = ?`, [yearId, businessId]);
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'FINANCIAL_YEAR_CLOSED', 'FINANCIAL_YEAR', ?, ?)`,
      [businessId, user.id, yearId, JSON.stringify({ label: fy.label })]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Close year failed:", error);
    return done("error", "Could not close the year. Nothing was changed.");
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  revalidatePath("/accounting/periods");
  return done("saved", `Year ${fy.label} is closed. Nothing can be posted into it now.`);
}
