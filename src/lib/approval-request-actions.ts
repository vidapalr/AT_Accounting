"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { replayRequest } from "@/lib/approval-requests";
import {
  APPROVAL_KINDS, canCancel, canCheck, canFinalApprove, canReject, limitKey, rupeesToLimit,
  type RequestStatus,
} from "@/lib/approval-rules";

const PAGE = "/accounting/approvals";
type Row = RowDataPacket & Record<string, unknown>;

function idOf(form: FormData): number {
  const id = Number(form.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) redirect(`${PAGE}?result=invalid`);
  return id;
}

async function audit(businessId: number, userId: number, action: string, id: number, details: object) {
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, ?, 'APPROVAL_REQUEST', ?, ?)`,
    [businessId, userId, action, id, JSON.stringify(details)]
  ).catch(() => {});
}

/** Moves one waiting request. The rules are checked again on the locked row, so two people cannot both act. */
async function move(
  id: number,
  businessId: number,
  decide: (r: { status: RequestStatus; requestedBy: number }) => boolean,
  apply: string,
  values: Array<string | number | null>
): Promise<{ ok: boolean; row?: Row }> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<Row[]>(
      `SELECT * FROM acct_approval_requests WHERE id = ? AND legal_business_id = ? FOR UPDATE`, [id, businessId]);
    const r = rows[0];
    if (!r || !decide({ status: String(r.status) as RequestStatus, requestedBy: Number(r.requested_by) })) {
      await conn.rollback();
      return { ok: false };
    }
    await conn.execute(apply, [...values, id]);
    await conn.commit();
    return { ok: true, row: r };
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error("Approval step failed:", e);
    return { ok: false };
  } finally {
    conn.release();
  }
}

/** The accountant checks and passes the request on. */
export async function checkRequestAction(form: FormData): Promise<void> {
  const user = await requireAccess("approval_requests");
  const id = idOf(form);
  const res = await move(id, user.legal_business_id, (r) => canCheck(user.role, user.id, r),
    `UPDATE acct_approval_requests SET status = 'WAITING_FINAL', checked_by = ?, checked_at = UTC_TIMESTAMP() WHERE id = ?`, [user.id]);
  if (res.ok) await audit(user.legal_business_id, user.id, "APPROVAL_CHECKED", id, {});
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=${res.ok ? "checked" : "not-allowed"}`);
}

/** Final approval: the entry is posted straight away, as the person who asked. */
export async function approveRequestAction(form: FormData): Promise<void> {
  const user = await requireAccess("approval_requests");
  const id = idOf(form);
  const res = await move(id, user.legal_business_id, (r) => canFinalApprove(user.role, user.id, r),
    `UPDATE acct_approval_requests SET status = 'APPROVED', final_by = ?, final_at = UTC_TIMESTAMP() WHERE id = ?`, [user.id]);
  if (!res.ok || !res.row) {
    revalidatePath(PAGE);
    redirect(`${PAGE}?result=not-allowed`);
  }
  const row = res.row;
  let payload: Record<string, string> = {};
  try { payload = JSON.parse(String(row.payload_json)); } catch { /* handled below */ }
  const posted = await replayRequest(db, String(row.kind), payload, Number(row.requested_by), user.full_name);
  if (posted.ok) {
    await db.execute(`UPDATE acct_approval_requests SET result_id = ?, result_note = ? WHERE id = ?`, [posted.id, posted.note, id]);
    await audit(user.legal_business_id, user.id, "APPROVAL_APPROVED", id, { kind: row.kind, resultId: posted.id });
  } else {
    await db.execute(`UPDATE acct_approval_requests SET status = 'FAILED', result_note = ? WHERE id = ?`, [posted.note.slice(0, 300), id]);
    await audit(user.legal_business_id, user.id, "APPROVAL_POST_FAILED", id, { note: posted.note });
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=${posted.ok ? "approved" : "failed"}`);
}

export async function rejectRequestAction(form: FormData): Promise<void> {
  const user = await requireAccess("approval_requests");
  const id = idOf(form);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
  if (!reason) redirect(`${PAGE}?result=reason-needed`);
  const res = await move(id, user.legal_business_id, (r) => canReject(user.role, user.id, r),
    `UPDATE acct_approval_requests SET status = 'REJECTED', final_by = ?, final_at = UTC_TIMESTAMP(), reject_reason = ? WHERE id = ?`, [user.id, reason]);
  if (res.ok) await audit(user.legal_business_id, user.id, "APPROVAL_REJECTED", id, { reason });
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=${res.ok ? "rejected" : "not-allowed"}`);
}

export async function cancelRequestAction(form: FormData): Promise<void> {
  const user = await requireAccess("approval_requests");
  const id = idOf(form);
  const res = await move(id, user.legal_business_id, (r) => canCancel(user.id, r),
    `UPDATE acct_approval_requests SET status = 'CANCELLED', final_at = UTC_TIMESTAMP() WHERE id = ?`, []);
  if (res.ok) await audit(user.legal_business_id, user.id, "APPROVAL_CANCELLED", id, {});
  revalidatePath(PAGE);
  redirect(`${PAGE}?result=${res.ok ? "cancelled" : "not-allowed"}`);
}

/** Owner only: the limit for each kind. Blank means no limit, so nothing of that kind needs approval. */
export async function saveApprovalLimitsAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const values: Array<[string, bigint | null]> = [];
  try {
    for (const k of APPROVAL_KINDS) values.push([k, rupeesToLimit(String(form.get(`limit_${k}`) ?? ""))]);
  } catch {
    redirect("/accounting/group-rules?result=invalid-limit");
  }
  for (const [kind, limit] of values) {
    await db.execute(
      `INSERT INTO acct_business_settings (legal_business_id, setting_key, setting_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [user.legal_business_id, limitKey(kind as (typeof APPROVAL_KINDS)[number]), limit === null ? "" : limit.toString(), user.id]
    );
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'APPROVAL_LIMITS_CHANGED', 'SETTING', 0, ?)`,
    [user.legal_business_id, user.id, JSON.stringify(Object.fromEntries(values.map(([k, v]) => [k, v === null ? null : v.toString()])))]
  );
  revalidatePath("/accounting/group-rules");
  redirect("/accounting/group-rules?result=limits-saved");
}
