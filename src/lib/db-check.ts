
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

interface DatabaseInfo extends RowDataPacket {
  database_name: string;
  server_version: string;
  server_time: Date | string;
}

interface AccountingTable extends RowDataPacket {
  table_name: string;
}

export async function checkDatabaseConnection() {
  const [infoRows] = await db.query<DatabaseInfo[]>(`
    SELECT
      DATABASE() AS database_name,
      VERSION() AS server_version,
      NOW() AS server_time
  `);

  const [tableRows] = await db.query<AccountingTable[]>(`
    SELECT TABLE_NAME AS table_name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND LEFT(TABLE_NAME, 5) = 'acct_'
    ORDER BY TABLE_NAME
  `);

  return {
    status: "connected",
    database: infoRows[0].database_name,
    serverVersion: infoRows[0].server_version,
    serverTime: infoRows[0].server_time,
    accountingTableCount: tableRows.length,
    accountingTables: tableRows.map(
      (row) => row.table_name
    ),
    message: "Read-only database verification completed.",
  };
}
