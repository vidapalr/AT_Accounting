/**
 * Accepting a letter by WhatsApp: pure rules, easy to test.
 * The I accept button carries LACCEPT:<send id>. A typed reply such as "I accept" from the same number
 * accepts that person's latest letter waiting for acceptance.
 */
/** Settings keys: the approved WhatsApp template for sending letters (name and language). */
export const LETTER_TEMPLATE_KEYS = { name: "wa_letter_template", language: "wa_letter_template_lang" } as const;

/** The wording to submit to Meta for that template (Utility; header: Document; one quick-reply button). */
export const LETTER_TEMPLATE_TEXT = {
  body: "Dear {{1}}, please find attached your {{2}} from {{3}}. Please read all the pages and tap I accept below to confirm.",
  button: "I accept",
  sample: ["Asha", "Letter of appointment", "Acme Group"],
} as const;

export const acceptPayload = (sendId: number) => `LACCEPT:${sendId}`;

const ACCEPT_WORDS = new Set(["accept", "accepted", "i accept", "i accept it", "yes i accept", "i agree", "agree", "agreed", "i accept the offer", "i accept the terms", "received", "i have received", "i have received it"]);

export function parseAcceptance(replyId: string | null | undefined, text: string | null | undefined): { sendId: number | null; words: string } | null {
  const id = /^LACCEPT:(\d{1,18})$/.exec(String(replyId ?? "").trim());
  const words = String(text ?? "").trim().slice(0, 100);
  if (id) return { sendId: Number(id[1]), words: words || "I accept" };
  const plain = words.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  return ACCEPT_WORDS.has(plain) ? { sendId: null, words } : null;
}

/** The lines of the acceptance record page added to the accepted copy. */
export function acceptanceRecord(r: {
  employer: string; person: string; employeeCode: string; letter: string; sentAt: string; sentTo: string;
  acceptedAt: string; acceptedFrom: string; words: string; messageId: string; sha256: string;
}): Array<[string, string]> {
  return [
    ["Company", r.employer],
    ["Employee", `${r.person}${r.employeeCode ? ` (${r.employeeCode})` : ""}`],
    ["Document", r.letter],
    ["Sent on WhatsApp", `${r.sentAt} to ${r.sentTo}`],
    ["Accepted", r.acceptedAt],
    ["Accepted from", r.acceptedFrom],
    ["Reply", r.words],
    ["WhatsApp message id", r.messageId || "—"],
    ["Fingerprint of the letter sent (SHA-256)", r.sha256],
  ];
}
