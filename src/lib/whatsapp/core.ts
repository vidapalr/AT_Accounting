/**
 * WhatsApp reporting: the pieces that need no database or network, so they
 * can be tested on their own.
 */

export type ReportType =
  | "DAILY_SALES"
  | "DAILY_FULL"
  | "STOCK_DAILY"
  | "STOCK_MONTHLY"
  | "ALERTS"
  | "INVESTOR_STATEMENT";

export const REPORT_TYPES: ReportType[] = [
  "DAILY_SALES",
  "DAILY_FULL",
  "STOCK_DAILY",
  "STOCK_MONTHLY",
  "ALERTS",
  "INVESTOR_STATEMENT",
];

export const REPORT_LABELS: Record<ReportType, string> = {
  DAILY_SALES: "Daily sales summary (9 PM)",
  DAILY_FULL: "Daily full report (9 PM)",
  STOCK_DAILY: "Current stock, daily (9 PM)",
  STOCK_MONTHLY: "Current stock, monthly (1st of month)",
  ALERTS: "Low stock and pending dues alerts (8 AM)",
  INVESTOR_STATEMENT: "Monthly investor statement (1st of month)",
};

export type Job = "daily" | "morning" | "monthly";

export const JOB_REPORTS: Record<Job, ReportType[]> = {
  daily: ["DAILY_SALES", "DAILY_FULL", "STOCK_DAILY"],
  morning: ["ALERTS"],
  monthly: ["STOCK_MONTHLY", "INVESTOR_STATEMENT"],
};

export function isJob(value: string | null | undefined): value is Job {
  return value === "daily" || value === "morning" || value === "monthly";
}

export const isMonthly = (type: ReportType) => type === "STOCK_MONTHLY" || type === "INVESTOR_STATEMENT";

/** First and last day of the month before `today`, and its 'YYYY-MM' key. */
export function previousMonth(today: string): { from: string; to: string; key: string } {
  const [y, m] = today.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}`, key: `${year}-${mm}` };
}

/** The date range a report covers when its job runs on `today`. */
export function reportPeriod(type: ReportType, today: string): { from: string; to: string; key: string } {
  if (isMonthly(type)) return previousMonth(today);
  return { from: today, to: today, key: today };
}

/**
 * Indian numbers (10 digits starting 6-9, with or without 0, 91 or +91) and
 * international numbers written with +. Returns +<digits>, or null.
 */
export function normalizePhone(input: string): string | null {
  const raw = String(input ?? "").trim();
  const plus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (plus) {
    if (digits.startsWith("91")) return /^91[6-9]\d{9}$/.test(digits) ? `+${digits}` : null;
    return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  }
  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `+91${digits.slice(1)}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** WhatsApp template values: one line, no tabs, no runs of 4+ spaces, not too long. */
export function cleanParam(value: string, max = 200): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim();
  const out = text.length > max ? `${text.slice(0, max - 1)}…` : text;
  return out === "" ? "-" : out;
}

export type TemplateDef = {
  type: ReportType;
  /** Name registered with WhatsApp. Can be overridden with WHATSAPP_TEMPLATE_<TYPE>. */
  name: string;
  language: string;
  body: string;
  paramCount: number;
};

export const TEMPLATES: TemplateDef[] = [
  {
    type: "DAILY_SALES",
    name: "abhiram_daily_sales",
    language: "en",
    body: "Abhiram Group daily sales for {{1}} - {{2}}. Invoices: {{3}}. Net sales: {{4}}. Collected: {{5}}. Gross profit: {{6}}. The full report is attached.",
    paramCount: 6,
  },
  {
    type: "DAILY_FULL",
    name: "abhiram_daily_report",
    language: "en",
    body: "Abhiram Group daily report for {{1}} - {{2}}. Net sales: {{3}}. Gross profit: {{4}}. Operating profit: {{5}}. Cash and bank: {{6}}. The full report is attached.",
    paramCount: 6,
  },
  {
    type: "STOCK_DAILY",
    name: "abhiram_stock_report",
    language: "en",
    body: "Abhiram Group {{1}} - {{2}}. Items in stock: {{3}}. Total units: {{4}}. Low-stock items: {{5}}. The full report is attached.",
    paramCount: 5,
  },
  {
    type: "STOCK_MONTHLY",
    name: "abhiram_stock_report",
    language: "en",
    body: "Abhiram Group {{1}} - {{2}}. Items in stock: {{3}}. Total units: {{4}}. Low-stock items: {{5}}. The full report is attached.",
    paramCount: 5,
  },
  {
    type: "ALERTS",
    name: "abhiram_alerts",
    language: "en",
    body: "Abhiram Group alerts for {{1}} - {{2}}. Low-stock items: {{3}}. Customers owing: {{4}} totalling {{5}}. Suppliers to pay: {{6}}. Details are attached.",
    paramCount: 6,
  },
  {
    type: "INVESTOR_STATEMENT",
    name: "abhiram_investor_statement",
    language: "en",
    body: "Dear {{1}}, your Abhiram Group profit statement for {{2}} is attached. Your share for the month: {{3}}. Agreements covered: {{4}}.",
    paramCount: 4,
  },
];

export function templateFor(type: ReportType, env: Record<string, string | undefined> = {}): TemplateDef {
  const base = TEMPLATES.find((t) => t.type === type)!;
  const override = env[`WHATSAPP_TEMPLATE_${type}`]?.trim();
  return override ? { ...base, name: override } : base;
}

/** What a scheduled report holds, independent of how it is shown. */
export type ReportContent = {
  type: ReportType;
  title: string;
  subtitle: string;
  /** Values for the template body, in order. */
  params: string[];
  sections: Array<{ heading: string; columns: string[]; rows: string[][] }>;
  footnote?: string;
  /** Nothing worth sending (for example, no alerts today). */
  empty?: boolean;
};

export function subscriptionKey(sub: { divisionId: number | null; branchId: number | null }): string {
  return sub.branchId !== null ? `B${sub.branchId}` : sub.divisionId !== null ? `D${sub.divisionId}` : "G";
}

/** "G", "D:3" or "B:7" from the recipient form. */
export function parseScope(value: string): { divisionId: number | null; branchId: number | null; divisionOfBranch?: boolean } | null {
  if (value === "G") return { divisionId: null, branchId: null };
  const m = /^([DB]):(\d{1,12})$/.exec(value);
  if (!m) return null;
  const id = Number(m[2]);
  return m[1] === "D" ? { divisionId: id, branchId: null } : { divisionId: null, branchId: id, divisionOfBranch: true };
}
