/**
 * A staff letter as a corporate document: pages of simple blocks that both the screen (print) and the
 * PDF draw from, so the two always match. Pure (no database): easy to test.
 *
 * Offer and joining letters are a four-page pack:
 *   1. Welcome letter (the editable letter template)
 *   2. Joining details (Employee ID, date, place, hours, documents to bring)
 *   3. Terms and conditions (the editable terms template)
 *   4. Salary annexure (from the payroll rules), then the acceptance
 * Every other letter is one page in the same corporate layout (reference, date, addressee, subject).
 */
import type { Payslip } from "./payroll/engine.ts";
import { PACK_LETTERS, renderLetter, type LetterContext, type LetterTemplate, type LetterType } from "./staff-letters.ts";

export type MoneyRow = { label: string; monthly: bigint | null; annual: bigint | null; style?: "head" | "total" | "grand" };

export type PackBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "facts"; rows: Array<[string, string]> }
  | { kind: "money"; rows: MoneyRow[] }
  | { kind: "note"; text: string }
  | { kind: "sign" }
  /** The employee's acceptance (or, for a warning, acknowledgement) box. */
  | { kind: "accept"; title: string; text: string };

/** compact: set a little smaller so it stays on one page (the terms and conditions). */
export type PackPage = { title: string; blocks: PackBlock[]; compact?: boolean };

export type LetterPack = {
  ref: string;
  date: string;
  /** Addressee lines: name, Employee ID / job, address, phone. */
  to: string[];
  subject: string;
  employer: string;
  personName: string;
  pages: PackPage[];
  needsAcceptance: boolean;
};

const TYPE_CODE: Record<LetterType, string> = {
  offer: "OL", appointment: "AL", part_time_appointment: "AL", daily_wage_engagement: "EL", hourly_engagement: "EL",
  confirmation: "CL", increment: "SR", salary_certificate: "SC", resignation_acceptance: "RA", relieving: "RL",
  experience: "EC", warning: "WL", payslip: "PS",
};

/** Reference number printed on the letter, e.g. HR/AL/EMP-0007/20261119 (automatic, never typed). */
export function letterRef(type: LetterType, employeeCode: string, dateIso: string): string {
  return `HR/${TYPE_CODE[type]}/${employeeCode || "NEW"}/${dateIso.replaceAll("-", "")}`;
}

/** dd-mm-yyyy plus some days, for an offer's last day to accept. */
export function addDaysDmy(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  const iso = d.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

const isWage = (c: LetterContext) => c.employmentType === "DAILY_WAGE" || c.employmentType === "HOURLY";

/** What differs between the pack letters: page titles, page-2 wording and the acceptance sentence. */
type Profile = { details: string; annex: string; intro: string; accept: string; next: { title: string; text: (who: string) => string } };
const PROFILES: Partial<Record<LetterType, Profile>> = {
  offer: {
    details: "OFFER DETAILS", annex: "COMPENSATION ANNEXURE",
    intro: "the details of the position we are offering you are given below",
    accept: "I accept this offer of employment on the terms set out in this letter and its annexures, and I confirm that I will join on the date of joining given in it.",
    next: { title: "Next steps", text: (who) => `Please accept this offer before it lapses. When you join, report to ${who} with the documents listed above; you will then receive your letter of appointment and Employee ID.` },
  },
  appointment: {
    details: "JOINING DETAILS", annex: "SALARY ANNEXURE",
    intro: "the details of your joining are given below. Please keep this page for your reference",
    accept: "I accept this appointment on the terms and conditions set out in this letter and its annexures.",
    next: { title: "On your first day", text: (who) => `Please report to ${who} at the start of working hours. Your attendance will be recorded from your registered WhatsApp number by sending IN when you arrive and OUT when you leave.` },
  },
  part_time_appointment: {
    details: "JOINING DETAILS (PART TIME)", annex: "SALARY ANNEXURE (PART TIME)",
    intro: "the details of your part-time joining are given below. Please keep this page for your reference",
    accept: "I accept this part-time appointment on the terms and conditions set out in this letter and its annexures.",
    next: { title: "On your first day", text: (who) => `Please report to ${who} at the start of your first shift. Your working days will be agreed with your manager, and your attendance is recorded by sending IN and OUT from your registered WhatsApp number.` },
  },
  daily_wage_engagement: {
    details: "ENGAGEMENT DETAILS", annex: "WAGE ANNEXURE",
    intro: "the details of your engagement are given below",
    accept: "I accept this engagement on a daily-wage basis on the terms set out in this letter and its annexures.",
    next: { title: "On your first day", text: (who) => `Please report to ${who} at the start of working hours. Each day you work is counted from your IN and OUT messages on WhatsApp, so please send both every day.` },
  },
  hourly_engagement: {
    details: "ENGAGEMENT DETAILS", annex: "PAY ANNEXURE",
    intro: "the details of your engagement are given below",
    accept: "I accept this engagement on an hourly basis on the terms set out in this letter and its annexures.",
    next: { title: "On your first day", text: (who) => `Please report to ${who} at the agreed time. Your hours are counted from the moment you send IN to the moment you send OUT on WhatsApp, so please send both every time you work.` },
  },
};

/** Acceptance box of the one-page letters that ask for it: a warning is acknowledged, not accepted. */
function onePageAccept(type: LetterType, person: string): PackBlock {
  return type === "warning"
    ? { kind: "accept", title: "ACKNOWLEDGEMENT BY THE EMPLOYEE", text: `I, ${person}, have received this letter and understood its contents.` }
    : { kind: "accept", title: "ACCEPTANCE BY THE EMPLOYEE", text: `I, ${person}, have read and understood this letter and accept its contents.` };
}

/**
 * Salary annexure rows from one month worked out by the payroll rules (full month, the person's own PF,
 * ESI and professional tax settings), plus the year's bonus and gratuity.
 */
export function salaryAnnexure(slip: Payslip, extras: { bonusAnnual: bigint; gratuityAnnual: bigint }): { rows: MoneyRow[]; ctcAnnual: bigint; takeHome: bigint } {
  const rows: MoneyRow[] = [{ label: "A. Earnings", monthly: null, annual: null, style: "head" }];
  for (const e of slip.earnings) rows.push({ label: e.name, monthly: e.full, annual: e.full * 12n });
  rows.push({ label: "Gross salary (A)", monthly: slip.gross, annual: slip.gross * 12n, style: "total" });

  const pf = slip.employer.epf + slip.employer.eps + slip.employer.edli + slip.employer.pfAdmin;
  const benefits: MoneyRow[] = [];
  if (pf > 0n) benefits.push({ label: "Employer's Provident Fund (incl. pension, EDLI, admin)", monthly: pf, annual: pf * 12n });
  if (slip.employer.esi > 0n) benefits.push({ label: "Employer's ESI contribution", monthly: slip.employer.esi, annual: slip.employer.esi * 12n });
  if (extras.bonusAnnual > 0n) benefits.push({ label: "Statutory bonus", monthly: extras.bonusAnnual / 12n, annual: extras.bonusAnnual });
  if (extras.gratuityAnnual > 0n) benefits.push({ label: "Gratuity (provision)", monthly: extras.gratuityAnnual / 12n, annual: extras.gratuityAnnual });
  const benefitsMonthly = benefits.reduce((t, r) => t + (r.monthly ?? 0n), 0n);
  const benefitsAnnual = benefits.reduce((t, r) => t + (r.annual ?? 0n), 0n);
  if (benefits.length) {
    rows.push({ label: "B. Company contributions and benefits", monthly: null, annual: null, style: "head" }, ...benefits);
    rows.push({ label: "Total benefits (B)", monthly: benefitsMonthly, annual: benefitsAnnual, style: "total" });
  }
  const ctcAnnual = slip.gross * 12n + benefitsAnnual;
  rows.push({ label: benefits.length ? "Cost to company (A + B)" : "Cost to company", monthly: slip.gross + benefitsMonthly, annual: ctcAnnual, style: "grand" });

  const deductions: MoneyRow[] = [];
  if (slip.employee.pf > 0n) deductions.push({ label: "Your Provident Fund contribution", monthly: slip.employee.pf, annual: slip.employee.pf * 12n });
  if (slip.employee.esi > 0n) deductions.push({ label: "Your ESI contribution", monthly: slip.employee.esi, annual: slip.employee.esi * 12n });
  if (slip.employee.pt > 0n) deductions.push({ label: "Professional tax", monthly: slip.employee.pt, annual: slip.employee.pt * 12n });
  const takeHome = slip.gross - slip.employee.pf - slip.employee.esi - slip.employee.pt;
  if (deductions.length) {
    rows.push({ label: "C. Deductions from your salary", monthly: null, annual: null, style: "head" }, ...deductions);
  }
  rows.push({ label: deductions.length ? "Take-home salary (A - C), before income tax" : "Take-home salary, before income tax", monthly: takeHome, annual: takeHome * 12n, style: "grand" });
  return { rows, ctcAnnual, takeHome };
}

export type PackInput = {
  type: LetterType;
  ctx: LetterContext;
  dateIso: string;
  letter: LetterTemplate;
  /** The terms-and-conditions template (pack letters only). */
  terms: LetterTemplate;
  homeAddress: string;
  phone: string;
  workAddress: string;
  annexure: { rows: MoneyRow[]; basis: string[] } | null;
};

export function buildLetterPack(input: PackInput): LetterPack {
  const { ctx, type } = input;
  const person = `${ctx.title ? `${ctx.title} ` : ""}${ctx.name}`;
  const letter = renderLetter(input.letter, ctx);
  const welcome: PackBlock[] = letter.blocks.map((b) => (b.kind === "list" ? { kind: "list", items: b.items } : b));
  // Certificates addressed "To whom it may concern" have no addressee block.
  const open = letter.blocks[0]?.kind === "p" ? letter.blocks[0].text : "";
  const to = /^to whom it may concern/i.test(open) ? [] : [
    person,
    [ctx.employeeCode ? `Employee ID: ${ctx.employeeCode}` : "", ctx.jobTitle].filter(Boolean).join(" · "),
    input.homeAddress,
    input.phone ? `Mobile: ${input.phone}` : "",
  ].filter(Boolean);
  const subject = `${letter.heading.charAt(0)}${letter.heading.slice(1).toLowerCase()}${ctx.jobTitle && PACK_LETTERS.has(type) ? ` – ${ctx.jobTitle}` : ""}`;
  const base = {
    ref: letterRef(type, ctx.employeeCode ?? "", input.dateIso),
    date: ctx.letterDate,
    to,
    subject,
    employer: ctx.employer,
    personName: person,
    needsAcceptance: letter.needsAcceptance,
  };

  if (!PACK_LETTERS.has(type)) {
    return { ...base, pages: [{ title: letter.heading, blocks: [...welcome, { kind: "sign" }, ...(letter.needsAcceptance ? [onePageAccept(type, person)] : [])] }] };
  }
  const profile = PROFILES[type]!;
  const who = ctx.reportsTo || "the branch manager";

  const t = ctx.terms;
  const wage = isWage(ctx);
  const missing = (v: string | undefined, label: string) => (v && v.trim() ? v : `[${label}]`);
  const payFact: Array<[string, string]> = ctx.employmentType === "HOURLY"
    ? [["Rate of pay", `₹${missing(ctx.hourlyRate, "hourly rate")} an hour`]]
    : ctx.employmentType === "DAILY_WAGE"
      ? [["Daily wage", `₹${missing(ctx.dailyWage, "daily wage")} a day`]]
      : [["Monthly gross salary", `₹${ctx.salary}`], ["Annual cost to company", ctx.ctc ? `₹${ctx.ctc}` : "[CTC]"]];

  const joining: PackBlock[] = [
    { kind: "p", text: `Dear ${person}, ${profile.intro}.` },
    { kind: "facts", rows: [
      [type === "offer" ? "Reference" : "Employee ID", missing(ctx.employeeCode, "Employee ID")],
      ["Name", person],
      ["Designation", missing(ctx.jobTitle, "job title")],
      ["Department", ctx.department || "—"],
      ["Type of employment", { FULL_TIME: "Full time", PART_TIME: "Part time", DAILY_WAGE: "Daily wage", HOURLY: "Paid by the hour" }[ctx.employmentType ?? "FULL_TIME"]],
      [type === "offer" ? "Proposed date of joining" : "Date of joining", missing(ctx.joinedOn, "joining date")],
      ...(type === "offer" ? ([["Offer valid until", missing(ctx.offerValidUntil, "offer valid until")]] as Array<[string, string]>) : []),
      ["Place of work", input.workAddress || ctx.place],
      ["Reporting to", ctx.reportsTo || "Branch manager"],
      ["Working hours", t.hours],
      ...(wage ? [] : ([["Weekly off", t.weeklyOff], ["Probation", Number(t.probationDays) > 0 ? `${t.probationDays} days` : "None"], ["Paid leave", Number(t.leaves) > 0 ? `${t.leaves} days a year` : "None"]] as Array<[string, string]>)),
      ["Notice period", `${t.noticeDays} days`],
      ...payFact,
    ] },
    { kind: "h", text: type === "offer" ? "Documents to bring when you join" : "Please bring on your first day" },
    { kind: "list", items: [
      "Aadhaar card and PAN card (original and one photocopy each)",
      "Two recent passport-size photographs",
      "Bank passbook or a cancelled cheque for salary payment",
      "Educational certificates",
      "Relieving letter and last pay slip from your previous employer, if any",
      "UAN (PF number) and ESI number, if you already have them",
    ] },
    { kind: "h", text: profile.next.title },
    { kind: "p", text: profile.next.text(who) },
  ];

  const termsLetter = renderLetter(input.terms, ctx);
  const termsBlocks: PackBlock[] = termsLetter.blocks.map((b) => (b.kind === "list" ? { kind: "list", items: b.items } : b));

  const annex: PackBlock[] = [];
  if (input.annexure) {
    for (const line of input.annexure.basis) annex.push({ kind: "p", text: line });
    annex.push({ kind: "money", rows: input.annexure.rows });
  }
  annex.push({ kind: "note", text: wage
    ? "The monthly figures are an estimate for a normal month. Actual pay depends on the days or hours recorded in the attendance register."
    : "Provident Fund, ESI and professional tax are worked out on the rules that apply today and will follow any change in the law. Income tax is deducted at source as the law requires." });
  annex.push({ kind: "sign" });
  if (letter.needsAcceptance) annex.push({ kind: "accept", title: "ACCEPTANCE BY THE EMPLOYEE", text: `I, ${person}, have read and understood every page of this letter. ${profile.accept}` });

  return {
    ...base,
    pages: [
      { title: letter.heading, blocks: [...welcome, { kind: "sign" }] },
      { title: profile.details, blocks: joining },
      { title: termsLetter.heading, blocks: termsBlocks, compact: true },
      { title: profile.annex, blocks: annex },
    ],
  };
}
