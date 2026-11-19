import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { nextCode } from "@/lib/codes";
import { isDuplicateKey, isMissingColumn } from "@/lib/db-errors";

type Queryable = Pool | PoolConnection;

/**
 * The person's Employee ID (EMP-0001 ...), given automatically the first time it is needed.
 * Returns null before migration 095 is run.
 */
export async function ensureEmployeeCode(db: Queryable, businessId: number, employeeId: number): Promise<string | null> {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT employee_code FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [businessId, employeeId]);
      if (!rows[0]) return null;
      if (rows[0].employee_code) return String(rows[0].employee_code);
      const code = await nextCode(db, { table: "acct_employees", column: "employee_code", prefix: "EMP-", width: 4, where: "legal_business_id = ?", params: [businessId] });
      try {
        await db.execute(
          `UPDATE acct_employees SET employee_code = ? WHERE legal_business_id = ? AND id = ? AND employee_code IS NULL`,
          [code, businessId, employeeId]
        );
      } catch (e) {
        if (!isDuplicateKey(e)) throw e; // someone took that number at the same moment: try the next one
      }
    }
    return null;
  } catch (e) {
    if (isMissingColumn(e)) return null;
    throw e;
  }
}
