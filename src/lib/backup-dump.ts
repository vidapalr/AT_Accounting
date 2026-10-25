import "server-only";
import { escape, escapeId } from "mysql2";
import type { Pool, FieldPacket } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

type Row = RowDataPacket & Record<string, unknown>;

/** Tables that must not be copied: login sessions are temporary and are not needed to restore. */
const SKIP = new Set(["acct_sessions"]);
const BATCH = 500;

/** Which tables a backup holds: every accounting table (acct_*), except the temporary ones. */
export async function backupTables(db: Pool): Promise<string[]> {
  const [rows] = await db.query<Row[]>(
    `SELECT table_name AS t FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_name LIKE 'acct\\_%'
      ORDER BY table_name`
  );
  return rows.map((r) => String(r.t)).filter((t) => !SKIP.has(t));
}

type CastField = { type: string; string(): string | null; buffer(): Buffer | null };
const BLOBS = new Set(["BLOB", "TINY_BLOB", "MEDIUM_BLOB", "LONG_BLOB"]);
/** Everything is read as text so dates and decimals are copied exactly as stored. */
const typeCast = (field: CastField) => (BLOBS.has(field.type) ? field.buffer() : field.string());

/**
 * Yields a restorable SQL script, a piece at a time. One consistent snapshot of the data is read,
 * so sales saved while it runs cannot leave the copy half old, half new.
 */
export async function* dumpSql(
  db: Pool,
  done: (summary: { tables: number; rows: number; triggers: number }) => Promise<void>
): AsyncGenerator<string> {
  const conn = await db.getConnection();
  let rowTotal = 0;
  let triggerTotal = 0;
  try {
    const tables = await backupTables(db);
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");

    yield `-- Abhiram Group Accounting backup\n-- Taken ${new Date().toISOString()}\n-- Tables: ${tables.length}\n`;
    yield `-- To restore: phpMyAdmin > choose the database > Import > choose this file. This REPLACES the data in these tables.\n\n`;
    yield `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET UNIQUE_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n\n`;

    for (const table of tables) {
      const [create] = await conn.query<Row[]>(`SHOW CREATE TABLE ${escapeId(table)}`);
      const ddl = String(create[0]["Create Table"]);
      yield `-- ${table}\nDROP TABLE IF EXISTS ${escapeId(table)};\n${ddl};\n\n`;

      for (let offset = 0; ; offset += BATCH) {
        const [rows, fields] = (await conn.query({
          sql: `SELECT * FROM ${escapeId(table)} LIMIT ${BATCH} OFFSET ${offset}`,
          typeCast: typeCast as never,
        })) as unknown as [Row[], FieldPacket[]];
        if (rows.length === 0) break;
        const cols = fields.map((f) => escapeId(f.name)).join(", ");
        const values = rows
          .map((r) => `(${fields.map((f) => escape(r[f.name] as never)).join(", ")})`)
          .join(",\n");
        yield `INSERT INTO ${escapeId(table)} (${cols}) VALUES\n${values};\n`;
        rowTotal += rows.length;
        if (rows.length < BATCH) break;
      }
      yield "\n";
    }

    // Safety triggers (posted entries cannot be edited). Needs the database user's permission; skipped if refused.
    try {
      const [triggers] = await conn.query<Row[]>(
        `SELECT trigger_name AS n FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND event_object_table LIKE 'acct\\_%' ORDER BY trigger_name`
      );
      if (triggers.length > 0) yield `DELIMITER $$\n`;
      for (const t of triggers) {
        const [c] = await conn.query<Row[]>(`SHOW CREATE TRIGGER ${escapeId(String(t.n))}`);
        yield `DROP TRIGGER IF EXISTS ${escapeId(String(t.n))}$$\n${String(c[0]["SQL Original Statement"]).replace(/DEFINER=`[^`]*`@`[^`]*`\s*/, "")}$$\n`;
        triggerTotal++;
      }
      if (triggers.length > 0) yield `DELIMITER ;\n`;
    } catch {
      yield `-- Triggers could not be read with this database login; they were not included.\n`;
    }

    yield `\nSET FOREIGN_KEY_CHECKS = 1;\nSET UNIQUE_CHECKS = 1;\n-- End of backup\n`;
    await conn.query("COMMIT");
    await done({ tables: tables.length, rows: rowTotal, triggers: triggerTotal });
  } finally {
    await conn.query("ROLLBACK").catch(() => {});
    conn.release();
  }
}
