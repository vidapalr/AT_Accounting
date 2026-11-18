"use server";

/** Income tax and year-end pack: settings, challans, the tax statement, papers, loans, PAN. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess, requireGroupOwner } from "@/lib/auth";
import { isMissingTable } from "@/lib/db-errors";
import { saveBusinessSettings } from "@/lib/business-settings";
import { nextCode } from "@/lib/codes";
import { parseRupees, todayInIndia } from "@/lib/reports/money";
import { detectDocumentType, MAX_DOCUMENT_SIZE, savePrivateDocument } from "@/lib/document-storage";
import { parseStatement } from "@/lib/tax/form168";
import { ASSET_BLOCKS } from "@/lib/tax/it-depreciation";
import { isPan } from "@/lib/tax/year-figures";

const BASE = "/accounting/tax";
const text = (f: FormData, n: string) => String(f.get(n) ?? "").trim();
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const go = (page: string, params: Record<string, string>): never => redirect(`${page}?${new URLSearchParams(params).toString()}`);
const rupees = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
const NOT_READY = "Run migration 089 in phpMyAdmin first (see the delivery note).";

/** The tax year sent by the form (2026 = 2026-27), or null. */
function yearOf(form: FormData): number | null {
  const y = Number(text(form, "year"));
  return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null;
}

/** Runs a write on a migration-089 table and turns "table missing" into a plain message. */
async function on089<T>(page: string, year: number, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isMissingTable(error)) go(page, { year: String(year), error: NOT_READY });
    throw error;
  }
}

/** Kind of business, regime and the owner's estimate for the year. Owner only. */
export async function saveTaxSettingsAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const year = yearOf(form);
  if (!year) go(BASE, { error: "Choose a tax year." });
  const estimateText = text(form, "estimate");
  const estimate = estimateText === "" ? null : parseRupees(estimateText);
  if (estimateText !== "" && estimate === null) go(BASE, { year: String(year), error: "Write the expected profit as a number, e.g. 850000." });
  const scheme = text(form, "tax_company_scheme");
  await saveBusinessSettings(user.legal_business_id, {
    tax_regime: text(form, "tax_regime") === "OLD" ? "OLD" : "NEW",
    tax_presumptive: form.get("tax_presumptive") === "1" ? "1" : "0",
    tax_audited: form.get("tax_audited") === "1" ? "1" : "0",
    tax_company_scheme: scheme === "25" || scheme === "30" ? scheme : "22",
    [`tax_estimate_${year}`]: estimate === null ? "" : rupees(estimate),
    [`tax_optout_ack_${year}`]: text(form, "optout_ack").slice(0, 40),
  }, user.id);
  revalidatePath(BASE);
  go(BASE, { year: String(year), saved: "Saved. The advance tax plan below uses these answers." });
}

/** Save an uploaded PDF or photo as a tax paper. Returns the new document id, or a message. */
async function storePaper(businessId: number, userId: number, year: number, file: File, kind: string, title: string, links: { loanId?: number | null; challanId?: number | null } = {}): Promise<number | string> {
  if (file.size === 0) return "Choose a file.";
  if (file.size > MAX_DOCUMENT_SIZE) return "The file is larger than 5 MB.";
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectDocumentType(buffer);
  if (!mime) return "Upload a PDF, JPG or PNG file.";
  const key = await savePrivateDocument(buffer, mime);
  const [r] = await db.execute(
    `INSERT INTO acct_tax_documents (legal_business_id, tax_year, doc_kind, title, storage_key, mime_type, file_size, loan_id, challan_id, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [businessId, year, kind, title.slice(0, 150) || file.name.slice(0, 150), key, mime, buffer.length, links.loanId ?? null, links.challanId ?? null, userId]
  );
  return Number((r as { insertId: number }).insertId);
}

const CHALLANS = `${BASE}/challans`;

/** Record an advance or self-assessment tax payment (with the challan receipt if there is one). */
export async function addChallanAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form);
  if (!year) go(CHALLANS, { error: "Choose a tax year." });
  const kind = ["ADVANCE", "SELF_ASSESSMENT", "OTHER"].includes(text(form, "kind")) ? text(form, "kind") : "ADVANCE";
  const paidOn = text(form, "paid_on");
  const amount = parseRupees(text(form, "amount"));
  const bsr = text(form, "bsr_code");
  const serial = text(form, "challan_serial").replace(/\D/g, "");
  const back = { year: String(year) };
  if (!isDate(paidOn)) go(CHALLANS, { ...back, error: "Write the date the tax was paid." });
  if (paidOn > todayInIndia()) go(CHALLANS, { ...back, error: "The date paid cannot be in the future." });
  if (!amount || amount <= 0n) go(CHALLANS, { ...back, error: "Write the amount paid." });
  if (bsr && !/^\d{7}$/.test(bsr)) go(CHALLANS, { ...back, error: "The BSR code is 7 numbers, printed on the challan." });
  await on089(CHALLANS, year!, async () => {
    const [r] = await db.execute(
      `INSERT INTO acct_tax_challans (legal_business_id, tax_year, kind, paid_on, amount, bsr_code, challan_serial, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, year, kind, paidOn, rupees(amount!), bsr || null, serial || null, text(form, "note").slice(0, 250) || null, user.id]
    );
    const file = form.get("receipt");
    if (file instanceof File && file.size > 0) {
      const id = Number((r as { insertId: number }).insertId);
      const saved = await storePaper(user.legal_business_id, user.id, year!, file, "CHALLAN", `Challan ${paidOn} Rs ${rupees(amount!)}`, { challanId: id });
      if (typeof saved === "string") go(CHALLANS, { ...back, error: `Payment saved, but the receipt was not: ${saved}` });
    }
  });
  revalidatePath(BASE);
  go(CHALLANS, { ...back, saved: "Tax payment saved." });
}

/** Take back a challan entered by mistake (it stays in the history as cancelled). */
export async function cancelChallanAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form) ?? 0;
  await on089(CHALLANS, year, () =>
    db.execute(`UPDATE acct_tax_challans SET status = 'CANCELLED' WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, Number(text(form, "id"))])
  );
  revalidatePath(BASE);
  go(CHALLANS, { year: String(year), saved: "Payment removed." });
}

const STATEMENT = `${BASE}/statement`;

/** Read the downloaded tax statement text file (or pasted text) and keep its lines for the year. */
export async function readStatementAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form);
  if (!year) go(STATEMENT, { error: "Choose a tax year." });
  const back = { year: String(year) };
  let raw = text(form, "pasted");
  const file = form.get("statement_file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_DOCUMENT_SIZE) go(STATEMENT, { ...back, error: "The file is larger than 5 MB." });
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") go(STATEMENT, { ...back, error: "That is a PDF. Download the text (.txt) version to read it here, and upload the PDF under 'Tax papers' to keep a copy." });
    raw = buffer.toString("utf8");
  }
  if (!raw) go(STATEMENT, { ...back, error: "Choose the downloaded file, or paste its text." });
  const parsed = parseStatement(raw);
  if (parsed.tds.length === 0 && parsed.taxPaid.length === 0) go(STATEMENT, { ...back, error: "No TDS or tax-paid lines were found. Use the text file downloaded from the tax site (fields separated by ^)." });
  await on089(STATEMENT, year!, async () => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(`DELETE FROM acct_tax_statement_lines WHERE legal_business_id = ? AND tax_year = ?`, [user.legal_business_id, year]);
      for (const t of parsed.tds) {
        await conn.execute(
          `INSERT INTO acct_tax_statement_lines (legal_business_id, tax_year, line_kind, party_name, tan, amount_paid, tax_amount, read_by) VALUES (?, ?, 'TDS', ?, ?, ?, ?, ?)`,
          [user.legal_business_id, year, t.deductor.slice(0, 200), t.tan, rupees(t.amountPaid), rupees(t.tds), user.id]
        );
      }
      for (const p of parsed.taxPaid) {
        await conn.execute(
          `INSERT INTO acct_tax_statement_lines (legal_business_id, tax_year, line_kind, tax_amount, bsr_code, challan_serial, deposit_date, minor_head, read_by) VALUES (?, ?, 'TAX_PAID', ?, ?, ?, ?, ?, ?)`,
          [user.legal_business_id, year, rupees(p.amount), p.bsrCode, p.serial.slice(0, 10), p.date, p.minorHead, user.id]
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  });
  revalidatePath(BASE);
  go(STATEMENT, { ...back, saved: `Read ${parsed.tds.length} TDS line(s) and ${parsed.taxPaid.length} tax payment(s).` });
}

const DOC_KINDS = ["STATEMENT", "AIS", "TIS", "TDS_CERTIFICATE", "CHALLAN", "LOAN_STATEMENT", "INTEREST_CERTIFICATE", "REGIME_OPT_OUT", "RETURN", "OTHER"];

/** Keep a tax paper (AIS, TIS, certificate, loan statement...) for the year. */
export async function uploadTaxPaperAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form);
  const page = text(form, "back") === "loans" ? `${BASE}/loans` : STATEMENT;
  if (!year) go(page, { error: "Choose a tax year." });
  const kind = DOC_KINDS.includes(text(form, "kind")) ? text(form, "kind") : "OTHER";
  const file = form.get("paper");
  if (!(file instanceof File)) go(page, { year: String(year), error: "Choose a file." });
  const loanId = Number(text(form, "loan_id")) || null;
  const saved = await on089(page, year!, () => storePaper(user.legal_business_id, user.id, year!, file as File, kind, text(form, "title"), { loanId }));
  if (typeof saved === "string") go(page, { year: String(year), error: saved });
  revalidatePath(BASE);
  go(page, { year: String(year), saved: "Paper saved. It goes into the download for your accountant." });
}

export async function removeTaxPaperAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form) ?? 0;
  const page = text(form, "back") === "loans" ? `${BASE}/loans` : STATEMENT;
  await on089(page, year, () =>
    db.execute(`UPDATE acct_tax_documents SET status = 'REMOVED' WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, Number(text(form, "id"))])
  );
  revalidatePath(BASE);
  go(page, { year: String(year), saved: "Paper removed from the list." });
}

const LOANS = `${BASE}/loans`;
const LOAN_KINDS = ["TERM", "VEHICLE", "OVERDRAFT", "GOLD", "OTHER"];

/** Add a loan, or change one (id given). The loan number is given automatically. */
export async function saveLoanAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form) ?? 0;
  const back = { year: String(year) };
  const id = Number(text(form, "id")) || 0;
  const lender = text(form, "lender_name").slice(0, 150);
  const kind = LOAN_KINDS.includes(text(form, "loan_kind")) ? text(form, "loan_kind") : "TERM";
  const takenOn = text(form, "taken_on");
  const principal = parseRupees(text(form, "principal"));
  const rate = Number(text(form, "rate"));
  const months = Number(text(form, "tenure_months") || "0");
  const firstMonth = text(form, "first_emi_month");
  const emiText = text(form, "emi");
  const emi = emiText ? parseRupees(emiText) : null;
  if (!lender) go(LOANS, { ...back, error: "Write the lender's name (bank or person)." });
  if (!isDate(takenOn)) go(LOANS, { ...back, error: "Write the date the loan was taken." });
  if (!principal || principal <= 0n) go(LOANS, { ...back, error: "Write the loan amount." });
  if (!Number.isFinite(rate) || rate < 0 || rate > 60) go(LOANS, { ...back, error: "Write the yearly interest rate, e.g. 10.5." });
  if (!Number.isInteger(months) || months < 0 || months > 600) go(LOANS, { ...back, error: "Write the number of months, e.g. 60." });
  if (firstMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth)) go(LOANS, { ...back, error: "Choose the month of the first instalment." });
  if (emiText && (emi === null || emi <= 0n)) go(LOANS, { ...back, error: "Write the monthly instalment as a number, or leave it empty." });
  const values = [lender, kind, text(form, "lender_account_no").slice(0, 40) || null, takenOn, rupees(principal!), Math.round(rate * 100), months, firstMonth || null, emi ? rupees(emi) : null, text(form, "note").slice(0, 250) || null];
  await on089(LOANS, year, async () => {
    if (id) {
      await db.execute(
        `UPDATE acct_loans SET lender_name = ?, loan_kind = ?, lender_account_no = ?, taken_on = ?, principal = ?, rate_bps = ?, tenure_months = ?, first_emi_month = ?, emi = ?, note = ?, status = ?
          WHERE legal_business_id = ? AND id = ?`,
        [...values, text(form, "status") === "CLOSED" ? "CLOSED" : "OPEN", user.legal_business_id, id]
      );
    } else {
      const code = await nextCode(db, { table: "acct_loans", column: "loan_code", prefix: "LN-", width: 4, where: "legal_business_id = ?", params: [user.legal_business_id] });
      await db.execute(
        `INSERT INTO acct_loans (legal_business_id, loan_code, lender_name, loan_kind, lender_account_no, taken_on, principal, rate_bps, tenure_months, first_emi_month, emi, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.legal_business_id, code, ...values, user.id]
      );
    }
  });
  revalidatePath(LOANS);
  go(LOANS, { ...back, saved: id ? "Loan changed." : "Loan added." });
}

/** The lender's figures for the year, typed from the interest certificate. */
export async function saveLoanYearAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form);
  if (!year) go(LOANS, { error: "Choose a tax year." });
  const loanId = Number(text(form, "loan_id"));
  const read = (n: string) => {
    const t = text(form, n);
    if (!t) return null;
    const p = parseRupees(t);
    if (p === null) go(LOANS, { year: String(year), error: "Write the certificate amounts as numbers." });
    return rupees(p!);
  };
  const interest = read("certified_interest");
  const principal = read("certified_principal");
  const closing = read("certified_closing");
  await on089(LOANS, year!, async () => {
    const [own] = await db.query<RowDataPacket[]>(`SELECT id FROM acct_loans WHERE legal_business_id = ? AND id = ?`, [user.legal_business_id, loanId]);
    if (!own.length) go(LOANS, { year: String(year), error: "Loan not found." });
    await db.execute(
      `INSERT INTO acct_loan_year_figures (loan_id, legal_business_id, tax_year, certified_interest, certified_principal, certified_closing, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE certified_interest = VALUES(certified_interest), certified_principal = VALUES(certified_principal),
                               certified_closing = VALUES(certified_closing), updated_by = VALUES(updated_by)`,
      [loanId, user.legal_business_id, year, interest, principal, closing, user.id]
    );
  });
  revalidatePath(LOANS);
  go(LOANS, { year: String(year), saved: "Certificate figures saved." });
}

const DEPRECIATION = `${BASE}/depreciation`;

/** Tax depreciation rates and the opening written-down values from the last return. Owner only. */
export async function saveItDepreciationAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const year = yearOf(form) ?? 0;
  const back = { year: String(year) };
  const values: Record<string, string> = {};
  for (const b of ASSET_BLOCKS) {
    const r = text(form, `rate_${b}`);
    const n = Number(r);
    if (r && (!Number.isFinite(n) || n < 0 || n > 100)) go(DEPRECIATION, { ...back, error: "Each rate must be a percentage from 0 to 100." });
    values[`it_rate_${b}`] = r;
    const w = text(form, `wdv_${b}`);
    const p = w ? parseRupees(w) : null;
    if (w && (p === null || p < 0n)) go(DEPRECIATION, { ...back, error: "Write each opening value as a number." });
    values[`it_wdv_${b}`] = p === null ? "" : rupees(p);
  }
  const wdvYear = text(form, "it_wdv_year");
  if (wdvYear && !/^20\d{2}$/.test(wdvYear)) go(DEPRECIATION, { ...back, error: "Choose the first tax year for the opening values." });
  values.it_wdv_year = wdvYear;
  await saveBusinessSettings(user.legal_business_id, values, user.id);
  revalidatePath(DEPRECIATION);
  go(DEPRECIATION, { ...back, saved: "Saved." });
}

const FIGURES = `${BASE}/year-figures`;

/** Add a PAN to a customer or supplier (shown on the year-end lists). */
export async function savePartyPanAction(form: FormData): Promise<void> {
  const user = await requireAccess("tax");
  const year = yearOf(form) ?? 0;
  const pan = text(form, "pan").toUpperCase();
  if (!isPan(pan)) go(FIGURES, { year: String(year), error: "A PAN is 5 letters, 4 numbers and 1 letter, e.g. ABCDE1234F." });
  const table = text(form, "party") === "supplier" ? "acct_suppliers" : "acct_customers";
  await on089(FIGURES, year, () => db.execute(`UPDATE ${table} SET pan = ? WHERE legal_business_id = ? AND id = ?`, [pan, user.legal_business_id, Number(text(form, "id"))]));
  revalidatePath(FIGURES);
  go(FIGURES, { year: String(year), saved: "PAN saved." });
}
