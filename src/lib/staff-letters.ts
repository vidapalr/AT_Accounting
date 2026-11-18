/**
 * Staff letters as editable templates. Pure text, no database: easy to test.
 *
 * A template is a heading and a body. In the body:
 *  - a blank line starts a new paragraph;
 *  - lines starting with "- " become a numbered list;
 *  - {{field}} is replaced from the staff record, the company brand and the terms typed when printing
 *    (see LETTER_FIELDS). A field that is empty prints as [label], so a missing fact is easy to spot;
 *  - {{terms}} expands to the standard list of terms (salary, probation, hours, weekly off, leave, notice).
 * The company's own wording is saved per letter in acct_letter_templates (migration 084);
 * the defaults below are used until the owner changes them on Set-up > Letter templates.
 */

export type LetterType =
  | "offer"
  | "appointment"
  | "part_time_appointment"
  | "daily_wage_engagement"
  | "confirmation"
  | "increment"
  | "salary_certificate"
  | "resignation_acceptance"
  | "relieving"
  | "experience"
  | "warning"
  | "payslip";

export type TemplateLetterType = Exclude<LetterType, "payslip">;

export const LETTER_TYPES: Array<{ key: LetterType; label: string }> = [
  { key: "offer", label: "Offer letter" },
  { key: "appointment", label: "Appointment (joining) letter: full time" },
  { key: "part_time_appointment", label: "Appointment letter: part time" },
  { key: "daily_wage_engagement", label: "Engagement letter: daily wage" },
  { key: "confirmation", label: "Confirmation after probation" },
  { key: "increment", label: "Salary increase letter" },
  { key: "salary_certificate", label: "Salary certificate" },
  { key: "resignation_acceptance", label: "Resignation acceptance" },
  { key: "relieving", label: "Relieving letter" },
  { key: "experience", label: "Experience certificate" },
  { key: "warning", label: "Warning letter" },
  { key: "payslip", label: "Pay slip" },
];

export type Terms = {
  noticeDays: string;
  probationDays: string;
  hours: string;
  weeklyOff: string;
  /** Number of paid leaves in a year; "0" means none. */
  leaves: string;
};

export const DEFAULT_TERMS: Terms = {
  noticeDays: "30",
  probationDays: "30",
  hours: "10:00 AM to 9:00 PM",
  weeklyOff: "No fixed weekly off",
  leaves: "12",
};

export type LetterContext = {
  title: string; // Mr. / Ms. / Mrs. / ""
  name: string;
  jobTitle: string;
  salary: string; // formatted, e.g. "12,000"
  joinedOn: string; // dd-mm-yyyy or ""
  noticeGivenOn: string;
  leftOn: string;
  letterDate: string;
  place: string;
  /** How the employer is named in letters, e.g. "Acme Group (Acme Textiles)". */
  employer: string;
  terms: Terms;
  /** Full time, part time or daily wage (changes the pay line in the terms). */
  employmentType?: "FULL_TIME" | "PART_TIME" | "DAILY_WAGE";
  /** Daily wage, formatted (daily-wage staff). */
  dailyWage?: string;
  /** Cost to company a year, formatted (full time). */
  ctc?: string;
  /** Only some letters use these. */
  newSalary?: string;
  effectiveFrom?: string;
  reason?: string;
};

export type LetterTemplate = {
  heading: string;
  body: string;
  /** Prints "I accept the above terms" with a place for the employee to sign. */
  needsAcceptance: boolean;
};

export type LetterBlock = { kind: "p"; text: string } | { kind: "list"; items: string[] };
export type Letter = { heading: string; blocks: LetterBlock[]; needsAcceptance: boolean };

/** Every {{field}} a template may use, with the label shown when it is empty. */
export const LETTER_FIELDS: Array<{ key: string; label: string; help: string }> = [
  { key: "person", label: "name", help: "Title and name, e.g. Ms. Asha" },
  { key: "name", label: "name", help: "Name only" },
  { key: "job_title", label: "job title", help: "Job title from the staff record" },
  { key: "employer", label: "company", help: "Company name as set in the brand settings" },
  { key: "place", label: "town", help: "Town of the person's branch" },
  { key: "salary", label: "salary", help: "Monthly salary, e.g. ₹12,000.00" },
  { key: "daily_wage", label: "daily wage", help: "Daily wage (daily-wage staff)" },
  { key: "ctc", label: "CTC", help: "Cost to company a year (see the staff record)" },
  { key: "employment_type", label: "type of work", help: "Full time, part time or daily wage" },
  { key: "joined_on", label: "joining date", help: "Date of joining" },
  { key: "notice_given_on", label: "notice date", help: "Date notice was given" },
  { key: "left_on", label: "last working day", help: "Last working day" },
  { key: "letter_date", label: "date", help: "Today's date" },
  { key: "notice_days", label: "notice days", help: "Notice period in days" },
  { key: "probation", label: "probation", help: "Probation in words" },
  { key: "hours", label: "working hours", help: "Working hours" },
  { key: "weekly_off", label: "weekly off", help: "Weekly off" },
  { key: "leave", label: "leave", help: "Paid leave in words" },
  { key: "new_salary", label: "new salary", help: "New monthly salary (salary increase letter)" },
  { key: "effective_from", label: "effective date", help: "Date a change starts" },
  { key: "reason", label: "reason", help: "Reason (warning letter)" },
  { key: "terms", label: "terms", help: "The standard list of terms" },
];

export const DEFAULT_TEMPLATES: Record<TemplateLetterType, LetterTemplate> = {
  offer: {
    heading: "OFFER OF EMPLOYMENT",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "We are pleased to offer you the position of {{job_title}} at {{employer}}, {{place}}. We would like you to join us on {{joined_on}}.",
      "The main terms of the offer are:",
      "{{terms}}\n- A detailed appointment letter will be given to you when you join.",
      "Please sign and return a copy of this letter to confirm that you accept these terms.",
    ].join("\n\n"),
  },
  appointment: {
    heading: "APPOINTMENT LETTER",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "With reference to your discussion with us, we are pleased to appoint you as {{job_title}} at {{employer}}, {{place}}, with effect from {{joined_on}}.",
      "Your terms of employment are:",
      [
        "{{terms}}",
        "- You will do the work of your position honestly and follow the instructions of the management and the rules of the shop.",
        "- You will keep the business information, prices, customer details and accounts of the company private, during your employment and after you leave.",
        "- Any money, goods or property of the company in your care must be accounted for and handed back when you leave.",
        "- Any advance given to you will be recovered as agreed, and any balance will be settled when you leave.",
      ].join("\n"),
      "Please sign and return a copy of this letter to confirm that you accept these terms.",
    ].join("\n\n"),
  },
  part_time_appointment: {
    heading: "APPOINTMENT LETTER (PART TIME)",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "We are pleased to appoint you as {{job_title}} at {{employer}}, {{place}}, on a part-time basis, with effect from {{joined_on}}.",
      "Your terms of employment are:",
      [
        "{{terms}}",
        "- Your working days and hours may be changed by the management with notice to suit the needs of the shop.",
        "- You will keep the business information, prices and customer details of the company private, during your employment and after you leave.",
        "- Any money, goods or property of the company in your care must be accounted for and handed back when you leave.",
      ].join("\n"),
      "Please sign and return a copy of this letter to confirm that you accept these terms.",
    ].join("\n\n"),
  },
  daily_wage_engagement: {
    heading: "ENGAGEMENT LETTER (DAILY WAGE)",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "We are pleased to engage you as {{job_title}} at {{employer}}, {{place}}, on a daily-wage basis, from {{joined_on}}.",
      "The terms of your engagement are:",
      [
        "{{terms}}",
        "- Wages are paid for the days actually worked. There is no pay for days not worked.",
        "- You will follow the instructions of the management and the rules of the shop, and account for any money or goods in your care.",
      ].join("\n"),
      "Please sign and return a copy of this letter to confirm that you accept these terms.",
    ].join("\n\n"),
  },
  confirmation: {
    heading: "CONFIRMATION OF EMPLOYMENT",
    needsAcceptance: false,
    body: [
      "Dear {{person}},",
      "We are happy to inform you that you have completed your probation as {{job_title}} at {{employer}}, {{place}}, and your employment is confirmed with effect from {{effective_from}}.",
      "All other terms of your appointment letter stay the same. We thank you for your good work.",
    ].join("\n\n"),
  },
  increment: {
    heading: "SALARY REVISION",
    needsAcceptance: false,
    body: [
      "Dear {{person}},",
      "In appreciation of your work as {{job_title}}, your monthly salary is revised from {{salary}} to {{new_salary}} with effect from {{effective_from}}.",
      "All other terms of your employment stay the same. We wish you continued success.",
    ].join("\n\n"),
  },
  salary_certificate: {
    heading: "SALARY CERTIFICATE",
    needsAcceptance: false,
    body: [
      "To whom it may concern,",
      "This is to certify that {{person}} is working with {{employer}}, {{place}}, as {{job_title}} since {{joined_on}}, and draws a monthly salary of {{salary}}.",
      "This certificate is issued at the request of the employee.",
    ].join("\n\n"),
  },
  resignation_acceptance: {
    heading: "ACCEPTANCE OF RESIGNATION",
    needsAcceptance: false,
    body: [
      "Dear {{person}},",
      "We acknowledge your resignation from the position of {{job_title}}, given on {{notice_given_on}}. Your resignation is accepted and your last working day will be {{left_on}}.",
      "Please hand over your work, and all company money, goods, keys and records in your care, before your last working day. Your final settlement will be made after the handover.",
      "We thank you for your service and wish you well.",
    ].join("\n\n"),
  },
  relieving: {
    heading: "RELIEVING LETTER",
    needsAcceptance: false,
    body: [
      "To whom it may concern,",
      "This is to confirm that {{person}} worked with {{employer}}, {{place}}, as {{job_title}} from {{joined_on}}.",
      "{{name}} has been relieved from the services of the company at the close of working hours on {{left_on}}.",
      "This relieving is subject to the completion of the final settlement of any dues and the handing back of all company property and records.",
      "We thank you for your service and wish you well.",
    ].join("\n\n"),
  },
  experience: {
    heading: "EXPERIENCE CERTIFICATE",
    needsAcceptance: false,
    body: [
      "To whom it may concern,",
      "This is to certify that {{person}} worked with {{employer}}, {{place}}, as {{job_title}} from {{joined_on}} to {{left_on}}.",
      "This certificate is issued at the request of the employee. We wish you success in your future work.",
    ].join("\n\n"),
  },
  warning: {
    heading: "WARNING LETTER",
    needsAcceptance: false,
    body: [
      "Dear {{person}},",
      "This letter is a formal warning about the following: {{reason}}.",
      "We expect you to correct this at once. If it happens again, the company may take further action as per your terms of employment.",
      "Please sign a copy of this letter to show you have received it.",
    ].join("\n\n"),
  },
};

export function leaveWords(leaves: string): string {
  const n = Number(leaves);
  if (!leaves.trim() || Number.isNaN(n) || n <= 0) return "No paid leave is given";
  return `${n} paid leave${n === 1 ? "" : "s"} in a year`;
}

function probationWords(days: string): string {
  return Number(days) > 0 ? `${days} days from the date of joining (can be changed by mutual agreement)` : "None";
}

function payLine(c: LetterContext): string {
  if (c.employmentType === "DAILY_WAGE") return `Daily wage: ₹${c.dailyWage || "[daily wage]"} for each day you are present, as marked in the attendance register, paid monthly`;
  if (c.employmentType === "PART_TIME") return `Monthly salary: ₹${c.salary} for part-time work; days absent without leave are not paid`;
  return `Monthly salary: ₹${c.salary}${c.ctc ? ` (cost to company ₹${c.ctc} a year, including the company's PF and ESI share where they apply)` : ""}`;
}

const TYPE_WORDS = { FULL_TIME: "full time", PART_TIME: "part time", DAILY_WAGE: "daily wage" } as const;

function termLines(c: LetterContext): string[] {
  const t = c.terms;
  if (c.employmentType === "DAILY_WAGE") {
    return [payLine(c), `Working hours: ${t.hours}`, "Attendance: send IN when you arrive and OUT when you leave on the company WhatsApp, or sign the register", `Either side may end this engagement with ${t.noticeDays === "0" ? "one day's" : `${t.noticeDays} days'`} notice`];
  }
  return [
    payLine(c),
    `Probation: ${probationWords(t.probationDays)}`,
    `Working hours: ${t.hours}`,
    `Weekly off: ${t.weeklyOff}`,
    `Leave: ${leaveWords(t.leaves)}`,
    `Notice period: ${t.noticeDays} days by either side (can be changed by mutual agreement in writing)`,
  ];
}

/** The values for every {{field}}. */
export function letterValues(c: LetterContext): Record<string, string> {
  return {
    person: `${c.title ? `${c.title} ` : ""}${c.name}`,
    name: c.name,
    job_title: c.jobTitle,
    employer: c.employer,
    place: c.place,
    salary: c.salary ? `₹${c.salary}` : "",
    daily_wage: c.dailyWage ? `₹${c.dailyWage}` : "",
    ctc: c.ctc ? `₹${c.ctc}` : "",
    employment_type: TYPE_WORDS[c.employmentType ?? "FULL_TIME"],
    joined_on: c.joinedOn,
    notice_given_on: c.noticeGivenOn,
    left_on: c.leftOn,
    letter_date: c.letterDate,
    notice_days: c.terms.noticeDays,
    probation: probationWords(c.terms.probationDays),
    hours: c.terms.hours,
    weekly_off: c.terms.weeklyOff,
    leave: leaveWords(c.terms.leaves),
    new_salary: c.newSalary ? `₹${c.newSalary}` : "",
    effective_from: c.effectiveFrom ?? "",
    reason: c.reason ?? "",
  };
}

const LABELS = new Map(LETTER_FIELDS.map((f) => [f.key, f.label]));

function fill(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => {
    if (!(key in values)) return whole;
    const v = values[key].trim();
    return v || `[${LABELS.get(key) ?? key.replace(/_/g, " ")}]`;
  });
}

/** Fills a template for one person. */
export function renderLetter(template: LetterTemplate, c: LetterContext): Letter {
  const values = letterValues(c);
  const terms = termLines(c).map((t) => `- ${t}`).join("\n");
  const body = template.body.replace(/\r\n/g, "\n").replace(/\{\{\s*terms\s*\}\}/g, terms);
  const blocks: LetterBlock[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => { if (para.length) blocks.push({ kind: "p", text: fill(para.join(" "), values) }); para = []; };
    const flushList = () => { if (list.length) blocks.push({ kind: "list", items: list.map((x) => fill(x, values)) }); list = []; };
    for (const line of lines) {
      if (line.startsWith("- ")) { flushPara(); list.push(line.slice(2).trim()); }
      else { flushList(); para.push(line); }
    }
    flushPara();
    flushList();
  }
  return { heading: fill(template.heading, values), blocks, needsAcceptance: template.needsAcceptance };
}

/** Kept for existing callers: the default wording of a letter for one person. */
export function buildLetter(type: TemplateLetterType, c: LetterContext): Letter {
  return renderLetter(DEFAULT_TEMPLATES[type], c);
}

export type PaySlip = { month: string; paid: string; advanceTaken: string; paidOn: string; net: string };
