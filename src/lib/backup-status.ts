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
