import type { Connection, Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

/**
 * Document numbers look like BB_DD_RR_TT_0001:
 *   BB = the company (setting doc_business_code, else the first letters of the group name)
 *   DD = the division (setting doc_division_code_<id>, else the first letters of its name); GP for group level
 *   RR = the branch (letters of its branch code); HQ when there is no branch
 *   TT = the kind of paper (SA sale, EX expense, AD advance, TF transfer, ...)
 * One place for every kind of paper, so nothing about one company is fixed in code.
 * Migration 087 keeps the first company's existing numbers (AB_AT_...) running on.
 */

type Queryable = Pool | PoolConnection | Connection;

export class DocNumberError extends Error {}

/** Two capital letters from any text ("Main Road" -> "MA"); "XX" when there are none. */
export function twoLetters(text: string): string {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, "");
  return letters.length >= 2 ? letters.slice(0, 2) : (letters + "XX").slice(0, 2);
}

/** A saved short code is used as given (letters only, 2 to 4). */
export function cleanCode(text: string): string | null {
  const c = text.toUpperCase().replace(/[^A-Z]/g, "");
  return c.length >= 2 ? c.slice(0, 4) : null;
}

async function setting(conn: Queryable, businessId: number, key: string): Promise<string> {
  const [rows] = await (conn as Pool).query<RowDataPacket[]>(
    `SELECT setting_value FROM acct_business_settings WHERE legal_business_id = ? AND setting_key = ?`,
    [businessId, key]
  );
  return String(rows[0]?.setting_value ?? "");
}

export async function businessDocCode(conn: Queryable, businessId: number): Promise<string> {
  const saved = cleanCode(await setting(conn, businessId, "doc_business_code"));
  if (saved) return saved;
  const named = await setting(conn, businessId, "brand_group_name");
  if (named) return twoLetters(named);
  const [rows] = await (conn as Pool).query<RowDataPacket[]>(
    `SELECT COALESCE(NULLIF(trading_name, ''), legal_name) AS n FROM acct_legal_businesses WHERE id = ?`,
    [businessId]
  );
  return twoLetters(String(rows[0]?.n ?? ""));
}

export async function divisionDocCode(conn: Queryable, businessId: number, divisionId: number): Promise<string> {
  const saved = cleanCode(await setting(conn, businessId, `doc_division_code_${divisionId}`));
  if (saved) return saved;
  const [rows] = await (conn as Pool).query<RowDataPacket[]>(
    `SELECT name FROM acct_divisions WHERE legal_business_id = ? AND id = ?`,
    [businessId, divisionId]
  );
  if (!rows[0]) throw new DocNumberError("That division is not set up.");
  return twoLetters(String(rows[0].name));
}

export async function branchDocCode(conn: Queryable, businessId: number, divisionId: number, branchId: number): Promise<string> {
  const [rows] = await (conn as Pool).query<RowDataPacket[]>(
    `SELECT branch_code FROM acct_branches WHERE legal_business_id = ? AND division_id = ? AND id = ? AND status = 'ACTIVE'`,
    [businessId, divisionId, branchId]
  );
  if (!rows[0]) throw new DocNumberError("That branch is not available.");
  const letters = String(rows[0].branch_code).toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.length < 2) throw new DocNumberError("The branch code needs two letters for numbering.");
  return letters.slice(0, 2);
}

/** The number prefix for a paper, e.g. AB_AT_KA_SA (group level: AB_GP_HQ_EX). */
export async function documentPrefix(
  conn: Queryable,
  p: { businessId: number; divisionId: number | null; branchId: number | null; kind: string }
): Promise<string> {
  const b = await businessDocCode(conn, p.businessId);
  if (p.divisionId === null) return `${b}_GP_HQ_${p.kind}`;
  const d = await divisionDocCode(conn, p.businessId, p.divisionId);
  const r = p.branchId === null ? "HQ" : await branchDocCode(conn, p.businessId, p.divisionId, p.branchId);
  return `${b}_${d}_${r}_${p.kind}`;
}
