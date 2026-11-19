import "server-only";

import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { businessSettings } from "@/lib/business-settings";
import { isMissingTable } from "@/lib/db-errors";
import { readStaffFile, saveStaffFile } from "@/lib/document-storage";
import { mailConfigured, sendMail } from "@/lib/mailer";
import { normalizePhone } from "@/lib/whatsapp/core";
import { sendWhatsAppDocumentTemplate, sendWhatsAppDocumentWithButtons, uploadWhatsAppMedia, type SendResult } from "@/lib/bot/send";
import { acceptPayload, acceptanceRecord, LETTER_TEMPLATE_KEYS, parseAcceptance } from "@/lib/letter-accept";
import { letterPackToPdf } from "@/lib/letter-pack-pdf";
import { ACCEPT_KINDS, paperLabel } from "@/lib/staff-papers";
import { branchAddress } from "@/lib/staff-letter-data";

type Row = RowDataPacket & Record<string, string | number | null>;


const istNow = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
/** The database keeps UTC; times are read as Indian time "YYYY-MM-DD HH:MM" (as elsewhere in the app). */
const IST_SQL = (col: string) => `DATE_FORMAT(DATE_ADD(${col}, INTERVAL 330 MINUTE), '%Y-%m-%d %H:%i')`;
const ist = (v: unknown) => (v ? String(v) : "");
const dmyTime = (s: string) => `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)} ${s.slice(11, 16)}`;
const fileName = (label: string) => `${label.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "letter"}.pdf`;

/** Plain words for the WhatsApp errors a person sending a letter can meet. */
function sendProblem(r: SendResult): string {
  if (r.code === 131047 || /24 hours|re-engage/i.test(r.reason ?? "")) {
    return "WhatsApp only allows this within 24 hours of the person's last message to the shop number. Ask them to send any message (for example Hi) and send again, or set up the letter template on Letter templates.";
  }
  if (r.code === 132001 || /template.*(not exist|does not exist)/i.test(r.reason ?? "")) return "The WhatsApp letter template is not approved yet, or its name or language is wrong (see Letter templates).";
  return r.reason ?? "WhatsApp did not accept it.";
}

export type SendOutcome = { whatsapp: { ok: boolean; text: string }; email: { ok: boolean; text: string } | null };

/**
 * Sends one paper from a person's folder to their WhatsApp (and email when one is saved).
 * Letters to accept carry an I accept button; the reply is recorded by acceptLetterOnWhatsApp.
 */
export async function sendStaffPaper(businessId: number, userId: number, employeeId: number, documentId: number): Promise<SendOutcome> {
  const [docs] = await db.query<Row[]>(
    `SELECT d.id, d.kind, d.label, d.storage_key, d.mime_type, e.full_name, e.whatsapp_number, e.phone, e.email
       FROM acct_employee_documents d JOIN acct_employees e ON e.id = d.employee_id AND e.legal_business_id = d.legal_business_id
      WHERE d.legal_business_id = ? AND d.id = ? AND d.employee_id = ? AND d.status = 'ACTIVE'`,
    [businessId, documentId, employeeId]
  );
  const d = docs[0];
  if (!d) return { whatsapp: { ok: false, text: "That paper was not found." }, email: null };
  if (!String(d.mime_type).includes("pdf")) return { whatsapp: { ok: false, text: "Only PDF letters can be sent." }, email: null };

  const brand = await getBrand(businessId);
  const file = await readStaffFile(String(d.storage_key));
  const sha = createHash("sha256").update(file).digest("hex");
  const label = String(d.label || paperLabel(String(d.kind)));
  const needsAccept = ACCEPT_KINDS.has(String(d.kind));
  const person = String(d.full_name);
  const employer = brand.shopName !== brand.groupName ? `${brand.groupName} (${brand.shopName})` : brand.groupName;

  const record = async (channel: "WHATSAPP" | "EMAIL", to: string): Promise<number> => {
    const [r] = await db.execute<ResultSetHeader>(
      `INSERT INTO acct_letter_sends (legal_business_id, employee_id, document_id, channel, sent_to, needs_acceptance, status, file_sha256, sent_by)
       VALUES (?, ?, ?, ?, ?, ?, 'SENT', ?, ?)`,
      [businessId, employeeId, documentId, channel, to, needsAccept && channel === "WHATSAPP" ? 1 : 0, sha, userId]
    );
    return r.insertId;
  };
  const finish = (id: number, ok: boolean, waId: string | null, error: string | null) =>
    db.execute(`UPDATE acct_letter_sends SET status = ?, wa_message_id = ?, error_text = ? WHERE id = ?`, [ok ? "SENT" : "FAILED", waId, error?.slice(0, 300) ?? null, id]);

  // WhatsApp
  let whatsapp: SendOutcome["whatsapp"];
  const phone = normalizePhone(String(d.whatsapp_number || d.phone || ""));
  if (!phone) {
    whatsapp = { ok: false, text: "No WhatsApp number on the staff record. Add it under Type of work and attendance." };
  } else {
    let sendId: number;
    try {
      sendId = await record("WHATSAPP", phone);
    } catch (e) {
      if (isMissingTable(e)) return { whatsapp: { ok: false, text: "Run migration 096 in phpMyAdmin first." }, email: null };
      throw e;
    }
    const media = await uploadWhatsAppMedia(file, "application/pdf", fileName(label));
    if (!media.ok) {
      await finish(sendId, false, null, media.reason);
      whatsapp = { ok: false, text: media.reason };
    } else {
      const tpl = await businessSettings(businessId, [LETTER_TEMPLATE_KEYS.name, LETTER_TEMPLATE_KEYS.language]);
      // A warning is acknowledged (Received); every other letter to accept gets I accept.
      const isWarning = String(d.kind) === "WARNING_LETTER";
      const button = isWarning ? "Received" : "I accept";
      const body = needsAccept
        ? `Dear ${person}, please find your ${label} from ${employer}. Please read all the pages and tap ${button} to confirm.`
        : `Dear ${person}, please find your ${label} from ${employer}.`;
      const r = tpl[LETTER_TEMPLATE_KEYS.name]
        ? await sendWhatsAppDocumentTemplate(phone.slice(1), tpl[LETTER_TEMPLATE_KEYS.name], tpl[LETTER_TEMPLATE_KEYS.language] || "en", media.id, fileName(label),
            [person, label, employer], needsAccept ? acceptPayload(sendId) : undefined)
        : await sendWhatsAppDocumentWithButtons(phone.slice(1), media.id, fileName(label), body, needsAccept ? [{ id: acceptPayload(sendId), title: button }] : []);
      await finish(sendId, r.ok, r.id ?? null, r.ok ? null : sendProblem(r));
      whatsapp = r.ok
        ? { ok: true, text: `Sent on WhatsApp to ${phone}${needsAccept ? ". It is marked accepted when they tap I accept." : "."}` }
        : { ok: false, text: sendProblem(r) };
    }
  }

  // Email, when the person has one and the mailbox is set up
  let email: SendOutcome["email"] = null;
  const to = String(d.email ?? "").trim();
  if (to) {
    if (!mailConfigured()) {
      email = { ok: false, text: "Email is not set up on the server (SMTP settings), so no email was sent." };
    } else {
      const id = await record("EMAIL", to);
      const ok = await sendMail(to, {
        subject: `${label} – ${employer}`,
        text: `Dear ${person},\n\nPlease find attached your ${label} from ${employer}.${needsAccept ? "\n\nPlease read all the pages. To accept, tap I accept on the WhatsApp message we have sent you, or reply I accept there." : ""}\n\nRegards,\n${employer}`,
      }, [{ filename: fileName(label), content: file, contentType: "application/pdf" }]);
      await finish(id, ok, null, ok ? null : "The email could not be sent.");
      email = ok ? { ok: true, text: `Emailed to ${to}.` } : { ok: false, text: "The email could not be sent." };
    }
  }

  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, ?, 'STAFF_PAPER_SENT', 'EMPLOYEE', ?, ?)`,
    [businessId, userId, employeeId, JSON.stringify({ documentId, whatsapp: whatsapp.ok, email: email?.ok ?? null })]
  );
  return { whatsapp, email };
}

/**
 * A WhatsApp reply that accepts a letter: the I accept button, or "I accept" typed from the number the
 * letter was sent to. Marks it accepted, keeps an accepted copy (the exact letter sent plus an acceptance
 * record page) in the person's folder, and returns the reply to send. Null when the message is not an acceptance.
 */
export async function acceptLetterOnWhatsApp(businessId: number, fromRaw: string, replyId: string | null, text: string | null, messageId: string | null): Promise<string | null> {
  const parsed = parseAcceptance(replyId, text);
  if (!parsed) return null;
  const phone = normalizePhone(fromRaw.startsWith("+") ? fromRaw : `+${fromRaw}`);
  if (!phone) return null;

  let rows: Row[];
  try {
    [rows] = await db.query<Row[]>(
      parsed.sendId
        ? `SELECT *, ${IST_SQL("sent_at")} AS sent_ist, ${IST_SQL("accepted_at")} AS accepted_ist FROM acct_letter_sends WHERE legal_business_id = ? AND id = ? AND channel = 'WHATSAPP' AND needs_acceptance = 1`
        : `SELECT *, ${IST_SQL("sent_at")} AS sent_ist, ${IST_SQL("accepted_at")} AS accepted_ist FROM acct_letter_sends WHERE legal_business_id = ? AND sent_to = ? AND channel = 'WHATSAPP' AND needs_acceptance = 1
             AND status = 'SENT' AND sent_at > NOW() - INTERVAL 60 DAY ORDER BY id DESC LIMIT 1`,
      [businessId, parsed.sendId ?? phone]
    );
  } catch (e) {
    if (isMissingTable(e)) return null;
    throw e;
  }
  const s = rows[0];
  if (!s) return parsed.sendId ? "We could not find that letter. Please contact the office." : null; // a plain "accept" with nothing waiting: let the chatbot answer
  if (String(s.sent_to) !== phone) return "This letter was sent to a different number, so it can only be accepted from that number.";
  if (s.status === "ACCEPTED") return `You have already accepted this letter on ${dmyTime(ist(s.accepted_ist))}. Thank you.`;
  if (s.status !== "SENT") return null;

  const [claimed] = await db.execute<ResultSetHeader>(
    `UPDATE acct_letter_sends SET status = 'ACCEPTED', accepted_at = NOW(), accepted_from = ?, accepted_words = ?, accepted_message_id = ?
      WHERE id = ? AND status = 'SENT'`,
    [phone, parsed.words.slice(0, 100), messageId?.slice(0, 100) ?? null, Number(s.id)]
  );
  if (claimed.affectedRows !== 1) return "Thank you. Your acceptance is already recorded.";

  const [info] = await db.query<Row[]>(
    `SELECT d.kind, d.label, d.storage_key, e.full_name, e.employee_code, e.branch_id
       FROM acct_employee_documents d JOIN acct_employees e ON e.id = d.employee_id AND e.legal_business_id = d.legal_business_id
      WHERE d.legal_business_id = ? AND d.id = ?`,
    [businessId, Number(s.document_id)]
  );
  const d = info[0];
  const label = d ? String(d.label || paperLabel(String(d.kind))) : "letter";
  const acceptedAt = istNow();
  if (d) {
    try {
      const brand = await getBrand(businessId);
      const employer = brand.shopName !== brand.groupName ? `${brand.groupName} (${brand.shopName})` : brand.groupName;
      const { address } = await branchAddress(businessId, d.branch_id, brand.place);
      const record = acceptanceRecord({
        employer, person: String(d.full_name), employeeCode: String(d.employee_code ?? ""), letter: label,
        sentAt: dmyTime(ist(s.sent_ist)), sentTo: String(s.sent_to), acceptedAt: dmyTime(acceptedAt), acceptedFrom: phone,
        words: parsed.words, messageId: messageId ?? "", sha256: String(s.file_sha256 ?? ""),
      });
      const page = await letterPackToPdf({
        ref: `HR/ACC/${String(d.employee_code ?? "NEW")}/${acceptedAt.slice(0, 10).replaceAll("-", "")}`,
        date: dmyTime(acceptedAt).slice(0, 10), to: [], subject: `Electronic acceptance of ${label}`, employer,
        personName: String(d.full_name), needsAcceptance: false,
        pages: [{ title: "ELECTRONIC ACCEPTANCE RECORD", blocks: [
          { kind: "p", text: `${String(d.full_name)} accepted the letter on the previous pages by a reply on WhatsApp from their registered number. Under the terms of the letter, acceptance in this way has the same effect as signing it.` },
          { kind: "facts", rows: record },
          { kind: "note", text: "The fingerprint identifies the exact file that was sent: any change to the letter would give a different fingerprint." },
        ] }],
      }, brand, address);
      const merged = await PDFDocument.load(await readStaffFile(String(d.storage_key)));
      const extra = await PDFDocument.load(page);
      for (const p of await merged.copyPages(extra, extra.getPageIndices())) merged.addPage(p);
      const bytes = Buffer.from(await merged.save());
      const key = await saveStaffFile(businessId, Number(s.employee_id), bytes, "application/pdf");
      const [saved] = await db.execute<ResultSetHeader>(
        `INSERT INTO acct_employee_documents (legal_business_id, employee_id, folder, kind, label, storage_key, mime_type, size_bytes, belongs_to, uploaded_by)
         VALUES (?, ?, 'OFFICIAL', ?, ?, ?, 'application/pdf', ?, ?, NULL)`,
        [businessId, Number(s.employee_id), String(d.kind), `${label} (accepted copy)`.slice(0, 150), key, bytes.length, acceptedAt.slice(0, 10)]
      );
      await db.execute(`UPDATE acct_letter_sends SET accepted_document_id = ? WHERE id = ?`, [saved.insertId, Number(s.id)]);
    } catch (error) {
      console.error("Accepted copy could not be made:", error); // the acceptance itself is recorded
    }
  }
  await db.execute(
    `INSERT INTO acct_audit_events (legal_business_id, actor_user_id, action, subject_type, subject_id, details_json)
     VALUES (?, NULL, 'STAFF_LETTER_ACCEPTED', 'EMPLOYEE', ?, ?)`,
    [businessId, Number(s.employee_id), JSON.stringify({ sendId: Number(s.id), from: phone })]
  );
  return `Thank you, ${d ? String(d.full_name) : ""}. Your acceptance of the ${label} is recorded on ${dmyTime(acceptedAt)}.`.replace(", .", ".");
}

/** The latest WhatsApp send of each paper of one person (for the Sent / Accepted badges). */
export async function letterSendStatus(businessId: number, employeeId: number): Promise<Map<number, { status: string; at: string; acceptedAt: string; error: string }>> {
  try {
    const [rows] = await db.query<Row[]>(
      `SELECT s.document_id, s.status, ${IST_SQL("s.sent_at")} AS sent_at, ${IST_SQL("s.accepted_at")} AS accepted_at, s.error_text FROM acct_letter_sends s
        WHERE s.legal_business_id = ? AND s.employee_id = ? AND s.channel = 'WHATSAPP'
          AND s.id = (SELECT MAX(x.id) FROM acct_letter_sends x WHERE x.legal_business_id = s.legal_business_id AND x.document_id = s.document_id AND x.channel = 'WHATSAPP')`,
      [businessId, employeeId]
    );
    return new Map(rows.map((r) => [Number(r.document_id), { status: String(r.status), at: dmyTime(ist(r.sent_at)), acceptedAt: r.accepted_at ? dmyTime(ist(r.accepted_at)) : "", error: String(r.error_text ?? "") }]));
  } catch (e) {
    if (isMissingTable(e)) return new Map();
    throw e;
  }
}
