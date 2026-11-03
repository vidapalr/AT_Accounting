import "server-only";
import type { RowDataPacket } from "mysql2/promise";

import { db } from "@/lib/db";

/** Where an offer or coupon works: one branch, every branch of a division, or everywhere. */
export type Where = { divisionId: number | null; branchId: number | null };

export type WhereChoice = { value: string; label: string };

/** The choices for the "Works at" box: each division (all its branches) and each branch on its own. */
export async function loadWhereChoices(businessId: number): Promise<{ choices: WhereChoice[]; names: Map<string, string> }> {
  const [divs] = await db.execute<RowDataPacket[]>(
    `SELECT id, name FROM acct_divisions WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY name`, [businessId]);
  const [brs] = await db.execute<RowDataPacket[]>(
    `SELECT id, division_id, branch_name FROM acct_branches WHERE legal_business_id = ? AND status = 'ACTIVE' ORDER BY branch_name`, [businessId]);
  const choices: WhereChoice[] = [];
  const names = new Map<string, string>();
  for (const d of divs) {
    const label = `All branches of ${String(d.name)}`;
    choices.push({ value: `D:${d.id}`, label });
    names.set(`D:${d.id}`, label);
    for (const b of brs.filter((x) => Number(x.division_id) === Number(d.id))) {
      const bl = `Only ${String(b.branch_name)}`;
      choices.push({ value: `B:${b.id}`, label: bl });
      names.set(`B:${b.id}`, bl);
    }
  }
  return { choices, names };
}

/** Read the "Works at" box and check it against the real divisions and branches. null = invalid choice. */
export async function parseWhere(businessId: number, raw: string): Promise<Where | null> {
  if (!raw) return { divisionId: null, branchId: null };
  const m = /^([DB]):(\d{1,10})$/.exec(raw);
  if (!m) return null;
  const id = Number(m[2]);
  if (m[1] === "D") {
    const [r] = await db.execute<RowDataPacket[]>(`SELECT id FROM acct_divisions WHERE legal_business_id = ? AND id = ?`, [businessId, id]);
    return r[0] ? { divisionId: id, branchId: null } : null;
  }
  const [r] = await db.execute<RowDataPacket[]>(`SELECT id, division_id FROM acct_branches WHERE legal_business_id = ? AND id = ?`, [businessId, id]);
  return r[0] ? { divisionId: Number(r[0].division_id), branchId: id } : null;
}

export function whereKey(divisionId: unknown, branchId: unknown): string {
  return branchId ? `B:${branchId}` : divisionId ? `D:${divisionId}` : "";
}

/** Does something limited to `w` work at this branch of this division? */
export function worksAt(w: Where, at: { branchId: number | null; divisionId: number | null }): boolean {
  if (w.branchId) return at.branchId === w.branchId;
  if (w.divisionId) return at.divisionId === w.divisionId;
  return true;
}
