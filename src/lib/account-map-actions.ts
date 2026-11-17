"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { ACCOUNT_ROLES, buildCodeMap, mappingProblems } from "@/lib/ledger/account-roles";

const PAGE = "/accounting/account-mapping";

/**
 * Save which account each kind of posting goes to. Owner only. Every chosen account must exist and accept
 * postings, and no account may serve two roles. Already-posted journals are never changed.
 */
export async function saveAccountMapAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const biz = user.legal_business_id;

  const [chart] = await db.execute<RowDataPacket[]>(
    `SELECT account_code FROM acct_chart_of_accounts WHERE legal_business_id = ? AND status = 'ACTIVE' AND is_posting_account = 1`,
    [biz]
  );
  const usable = new Set(chart.map((c) => String(c.account_code)));

  const rows: Array<{ role: string; code: string }> = [];
  for (const role of ACCOUNT_ROLES) {
    const code = String(form.get(`role_${role.key}`) ?? "").trim();
    if (!code || code === role.standardCode) continue;
    if (!usable.has(code)) redirect(`${PAGE}?result=unknown&code=${encodeURIComponent(code)}`);
    rows.push({ role: role.key, code });
  }
  const problems = mappingProblems(buildCodeMap(rows));
  if (problems.length > 0) redirect(`${PAGE}?result=clash&detail=${encodeURIComponent(problems[0])}`);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`DELETE FROM acct_account_map WHERE legal_business_id = ?`, [biz]);
    for (const r of rows) {
      await conn.execute(
        `INSERT INTO acct_account_map (legal_business_id, role_key, account_code, updated_by) VALUES (?, ?, ?, ?)`,
        [biz, r.role, r.code, user.id]
      );
    }
    await conn.execute(
      `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
       VALUES (?, ?, 'ACCOUNT_MAP_SAVED', 'ACCOUNT_MAP', 0, ?)`,
      [biz, user.id, JSON.stringify({ changed: rows })]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=saved`);
}
