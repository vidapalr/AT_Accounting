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
  | "hourly_engagement"
  | "confirmation"
  | "increment"
  | "salary_certificate"
  | "resignation_acceptance"
  | "relieving"
  | "experience"
  | "warning"
  | "payslip";

/** Letters, plus the terms-and-conditions page of the offer and joining pack (editable like a letter). */
export type TemplateLetterType = Exclude<LetterType, "payslip"> | "terms_monthly" | "terms_wage";

/** Letters printed as the four-page corporate pack: welcome, joining details, terms, salary annexure. */
export const PACK_LETTERS: ReadonlySet<LetterType> = new Set(["offer", "appointment", "part_time_appointment", "daily_wage_engagement", "hourly_engagement"]);

export const LETTER_TYPES: Array<{ key: LetterType; label: string }> = [
  { key: "offer", label: "Offer letter" },
  { key: "appointment", label: "Appointment (joining) letter: full time" },
  { key: "part_time_appointment", label: "Appointment letter: part time" },
  { key: "daily_wage_engagement", label: "Engagement letter: daily wage" },
  { key: "hourly_engagement", label: "Engagement letter: paid by the hour" },
  { key: "confirmation", label: "Confirmation after probation" },
  { key: "increment", label: "Salary increase letter" },
  { key: "salary_certificate", label: "Salary certificate" },
  { key: "resignation_acceptance", label: "Resignation acceptance" },
  { key: "relieving", label: "Relieving letter" },
  { key: "experience", label: "Experience certificate" },
  { key: "warning", label: "Warning letter" },
  { key: "payslip", label: "Pay slip" },
];

/** Everything that can be worded on Set-up > Letter templates. */
export const TEMPLATE_LIST: Array<{ key: TemplateLetterType; label: string }> = [
  ...(LETTER_TYPES.filter((t) => t.key !== "payslip") as Array<{ key: TemplateLetterType; label: string }>),
  { key: "terms_monthly", label: "Terms and conditions page: full and part time" },
  { key: "terms_wage", label: "Terms and conditions page: daily wage and hourly" },
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
  employmentType?: "FULL_TIME" | "PART_TIME" | "DAILY_WAGE" | "HOURLY";
  /** Daily wage, formatted (daily-wage staff). */
  dailyWage?: string;
  hourlyRate?: string;
  /** Cost to company a year, formatted (full time). */
  ctc?: string;
  /** Employee ID (EMP-0001), department and reporting manager, from the staff record. */
  employeeCode?: string;
  department?: string;
  reportsTo?: string;
  /** Offer letters: the last day to accept. */
  offerValidUntil?: string;
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

export type LetterBlock = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "list"; items: string[] };
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
  { key: "employee_id", label: "Employee ID", help: "Employee ID from the staff record, e.g. EMP-0007" },
  { key: "department", label: "department", help: "Department from the staff record" },
  { key: "reports_to", label: "reporting manager", help: "Who the person reports to" },
  { key: "hourly_rate", label: "hourly rate", help: "Rate for one hour (hourly staff)" },
  { key: "offer_valid_until", label: "offer valid until", help: "Last day to accept an offer (7 days from the letter date)" },
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
// In a template, a line starting with "## " is a sub-heading (used on the terms and conditions page).

export const DEFAULT_TEMPLATES: Record<TemplateLetterType, LetterTemplate> = {
  offer: {
    heading: "OFFER OF EMPLOYMENT",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "On behalf of {{employer}}, it gives us great pleasure to offer you the position of {{job_title}}. We were impressed by your background and believe you will be a valuable member of our team.",
      "You will be based at {{place}} and we would like you to join us on {{joined_on}}. Your joining details, the terms and conditions of employment and your salary structure are set out on the pages that follow, and form part of this offer.",
      "This offer is valid until {{offer_valid_until}}. Please read every page carefully and confirm your acceptance by signing at the end of this letter, or by accepting it electronically when it is sent to you.",
      "We look forward to welcoming you to {{employer}}.",
    ].join("\n\n"),
  },
  appointment: {
    heading: "LETTER OF APPOINTMENT",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "Welcome to {{employer}}. We are delighted to appoint you as {{job_title}} with effect from {{joined_on}}.",
      "Your Employee ID is {{employee_id}}. Please quote it in all your communication with the company.",
      "This letter, together with the joining details, the terms and conditions of employment and the salary annexure on the pages that follow, sets out the terms on which you are employed.",
      "We are confident that your skills and commitment will contribute to our growth, and we wish you a rewarding career with us. Please confirm that you accept these terms by signing at the end of this letter, or by accepting it electronically when it is sent to you.",
    ].join("\n\n"),
  },
  part_time_appointment: {
    heading: "LETTER OF APPOINTMENT (PART TIME)",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "Welcome to {{employer}}. We are pleased to appoint you as {{job_title}} on a part-time basis with effect from {{joined_on}}.",
      "Your Employee ID is {{employee_id}}. Please quote it in all your communication with the company.",
      "This letter, together with the joining details, the terms and conditions of employment and the salary annexure on the pages that follow, sets out the terms on which you are employed.",
      "We look forward to working with you. Please confirm that you accept these terms by signing at the end of this letter, or by accepting it electronically when it is sent to you.",
    ].join("\n\n"),
  },
  daily_wage_engagement: {
    heading: "LETTER OF ENGAGEMENT (DAILY WAGE)",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "Welcome to {{employer}}. We are pleased to engage you as {{job_title}} on a daily-wage basis from {{joined_on}}.",
      "Your Employee ID is {{employee_id}}. Please quote it in all your communication with the company.",
      "The joining details, the terms and conditions of your engagement and your wage details are set out on the pages that follow.",
      "We look forward to working with you. Please confirm that you accept these terms by signing at the end of this letter, or by accepting it electronically when it is sent to you.",
    ].join("\n\n"),
  },
  hourly_engagement: {
    heading: "LETTER OF ENGAGEMENT (HOURLY)",
    needsAcceptance: true,
    body: [
      "Dear {{person}},",
      "Welcome to {{employer}}. We are pleased to engage you as {{job_title}} on an hourly basis from {{joined_on}}.",
      "Your Employee ID is {{employee_id}}. Please quote it in all your communication with the company.",
      "The joining details, the terms and conditions of your engagement and your pay details are set out on the pages that follow.",
      "We look forward to working with you. Please confirm that you accept these terms by signing at the end of this letter, or by accepting it electronically when it is sent to you.",
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
  terms_monthly: {
    heading: "TERMS AND CONDITIONS OF EMPLOYMENT",
    needsAcceptance: false,
    body: [
      "## 1. Probation and confirmation",
      "You will be on probation for {{probation}}. During probation either side may end the employment with seven days' notice. On satisfactory completion you will be confirmed in writing; until then you remain on probation.",
      "## 2. Place of work and transfer",
      "You will be based at {{place}}. The company may ask you to work at, or transfer you to, any branch, division or associated business of {{employer}}.",
      "## 3. Working hours and attendance",
      "Your working hours are {{hours}}. Weekly off: {{weekly_off}}. You will record your attendance every day by sending IN on arrival and OUT on leaving from your registered WhatsApp number, or as the company directs. Late arrival or absence without permission may lead to loss of pay.",
      "## 4. Leave",
      "{{leave}}. Holidays declared by the company are given in addition. Leave must be applied for and approved in advance, except in an emergency. Absence without permission for eight consecutive days may be treated as your having left the employment of your own accord.",
      "## 5. Salary and statutory benefits",
      "Your salary and its parts are set out in the Salary Annexure. Salary is paid monthly, on or before the seventh day of the following month, by bank transfer. Provident Fund, Employees' State Insurance, professional tax and income tax will be deducted and contributed as the law requires where they apply. Bonus and gratuity will be paid as the law provides.",
      "## 6. Conduct and company policies",
      "You will carry out your duties honestly and diligently, treat customers and colleagues with courtesy, follow the dress code and the instructions of your manager, and comply with company policies as issued or amended from time to time.",
      "## 7. Cash, stock and company property",
      "You are responsible for any cash, stock, keys, equipment or records placed in your care. Any loss caused by your negligence or dishonesty may be recovered from you as the law permits. All company property must be returned when you leave.",
      "## 8. Confidentiality",
      "You will keep confidential all information about the company's business, prices, suppliers, customers and accounts, both during your employment and after it ends, and will not use it for any other purpose.",
      "## 9. Other employment",
      "While employed with us you will not take up any other job or business, paid or unpaid, without the company's written permission.",
      "## 10. Notice period and termination",
      "After confirmation, either side may end the employment by giving {{notice_days}} days' notice in writing, or salary in place of notice. The company may end your employment without notice for serious misconduct, such as theft, fraud, violence, wilful damage or disclosure of confidential information, after giving you an opportunity to explain.",
      "## 11. Advances and final settlement",
      "Any advance or loan given to you will be recovered as agreed. On leaving, your final settlement will be made after you have handed over your work and all company property.",
      "## 12. Information and documents",
      "Your appointment is based on the information and documents you have given. If any of them is found to be false, the company may end your employment at once.",
      "## 13. Communication and electronic acceptance",
      "You agree to receive letters, pay slips and other official communication from the company by WhatsApp and email at the number and address you have given. Accepting a letter electronically, such as by a reply from your registered number, has the same effect as signing it.",
      "## 14. Governing law",
      "This employment is governed by the laws of India, and the courts at {{place}} alone will have jurisdiction.",
      "## 15. Entire agreement",
      "This letter and its annexures are the complete terms of your employment and replace any earlier discussion. Any change will be made in writing.",
    ].join("\n\n"),
  },
  terms_wage: {
    heading: "TERMS AND CONDITIONS OF ENGAGEMENT",
    needsAcceptance: false,
    body: [
      "## 1. Nature of engagement",
      "You are engaged as {{job_title}} on a {{employment_type}} basis. You are paid only for the time actually worked, as recorded in the attendance register.",
      "## 2. Place of work",
      "You will work at {{place}}, or at any other branch of {{employer}} that the company asks you to.",
      "## 3. Working hours and attendance",
      "Your usual working hours are {{hours}}. You will record your attendance every day by sending IN on arrival and OUT on leaving from your registered WhatsApp number, or as the company directs.",
      "## 4. Pay",
      "Your rate of pay is set out in the Pay Annexure. Pay for the month is worked out from the attendance register and paid on or before the seventh day of the following month. Employees' State Insurance and other deductions will be made as the law requires where they apply.",
      "## 5. Conduct and company property",
      "You will follow the instructions of your manager and the rules of the shop, treat customers with courtesy, and account for any cash, stock or property placed in your care. All company property must be returned when you leave.",
      "## 6. Confidentiality",
      "You will keep the company's prices, customer details and business information confidential, during your engagement and after it ends.",
      "## 7. Ending the engagement",
      "Either side may end this engagement by giving {{notice_days}} days' notice. The company may end it at once for misconduct.",
      "## 8. Communication and electronic acceptance",
      "You agree to receive letters and pay details from the company by WhatsApp and email. Accepting a letter electronically, such as by a reply from your registered number, has the same effect as signing it.",
      "## 9. Governing law",
      "This engagement is governed by the laws of India, and the courts at {{place}} alone will have jurisdiction.",
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
  if (c.employmentType === "HOURLY") return `Rate of pay: ₹${c.hourlyRate || "[hourly rate]"} for each hour worked, counted from the IN and OUT times in the attendance register, paid monthly`;
  if (c.employmentType === "DAILY_WAGE") return `Daily wage: ₹${c.dailyWage || "[daily wage]"} for each day you are present, as marked in the attendance register, paid monthly`;
  if (c.employmentType === "PART_TIME") return `Monthly salary: ₹${c.salary} for part-time work; days absent without leave are not paid`;
  return `Monthly salary: ₹${c.salary}${c.ctc ? ` (cost to company ₹${c.ctc} a year, including the company's PF and ESI share where they apply)` : ""}`;
}

const TYPE_WORDS = { FULL_TIME: "full time", PART_TIME: "part time", DAILY_WAGE: "daily wage", HOURLY: "paid by the hour" } as const;

function termLines(c: LetterContext): string[] {
  const t = c.terms;
  if (c.employmentType === "DAILY_WAGE" || c.employmentType === "HOURLY") {
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
    hourly_rate: c.hourlyRate ? `₹${c.hourlyRate}` : "",
    ctc: c.ctc ? `₹${c.ctc}` : "",
    employment_type: TYPE_WORDS[c.employmentType ?? "FULL_TIME"],
    employee_id: c.employeeCode ?? "",
    department: c.department ?? "",
    reports_to: c.reportsTo ?? "",
    offer_valid_until: c.offerValidUntil ?? "",
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
      if (line.startsWith("## ")) { flushPara(); flushList(); blocks.push({ kind: "h", text: fill(line.slice(3).trim(), values) }); }
      else if (line.startsWith("- ")) { flushPara(); list.push(line.slice(2).trim()); }
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
