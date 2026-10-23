import "server-only";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

type Queryable = Pool | PoolConnection;

type CodeSpec = {
  /** Table and column are fixed names in our own code, never user input. */
  table: string;
  column: string;
  prefix: string;
  width: number;
  /** Extra filter, e.g. "legal_business_id = ?". */
  where?: string;
  params?: unknown[];
};

/**
 * Next running code such as SUP-0007. It looks at the highest number already
 * used with this prefix, so deleting or editing rows never reuses a number.
 */
export async function nextCode(db: Queryable, spec: CodeSpec): Promise<string> {
  const start = spec.prefix.length + 1;
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT MAX(CAST(SUBSTRING(${spec.column}, ${start}) AS UNSIGNED)) AS top
       FROM ${spec.table}
      WHERE ${spec.column} REGEXP ?
        ${spec.where ? `AND ${spec.where}` : ""}`,
    [`^${spec.prefix}[0-9]+$`, ...(spec.params ?? [])]
  );
  const next = Number(rows[0]?.top ?? 0) + 1;
  return `${spec.prefix}${String(next).padStart(spec.width, "0")}`;
}

/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Shop-own barcode (EAN-13, the 200 range is reserved for in-store use, so it
 * never clashes with a manufacturer barcode). Scannable by any normal scanner.
 */
export async function nextBarcode(db: Queryable): Promise<string> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT MAX(CAST(SUBSTRING(barcode, 4, 9) AS UNSIGNED)) AS top
       FROM acct_product_variants
      WHERE barcode REGEXP '^200[0-9]{10}$'`
  );
  const next = Number(rows[0]?.top ?? 0) + 1;
  const first12 = `200${String(next).padStart(9, "0")}`;
  return `${first12}${ean13CheckDigit(first12)}`;
}
