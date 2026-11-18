import "server-only";

/** Attendance register in the database: WhatsApp punches and the month's register. Rules in attendance.ts. */
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { applyPunch, indiaDateTime, parseAttendanceMessage, punchReply, type DayStatus } from "./attendance";

type Row = RowDataPacket & Record<string, string | number | null>;

/**
 * A WhatsApp message from a staff number: when it is IN or OUT, record it and return the reply to send.
 * Returns null when the message is not an attendance word or the number is not a staff member's.
 */
export async function recordWhatsAppPunch(businessId: number, from: string, text: string | null, epochSeconds: number | null): Promise<string | null> {
  const punch = parseAttendanceMessage(text);
  if (!punch) return null;
  const phone = from.replace(/\D/g, "").slice(-10);
  if (phone.length !== 10) return null;
  const { date, time } = indiaDateTime(epochSeconds ?? Math.floor(Date.now() / 1000));
  let staff: Row | undefined;
  try {
    // The WhatsApp number saved for attendance; failing that, the person's own mobile, so a number
    // typed in only one of the two boxes still works.
    const [rows] = await db.query<Row[]>(
      `SELECT id, full_name FROM acct_employees
        WHERE legal_business_id = ? AND status = 'ACTIVE'
          AND (whatsapp_number = ? OR (whatsapp_number IS NULL AND RIGHT(phone, 10) = ?))
        ORDER BY whatsapp_number IS NULL LIMIT 1`,
      [businessId, phone, phone]
    );
    staff = rows[0];
  } catch (error) {
    if (isMissingColumn(error) || isMissingTable(error)) return null;
    throw error;
  }
  if (!staff) {
    // Nobody has this number: keep it so the register can say so, instead of failing quietly.
    await db
      .execute(
        `INSERT INTO acct_attendance_unmatched (legal_business_id, phone, word, work_date, at_time) VALUES (?, ?, ?, ?, ?)`,
        [businessId, phone, punch, date, time]
      )
      .catch((error) => { if (!isMissingTable(error)) console.error("Could not note the unmatched attendance message", error); });
    return null;
  }
  const [cur] = await db.query<Row[]>(
    `SELECT TIME_FORMAT(in_time, '%H:%i:%s') AS i, TIME_FORMAT(out_time, '%H:%i:%s') AS o, status FROM acct_attendance
      WHERE legal_business_id = ? AND employee_id = ? AND work_date = ?`,
    [businessId, staff.id, date]
  );
  const day = applyPunch(
    { inTime: cur[0]?.i ? String(cur[0].i) : null, outTime: cur[0]?.o ? String(cur[0].o) : null, status: (cur[0]?.status as DayStatus) ?? null },
    punch,
    time
  );
  await db.execute(
    `INSERT INTO acct_attendance (legal_business_id, employee_id, work_date, in_time, out_time, status, source)
     VALUES (?, ?, ?, ?, ?, ?, 'WHATSAPP')
     ON DUPLICATE KEY UPDATE in_time = VALUES(in_time), out_time = VALUES(out_time), status = COALESCE(status, VALUES(status))`,
    [businessId, staff.id, date, day.inTime, day.outTime, day.status]
  );
  const first = String(staff.full_name).split(" ")[0];
  return punchReply(first, punch, time);
}

export type RegisterRow = {
  id: number;
  name: string;
  type: string;
  /** The number this person may send IN and OUT from, or null when none is saved. */
  whatsapp: string | null;
  days: Map<string, { status: DayStatus | null; inTime: string | null; outTime: string | null; source: string }>;
};

/** Everyone working in a month with their marked days. */
/** IN or OUT messages from numbers no staff record has, newest first (for the register screen). */
export async function unmatchedPunches(businessId: number, limit = 10): Promise<Array<{ phone: string; word: string; date: string; time: string }>> {
  try {
    const [rows] = await db.query<Row[]>(
      `SELECT phone, word, DATE_FORMAT(work_date, '%d-%m-%Y') AS d, TIME_FORMAT(at_time, '%H:%i') AS t
         FROM acct_attendance_unmatched WHERE legal_business_id = ?
        ORDER BY received_at DESC LIMIT ?`,
      [businessId, limit]
    );
    return rows.map((r) => ({ phone: String(r.phone), word: String(r.word), date: String(r.d), time: String(r.t) }));
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function loadRegister(businessId: number, month: string): Promise<{ ready: boolean; rows: RegisterRow[] }> {
  const [staff] = await db.query<Row[]>(
    `SELECT * FROM acct_employees
      WHERE legal_business_id = ? AND (status = 'ACTIVE' OR (left_on IS NOT NULL AND left_on >= ?))
        AND (joined_on IS NULL OR joined_on <= LAST_DAY(?))
      ORDER BY full_name`,
    [businessId, `${month}-01`, `${month}-01`]
  );
  let marks: Row[] = [];
  try {
    [marks] = await db.query<Row[]>(
      `SELECT employee_id, DATE_FORMAT(work_date, '%Y-%m-%d') AS d, status, TIME_FORMAT(in_time, '%H:%i') AS i, TIME_FORMAT(out_time, '%H:%i') AS o, source
         FROM acct_attendance WHERE legal_business_id = ? AND work_date BETWEEN ? AND LAST_DAY(?)`,
      [businessId, `${month}-01`, `${month}-01`]
    );
  } catch (error) {
    if (isMissingTable(error)) return { ready: false, rows: staff.map((s) => ({ id: Number(s.id), name: String(s.full_name), type: "FULL_TIME", whatsapp: null, days: new Map() })) };
    throw error;
  }
  const rows: RegisterRow[] = staff.map((s) => ({
    id: Number(s.id),
    name: String(s.full_name),
    type: String(s.employment_type ?? "FULL_TIME"),
    whatsapp: s.whatsapp_number ? String(s.whatsapp_number) : s.phone ? String(s.phone).replace(/\D/g, "").slice(-10) : null,
    days: new Map(),
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const m of marks) {
    byId.get(Number(m.employee_id))?.days.set(String(m.d), {
      status: (m.status as DayStatus) ?? null,
      inTime: m.i ? String(m.i) : null,
      outTime: m.o ? String(m.o) : null,
      source: String(m.source),
    });
  }
  return { ready: true, rows };
}
