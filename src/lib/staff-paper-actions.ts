"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import { isMissingColumn, isMissingTable } from "@/lib/db-errors";
import { detectDocumentType, deleteStaffFile, MAX_DOCUMENT_SIZE, saveStaffFile } from "@/lib/document-storage";
import { aadhaarLast4, folderOf, isPaperKind, paperLabel } from "@/lib/staff-papers";
import { loadStaffLetter, type LetterQuery } from "@/lib/staff-letter-data";
import { paperToPdf } from "@/lib/paper-pdf";
import { getBrand } from "@/lib/brand";

type Row = RowDataPacket & Record<string, string | number | null>;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function go(page: string, params: Record<string, string>): never {
  const q = new URLSearchParams(params).toString();
  redirect(q ? `${page}?${q}` : page);
}
const isRedirect = (e: unknown) => typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");

/** Keeps one paper in a person's folder (Aadhaar, PAN, a letter, a pay slip...). */
export async function addStaffPaperAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const id = Number(text(form, "employee_id"));
  const page = `/accounting/salaries/${id}`;
  const kind = text(form, "kind");
  const file = form.get("file");
  if (!isPaperKind(kind)) go(page, { error: "Choose what the paper is." });
  if (!(file instanceof File) || file.size === 0) go(page, { error: "Choose a file to keep (PDF, JPG or PNG)." });
  if (file.size > MAX_DOCUMENT_SIZE) go(page, { error: "The file is larger than 5 MB. Take a smaller photo or scan." });
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectDocumentType(buffer);
  if (!mime) go(page, { error: "Only a PDF, JPG or PNG can be kept." });

  const [owns] = await db.query<Row[]>(`SELECT id FROM acct_employees WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, id]);
  if (owns.length !== 1) go(page, { error: "That person is not in this company." });

  const key = await saveStaffFile(user.legal_business_id, id, buffer, mime);
  try {
    await db.execute<ResultSetHeader>(
      `INSERT INTO acct_employee_documents (legal_business_id, employee_id, folder, kind, label, storage_key, mime_type, size_bytes, belongs_to, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, id, folderOf(kind), kind, text(form, "label").slice(0, 150) || null, key, mime, buffer.length,
       /^\d{4}-\d{2}(-\d{2})?$/.test(text(form, "belongs_to")) ? text(form, "belongs_to") : null, user.id]
    );
  } catch (error) {
    await deleteStaffFile(key).catch(() => {});
    if (isMissingTable(error)) go(page, { error: "Run migration 093 in phpMyAdmin first." });
    throw error;
  }
  revalidatePath(page);
  go(page, { saved: `${paperLabel(kind)} kept in this person's folder.` });
}

/** Takes a paper out of the folder: the row is marked removed and the file is deleted. */
export async function removeStaffPaperAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const id = Number(text(form, "employee_id"));
  const page = `/accounting/salaries/${id}`;
  const paperId = Number(text(form, "paper_id"));
  const [rows] = await db.query<Row[]>(
    `SELECT storage_key, kind FROM acct_employee_documents
      WHERE legal_business_id = ? AND employee_id = ? AND id = ? AND status = 'ACTIVE'`,
    [user.legal_business_id, id, paperId]
  ).catch(() => [[] as Row[]]);
  if (rows.length !== 1) go(page, { error: "That paper is not in this folder." });
  await db.query(`UPDATE acct_employee_documents SET status = 'REMOVED' WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, paperId]);
  await deleteStaffFile(String(rows[0].storage_key)).catch(() => {});
  revalidatePath(page);
  go(page, { saved: `${paperLabel(String(rows[0].kind))} removed from the folder.` });
}

/** Aadhaar: only the last four digits are kept, so the number cannot be taken from the database. */
export async function saveAadhaarAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const id = Number(text(form, "employee_id"));
  const page = `/accounting/salaries/${id}`;
  const typed = text(form, "aadhaar");
  const last4 = typed ? aadhaarLast4(typed) : "";
  if (typed && last4 === null) go(page, { error: "An Aadhaar number is 12 digits." });
  try {
    await db.query(`UPDATE acct_employees SET aadhaar_last4 = ? WHERE legal_business_id = ? AND id = ?`, [last4 || null, user.legal_business_id, id]);
  } catch (error) {
    if (isRedirect(error)) throw error;
    if (!isMissingColumn(error)) throw error;
    go(page, { error: "Run migration 093 in phpMyAdmin first." });
  }
  revalidatePath(page);
  go(page, { saved: last4 ? `Aadhaar ending ${last4} saved. Keep the card itself in the folder below.` : "Aadhaar cleared." });
}

/** The kind of paper a letter is filed as. */
const LETTER_PAPER: Record<string, string> = {
  offer: "OFFER_LETTER",
  appointment: "APPOINTMENT_LETTER",
  part_time_appointment: "APPOINTMENT_LETTER",
  daily_wage_engagement: "ENGAGEMENT_LETTER",
  hourly_engagement: "ENGAGEMENT_LETTER",
  confirmation: "CONFIRMATION_LETTER",
  increment: "INCREMENT_LETTER",
  salary_certificate: "OTHER_OFFICIAL",
  resignation_acceptance: "RESIGNATION",
  relieving: "RELIEVING_LETTER",
  experience: "EXPERIENCE_LETTER",
  warning: "WARNING_LETTER",
};

/**
 * Makes the letter shown on screen into a PDF and keeps it in the person's folder, so the signed
 * paper and the app agree. The letter is built again from the same choices, never from the browser.
 */
export async function keepLetterAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const id = Number(text(form, "employee_id"));
  const q: LetterQuery = {
    type: text(form, "type"), title: text(form, "title"), notice: text(form, "notice"), probation: text(form, "probation"),
    hours: text(form, "hours"), off: text(form, "off"), leaves: text(form, "leaves"), month: text(form, "month"),
    new_salary: text(form, "new_salary"), effective: text(form, "effective"), reason: text(form, "reason"),
  };
  const back = `/accounting/salaries/${id}/letters`;
  const query = Object.fromEntries(Object.entries(q).filter(([, v]) => v)) as Record<string, string>;
  const loaded = await loadStaffLetter(user.legal_business_id, id, q);
  if (!loaded || !loaded.letter) go(back, { ...query, error: "Choose a letter (a pay slip is kept from the Payroll page)." });

  const { letter, ctx } = loaded;
  const brand = await getBrand(user.legal_business_id);
  const body: string[] = [];
  for (const block of letter.blocks) {
    if (block.kind === "p") body.push(block.text);
    else for (const item of block.items) body.push(`- ${item}`);
  }
  if (letter.needsAcceptance) body.push("---", "Accepted by:", "", "Signature: ____________________    Date: ____________");
  const pdf = await paperToPdf({
    letterhead: [ctx.employer, loaded.address, [brand.shopPhone, brand.email].filter(Boolean).join(" · ")].filter(Boolean),
    title: letter.heading,
    body,
    footer: [`Place: ${ctx.place}`, `Date: ${ctx.letterDate}`, "", `For ${ctx.employer}`],
  });
  const kind = LETTER_PAPER[loaded.type] ?? "OTHER_OFFICIAL";
  const key = await saveStaffFile(user.legal_business_id, id, pdf, "application/pdf");
  try {
    await db.execute(
      `INSERT INTO acct_employee_documents (legal_business_id, employee_id, folder, kind, label, storage_key, mime_type, size_bytes, belongs_to, uploaded_by)
       VALUES (?, ?, 'OFFICIAL', ?, ?, ?, 'application/pdf', ?, ?, ?)`,
      [user.legal_business_id, id, kind, letter.heading.slice(0, 150), key, pdf.length, ctx.letterDate.split("-").reverse().join("-"), user.id]
    );
  } catch (error) {
    await deleteStaffFile(key).catch(() => {});
    if (isMissingTable(error)) go(back, { ...query, error: "Run migration 093 in phpMyAdmin first." });
    throw error;
  }
  revalidatePath(`/accounting/salaries/${id}`);
  go(back, { ...query, saved: `${letter.heading} kept in ${ctx.name}'s folder.` });
}

/** Keeps the pay slip of one month in the person's folder as a PDF. */
export async function keepPayslipAction(form: FormData): Promise<void> {
  const user = await requireAccess("salary");
  const id = Number(text(form, "employee_id"));
  const month = text(form, "month");
  const back = `/accounting/salaries/${id}/letters`;
  const query: Record<string, string> = { type: "payslip", month };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) go(back, { ...query, error: "Choose the month." });

  const [rows] = await db.query<Row[]>(
    `SELECT p.*, e.full_name, e.job_title, e.pan, e.uan, e.esi_number
       FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.employee_id = ? AND p.salary_month = ?`,
    [user.legal_business_id, id, month]
  ).catch(() => [[] as Row[]]);
  if (rows.length !== 1) go(back, { ...query, error: "No pay slip for that month yet. Work it out on the Payroll page first." });
  const p = rows[0];

  const brand = await getBrand(user.legal_business_id);
  const money = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const detail = JSON.parse(String(p.detail_json ?? "{}")) as { earnings?: Array<{ name: string; earned: number }>; notes?: string[] };
  const cuts: Array<[string, unknown]> = ([
    ["Provident fund (PF)", p.emp_pf], ["ESI", p.emp_esi], ["Professional tax", p.emp_pt],
    ["Income tax (TDS)", p.emp_tds], ["Advance taken back", p.advance_deducted],
  ] as Array<[string, unknown]>).filter(([, v]) => Number(v) > 0);

  const body = [
    `Name: ${String(p.full_name)}    Job: ${String(p.job_title ?? "—")}`,
    `Month: ${month}    Days paid: ${Number(p.paid_days)} of ${Number(p.days_in_month)}`,
    `PAN: ${String(p.pan ?? "—")}    UAN: ${String(p.uan ?? "—")}    ESI: ${String(p.esi_number ?? "—")}`,
    "---",
    "Earnings:",
    ...(detail.earnings ?? []).map((x) => `- ${x.name}: ${money(x.earned)}`),
    `Gross pay: ${money(p.gross)}`,
    "---",
    "Taken off:",
    ...(cuts.length ? cuts.map(([k, v]) => `- ${k}: ${money(v)}`) : ["- Nothing"]),
    `Net pay: ${money(p.net_pay)}`,
    ...(detail.notes?.length ? ["---", ...detail.notes.map((n) => `- ${n}`)] : []),
  ];
  const pdf = await paperToPdf({
    letterhead: [brand.groupName, brand.place, [brand.shopPhone, brand.email].filter(Boolean).join(" · ")].filter(Boolean),
    title: `PAY SLIP ${month}`,
    body,
    footer: [`Status: ${String(p.status) === "PAID" ? "Paid" : "Draft (not paid yet)"}`, "", `For ${brand.groupName}`],
  });
  const key = await saveStaffFile(user.legal_business_id, id, pdf, "application/pdf");
  try {
    await db.execute(
      `INSERT INTO acct_employee_documents (legal_business_id, employee_id, folder, kind, label, storage_key, mime_type, size_bytes, belongs_to, uploaded_by)
       VALUES (?, ?, 'OFFICIAL', 'PAYSLIP', ?, ?, 'application/pdf', ?, ?, ?)`,
      [user.legal_business_id, id, `Pay slip ${month}`, key, pdf.length, month, user.id]
    );
  } catch (error) {
    await deleteStaffFile(key).catch(() => {});
    if (isMissingTable(error)) go(back, { ...query, error: "Run migration 093 in phpMyAdmin first." });
    throw error;
  }
  revalidatePath(`/accounting/salaries/${id}`);
  go(back, { ...query, saved: `Pay slip for ${month} kept in ${String(p.full_name)}'s folder.` });
}
