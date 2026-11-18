/**
 * Attendance register rules (pure). Staff send IN or OUT on WhatsApp from the number saved on their
 * staff record; the first IN of the day is the arrival, the last OUT the leaving time. The owner can
 * also mark a day by hand (present, half day, absent, leave, weekly off, holiday).
 */

export type Punch = "IN" | "OUT";
export type DayStatus = "PRESENT" | "HALF_DAY" | "ABSENT" | "LEAVE" | "WEEKLY_OFF" | "HOLIDAY";

export const DAY_STATUSES: Array<{ key: DayStatus; label: string; short: string }> = [
  { key: "PRESENT", label: "Present", short: "P" },
  { key: "HALF_DAY", label: "Half day", short: "H" },
  { key: "ABSENT", label: "Absent (not paid)", short: "A" },
  { key: "LEAVE", label: "Paid leave", short: "L" },
  { key: "WEEKLY_OFF", label: "Weekly off", short: "W" },
  { key: "HOLIDAY", label: "Holiday", short: "O" },
];

const IN_WORDS = new Set(["in", "checkin", "check in", "login", "log in", "start", "reached", "present", "punch in", "came"]);
const OUT_WORDS = new Set(["out", "checkout", "check out", "logout", "log out", "leaving", "going", "punch out", "bye", "done"]);

/** "IN", "in", "Check in", "IN 🙏" -> IN; "out", "leaving" -> OUT; anything else -> null (not an attendance message). */
export function parseAttendanceMessage(text: string | null | undefined): Punch | null {
  const t = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 20) return null;
  if (IN_WORDS.has(t)) return "IN";
  if (OUT_WORDS.has(t)) return "OUT";
  return null;
}

/** India time of a WhatsApp message (seconds since 1970) as date and HH:MM:SS. */
export function indiaDateTime(epochSeconds: number): { date: string; time: string } {
  const d = new Date(epochSeconds * 1000 + 5.5 * 3600 * 1000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

export type DayRecord = { inTime: string | null; outTime: string | null; status: DayStatus | null };

/** The day after a punch: earliest IN kept, latest OUT kept; an IN or OUT marks the day present. */
export function applyPunch(day: DayRecord, punch: Punch, time: string): DayRecord {
  if (punch === "IN") {
    return { ...day, inTime: day.inTime && day.inTime <= time ? day.inTime : time, status: day.status ?? "PRESENT" };
  }
  return { ...day, outTime: day.outTime && day.outTime >= time ? day.outTime : time, status: day.status ?? "PRESENT" };
}

/** Hours between IN and OUT, to one decimal; null when either is missing or OUT is before IN. */
export function hoursWorked(inTime: string | null, outTime: string | null): number | null {
  if (!inTime || !outTime) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const m = toMin(outTime) - toMin(inTime);
  return m > 0 ? Math.round(m / 6) / 10 : null;
}

/** Count of each kind of day in a month (for pay and the register). */
export function monthMarks(days: Array<{ status: DayStatus | null }>): { present: number; half: number; absent: number; leave: number; off: number } {
  const c = { present: 0, half: 0, absent: 0, leave: 0, off: 0 };
  for (const d of days) {
    if (d.status === "PRESENT") c.present++;
    else if (d.status === "HALF_DAY") c.half++;
    else if (d.status === "ABSENT") c.absent++;
    else if (d.status === "LEAVE") c.leave++;
    else if (d.status === "WEEKLY_OFF" || d.status === "HOLIDAY") c.off++;
  }
  return c;
}

/** The reply sent back on WhatsApp after a punch. */
export function punchReply(name: string, punch: Punch, time: string): string {
  const hhmm = time.slice(0, 5);
  return punch === "IN" ? `Good morning ${name}. IN marked at ${hhmm}.` : `Thank you ${name}. OUT marked at ${hhmm}.`;
}
