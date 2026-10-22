
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface ColumnRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: string;
  COLUMN_KEY: string;
  COLUMN_DEFAULT: string | null;
  EXTRA: string;
}

interface ForeignKeyRow extends RowDataPacket {
  TABLE_NAME: string;
  COLUMN_NAME: string;
  REFERENCED_TABLE_NAME: string;
  REFERENCED_COLUMN_NAME: string;
}

interface TableCountRow extends RowDataPacket {
  TABLE_NAME: string;
  TABLE_ROWS: number;
}

export async function inspectAccountingSchema() {
  const [columns] = await db.query<ColumnRow[]>(`
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      COLUMN_TYPE,
      IS_NULLABLE,
      COLUMN_KEY,
      COLUMN_DEFAULT,
      EXTRA
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND LEFT(TABLE_NAME, 5) = 'acct_'
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  const [foreignKeys] = await db.query<ForeignKeyRow[]>(`
    SELECT
      TABLE_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND LEFT(TABLE_NAME, 5) = 'acct_'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);

  const [tableCounts] = await db.query<TableCountRow[]>(`
    SELECT
      TABLE_NAME,
      TABLE_ROWS
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND LEFT(TABLE_NAME, 5) = 'acct_'
    ORDER BY TABLE_NAME
  `);

  const tableNames = [
    ...new Set(columns.map((row) => row.TABLE_NAME)),
  ];

  const tables = tableNames.map((tableName) => ({
    tableName,
    estimatedRows:
      tableCounts.find(
        (row) => row.TABLE_NAME === tableName
      )?.TABLE_ROWS ?? 0,

    columns: columns
      .filter((row) => row.TABLE_NAME === tableName)
      .map((row) => ({
        name: row.COLUMN_NAME,
        type: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === "YES",
        key: row.COLUMN_KEY,
        defaultValue: row.COLUMN_DEFAULT,
        extra: row.EXTRA,
      })),

    foreignKeys: foreignKeys
      .filter((row) => row.TABLE_NAME === tableName)
      .map((row) => ({
        column: row.COLUMN_NAME,
        references:
          `${row.REFERENCED_TABLE_NAME}.` +
          row.REFERENCED_COLUMN_NAME,
      })),
  }));

  return {
    status: "success",
    databaseEngine: "MariaDB / MySQL",
    totalAccountingTables: tables.length,
    tables,
    note: "Schema metadata only. No business records accessed.",
  };
}
