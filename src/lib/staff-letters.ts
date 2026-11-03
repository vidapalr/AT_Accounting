/**
 * Wording of the staff letters (item 2.5). Pure text, no database.
 * The owner reads and approves this wording; terms (notice, probation, hours, off day, leaves)
 * are typed at the time of printing because they differ from person to person.
 */
export type LetterType = "offer" | "appointment" | "relieving" | "experience" | "payslip";

export const LETTER_TYPES: Array<{ key: LetterType; label: string }> = [
  { key: "offer", label: "Offer letter" },
  { key: "appointment", label: "Appointment letter" },
  { key: "relieving", label: "Relieving letter" },
  { key: "experience", label: "Experience letter" },
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
  terms: Terms;
};

export type Letter = { heading: string; paragraphs: string[]; points?: string[] };

const who = (c: LetterContext) => `${c.title ? c.title + " " : ""}${c.name}`;
const role = (c: LetterContext) => c.jobTitle || "[job title]";
const blank = (v: string, label: string) => (v ? v : `[${label}]`);

export function leaveWords(leaves: string): string {
  const n = Number(leaves);
  if (!leaves.trim() || Number.isNaN(n) || n <= 0) return "No paid leave is given";
  return `${n} paid leave${n === 1 ? "" : "s"} in a year`;
}

function termPoints(c: LetterContext): string[] {
  const t = c.terms;
  return [
    `Monthly salary: ₹${c.salary}`,
    `Probation: ${Number(t.probationDays) > 0 ? `${t.probationDays} days from the date of joining (can be changed by mutual agreement)` : "None"}`,
    `Working hours: ${t.hours}`,
    `Weekly off: ${t.weeklyOff}`,
    `Leave: ${leaveWords(t.leaves)}`,
    `Notice period: ${t.noticeDays} days by either side (can be changed by mutual agreement in writing)`,
  ];
}

export function buildLetter(type: Exclude<LetterType, "payslip">, c: LetterContext): Letter {
  const join = blank(c.joinedOn, "joining date");
  switch (type) {
    case "offer":
      return {
        heading: "OFFER OF EMPLOYMENT",
        paragraphs: [
          `Dear ${who(c)},`,
          `We are pleased to offer you the position of ${role(c)} at Abhiram Group (Abhiram Textiles), ${c.place}. We would like you to join us on ${join}.`,
          "The main terms of the offer are:",
        ],
        points: [
          ...termPoints(c),
          "A detailed appointment letter will be given to you when you join.",
        ],
      };
    case "appointment":
      return {
        heading: "APPOINTMENT LETTER",
        paragraphs: [
          `Dear ${who(c)},`,
          `With reference to your discussion with us, we are pleased to appoint you as ${role(c)} at Abhiram Group (Abhiram Textiles), ${c.place}, with effect from ${join}.`,
          "Your terms of employment are:",
        ],
        points: [
          ...termPoints(c),
          "You will do the work of your position honestly and follow the instructions of the management and the rules of the shop.",
          "You will keep the business information, prices, customer details and accounts of the company private, during your employment and after you leave.",
          "Any money, goods or property of the company in your care must be accounted for and handed back when you leave.",
          "Any advance given to you will be recovered as agreed, and any balance will be settled when you leave.",
        ],
      };
    case "relieving":
      return {
        heading: "RELIEVING LETTER",
        paragraphs: [
          `To whom it may concern,`,
          `This is to confirm that ${who(c)} worked with Abhiram Group (Abhiram Textiles), ${c.place}, as ${role(c)}${c.joinedOn ? ` from ${c.joinedOn}` : ""}.`,
          c.noticeGivenOn
            ? `${c.name} gave notice on ${c.noticeGivenOn} and has been relieved from the services of the company at the close of working hours on ${blank(c.leftOn, "last working day")}.`
            : `${c.name} has been relieved from the services of the company at the close of working hours on ${blank(c.leftOn, "last working day")}.`,
          "This relieving is subject to the completion of the final settlement of any dues and the handing back of all company property and records.",
          "We thank you for your service and wish you well.",
        ],
      };
    case "experience":
      return {
        heading: "EXPERIENCE CERTIFICATE",
        paragraphs: [
          `To whom it may concern,`,
          `This is to certify that ${who(c)} worked with Abhiram Group (Abhiram Textiles), ${c.place}, as ${role(c)} from ${blank(c.joinedOn, "joining date")} to ${blank(c.leftOn, "last working day")}.`,
          "This certificate is issued at the request of the employee. We wish you success in your future work.",
        ],
      };
  }
}

export type PaySlip = { month: string; paid: string; advanceTaken: string; paidOn: string; net: string };
