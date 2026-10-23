import "server-only";

import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";

export const ACTIVE_DIVISION_COOKIE = "active_division";

export type DivisionOption = { id: number; name: string };

/** Divisions this person may work in. Everyone who can sign in today has group-wide access. */
export async function listDivisions(businessId: number): Promise<DivisionOption[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name FROM acct_divisions
      WHERE legal_business_id = ? AND status = 'ACTIVE'
      ORDER BY id`,
    [businessId]
  );
  return rows.map(r => ({ id: Number(r.id), name: String(r.name) }));
}

/**
 * The division the person is working in. It is the one they picked in the top
 * bar, otherwise the first division, so single-division use is unchanged.
 */
export async function getActiveDivisionId(user: { legal_business_id: number }): Promise<number> {
  const divisions = await listDivisions(user.legal_business_id);
  const jar = await cookies();
  const picked = Number(jar.get(ACTIVE_DIVISION_COOKIE)?.value);
  const match = divisions.find(d => d.id === picked);
  if (match) return match.id;
  if (divisions.length > 0) return divisions[0].id;
  throw new Error("No active division is set up.");
}

/** The division a branch belongs to, or null when the branch is not ours. */
export async function divisionOfBranch(
  businessId: number,
  branchId: number
): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT division_id FROM acct_branches WHERE legal_business_id = ? AND id = ?`,
    [businessId, branchId]
  );
  return rows[0] ? Number(rows[0].division_id) : null;
}
