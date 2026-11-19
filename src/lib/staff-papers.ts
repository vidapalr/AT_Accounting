/**
 * The papers kept for a member of staff: what kinds there are, which folder each sits in, and which
 * ones every person should have. Pure (no database), so it can be tested on its own.
 */
export type PaperFolder = "PERSONAL" | "OFFICIAL";

export type PaperKind = {
  key: string;
  label: string;
  folder: PaperFolder;
  /** Every person should have this on file; the record says what is missing. */
  expected?: boolean;
};

export const PAPER_KINDS: PaperKind[] = [
  { key: "AADHAAR", label: "Aadhaar card", folder: "PERSONAL", expected: true },
  { key: "PAN", label: "PAN card", folder: "PERSONAL", expected: true },
  { key: "PHOTO", label: "Photo", folder: "PERSONAL" },
  { key: "ADDRESS_PROOF", label: "Address proof", folder: "PERSONAL" },
  { key: "BANK_PROOF", label: "Bank passbook or cheque", folder: "PERSONAL" },
  { key: "QUALIFICATION", label: "Certificate or marksheet", folder: "PERSONAL" },
  { key: "OTHER_PERSONAL", label: "Other personal paper", folder: "PERSONAL" },
  { key: "OFFER_LETTER", label: "Offer letter", folder: "OFFICIAL" },
  { key: "APPOINTMENT_LETTER", label: "Appointment (joining) letter", folder: "OFFICIAL", expected: true },
  { key: "ENGAGEMENT_LETTER", label: "Engagement letter", folder: "OFFICIAL" },
  { key: "CONFIRMATION_LETTER", label: "Confirmation after probation", folder: "OFFICIAL" },
  { key: "INCREMENT_LETTER", label: "Salary increase letter", folder: "OFFICIAL" },
  { key: "WARNING_LETTER", label: "Warning letter", folder: "OFFICIAL" },
  { key: "RESIGNATION", label: "Resignation", folder: "OFFICIAL" },
  { key: "RELIEVING_LETTER", label: "Relieving letter", folder: "OFFICIAL" },
  { key: "EXPERIENCE_LETTER", label: "Experience certificate", folder: "OFFICIAL" },
  { key: "PAYSLIP", label: "Pay slip", folder: "OFFICIAL" },
  { key: "AGREEMENT", label: "Agreement", folder: "OFFICIAL" },
  { key: "OTHER_OFFICIAL", label: "Other official paper", folder: "OFFICIAL" },
];

export const isPaperKind = (v: string): boolean => PAPER_KINDS.some((k) => k.key === v);
export const paperLabel = (v: string): string => PAPER_KINDS.find((k) => k.key === v)?.label ?? v;
export const folderOf = (v: string): PaperFolder => PAPER_KINDS.find((k) => k.key === v)?.folder ?? "PERSONAL";

/** The letter kind that goes with a type of work, for the "papers still to do" list. */
export function letterKindFor(employmentType: string | null | undefined): string {
  return employmentType === "DAILY_WAGE" || employmentType === "HOURLY" ? "ENGAGEMENT_LETTER" : "APPOINTMENT_LETTER";
}

/** Which papers a person still has to give, in the order to ask for them. */
export function missingPapers(have: string[], employmentType?: string | null): PaperKind[] {
  const letter = letterKindFor(employmentType);
  // Only the letter that fits this type of work is asked for, not both kinds.
  const wanted = PAPER_KINDS.filter((k) => (k.expected && !k.key.endsWith("_LETTER")) || k.key === letter);
  const held = new Set(have);
  // An appointment letter and an engagement letter stand in for each other.
  const paperOnFile = (k: PaperKind) =>
    held.has(k.key) || (k.key === "APPOINTMENT_LETTER" && held.has("ENGAGEMENT_LETTER")) || (k.key === "ENGAGEMENT_LETTER" && held.has("APPOINTMENT_LETTER"));
  return wanted.filter((k) => !paperOnFile(k));
}

/** The last four digits of an Aadhaar number, or null when it does not look like one. */
export function aadhaarLast4(typed: string): string | null {
  const digits = typed.replace(/\D/g, "");
  return digits.length === 12 ? digits.slice(-4) : null;
}

/** Papers the person is asked to accept when they are sent (an I accept button on WhatsApp). */
export const ACCEPT_KINDS: ReadonlySet<string> = new Set(["OFFER_LETTER", "APPOINTMENT_LETTER", "ENGAGEMENT_LETTER", "WARNING_LETTER", "AGREEMENT"]);
