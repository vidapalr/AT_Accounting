import "server-only";
import type { Pool } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";

export const BACKUP_REMINDER_DAYS = 7;

/** When the last backup was taken, and how many days ago (null if never). */
export async function lastBackup(db: Pool, businessId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(CONVERT_TZ(MAX(occurred_at), '+00:00', '+05:30'), '%d %b %Y, %H:%i') AS at_text,
            TIMESTAMPDIFF(DAY, MAX(occurred_at), UTC_TIMESTAMP()) AS days
       FROM acct_audit_events WHERE legal_business_id = ? AND action = 'BACKUP_DOWNLOADED'`,
    [businessId]
  );
  const r = rows[0];
  if (!r || r.at_text === null) return { atText: null as string | null, days: null as number | null };
  return { atText: String(r.at_text), days: Number(r.days) };
}

/** Whether the most recent database backup included the safety triggers (null if no backup yet or not recorded). */
export async function lastBackupTriggers(db: Pool, businessId: number): Promise<number | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT details_json FROM acct_audit_events WHERE legal_business_id = ? AND action = 'BACKUP_DOWNLOADED' ORDER BY id DESC LIMIT 1`,
    [businessId]
  );
  try {
    const d = typeof rows[0]?.details_json === "string" ? JSON.parse(rows[0].details_json) : rows[0]?.details_json;
    return typeof d?.triggers === "number" ? d.triggers : null;
  } catch {
    return null;
  }
}

/** When the last uploaded-files backup was taken. */
export async function lastFilesBackup(db: Pool, businessId: number): Promise<string | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(CONVERT_TZ(MAX(occurred_at), '+00:00', '+05:30'), '%d %b %Y, %H:%i') AS at_text
       FROM acct_audit_events WHERE legal_business_id = ? AND action = 'FILES_BACKUP_DOWNLOADED'`,
    [businessId]
  );
  return rows[0]?.at_text ? String(rows[0].at_text) : null;
}
