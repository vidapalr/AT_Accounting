/** Formatting helpers shared by reports, dashboard and exports (pure). */

export function toPaise(value: string | number | null | undefined): bigint {
  const text = String(value ?? "0");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const paise = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  return negative ? -paise : paise;
}

export function inr(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const decimals = String(abs % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}₹${(abs / 100n).toLocaleString("en-IN")}.${decimals}`;
}

/** Whole rupees with no paise, for compact tiles: ₹3,56,248 */
export function inrShort(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const rupees = (abs + 50n) / 100n;
  return `${negative ? "-" : ""}₹${rupees.toLocaleString("en-IN")}`;
}

export function percent(part: bigint, whole: bigint): string {
  if (whole <= 0n) return "—";
  return `${(Number((part * 10000n) / whole) / 100).toFixed(1)}%`;
}

/** Number for spreadsheets and charts (exact to the paisa for realistic sizes). */
export function toNumber(paise: bigint): number {
  return Number(paise) / 100;
}

/** Today's date in India, as YYYY-MM-DD, whatever the server's time zone. */
export function todayInIndia(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function isDate(value: string | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
