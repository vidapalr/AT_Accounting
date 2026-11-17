import type { Connection, Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

import { isMissingTable } from "../db-errors.ts";
import { buildCodeMap, standardCoder, type CodeMap } from "./account-roles.ts";

type Queryable = Pool | PoolConnection | Connection;

/** The company's account mapping (empty before migration 085 or when nothing was changed). */
export async function loadCodeMap(conn: Queryable, businessId: number): Promise<CodeMap> {
  try {
    const [rows] = await (conn as Pool).query<RowDataPacket[]>(
      `SELECT role_key, account_code FROM acct_account_map WHERE legal_business_id = ?`,
      [businessId]
    );
    return buildCodeMap(rows.map((r) => ({ role: String(r.role_key), code: String(r.account_code) })));
  } catch (error) {
    if (isMissingTable(error)) return new Map();
    throw error;
  }
}

/** company code -> standard code for this company's reports. */
export async function loadStandardCoder(conn: Queryable, businessId: number): Promise<(code: string) => string> {
  return standardCoder(await loadCodeMap(conn, businessId));
}
