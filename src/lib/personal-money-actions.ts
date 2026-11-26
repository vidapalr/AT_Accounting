"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { isDate, parseRupees, todayInIndia } from "@/lib/reports/money";
import { rupeesText } from "@/lib/sale-payments";
import type { EntryKind } from "@/lib/personal-money";
import { bankFromIfsc, IFSC_PATTERN, normalIfsc } from "@/lib/ifsc";
import { openSecret, sealSecret, secretsReady } from "@/lib/secret-box";

// Personal money is private to the owner who records it: every query is scoped to owner_user_id,
// and nothing is written to the shared audit log (others with audit access would see it).

const PAGE = "/accounting/my-money";
const KINDS = new Set(["BANK", "CREDIT_CARD", "CASH", "WALLET"]);
const ENTRY_KINDS = new Set<EntryKind>(["INCOME", "EXPENSE", "TRANSFER", "LOAN_GIVEN", "LOAN_TAKEN", "LOAN_RECEIVED", "LOAN_PAID", "INVEST", "REDEEM"]);
const INV_KINDS = new Set(["FD", "RD", "GOLD", "SHARES", "MUTUAL_FUND", "CHIT", "PROPERTY", "INSURANCE", "OTHER"]);

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const num = (f: FormData, k: string) => { const n = Number(String(f.get(k) ?? "").trim()); return Number.isInteger(n) && n > 0 ? n : null; };
const day = (f: FormData, k: string) => { const n = num(f, k); return n && n <= 31 ? n : null; };
const back = (tab: string, extra = "") => `${PAGE}?tab=${tab}${extra}`;
function fail(tab: string, message: string, extra = ""): never { redirect(`${back(tab, extra)}&error=${encodeURIComponent(message)}`); }
function done(tab: string, message: string, extra = ""): never { revalidatePath(PAGE); redirect(`${back(tab, extra)}&saved=${encodeURIComponent(message)}`); }
const missing = (e: unknown) => ["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(String((e as { code?: string }).code));
const NEEDS = "Run the new database steps (098_personal_money and 099_personal_bank_details) in phpMyAdmin first.";
const ACCOUNT_NO_PURPOSE = "personal-account-no";

async function ownsAccount(businessId: number, ownerId: number, id: number | null): Promise<boolean> {
  if (!id) return false;
  const [r] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM acct_owner_accounts WHERE id = ? AND legal_business_id = ? AND status = 'ACTIVE' AND (owner_user_id = ? OR owner_user_id IS NULL)`,
    [id, businessId, ownerId]
  );
  return r.length > 0;
}
async function owns(table: "acct_personal_loans" | "acct_personal_investments", businessId: number, ownerId: number, id: number | null): Promise<boolean> {
  if (!id) return false;
  const [r] = await db.execute<RowDataPacket[]>(`SELECT id FROM ${table} WHERE id = ? AND legal_business_id = ? AND owner_user_id = ?`, [id, businessId, ownerId]);
  return r.length > 0;
}
async function insertEntry(o: { businessId: number; ownerId: number; date: string; kind: EntryKind; amount: bigint; interest?: bigint; accountId: number | null; toAccountId?: number | null; category?: string | null; loanId?: number | null; investmentId?: number | null; note?: string | null }) {
  await db.execute(
    `INSERT INTO acct_personal_entries (legal_business_id, owner_user_id, entry_date, kind, amount, interest_amount, account_id, to_account_id, category, loan_id, investment_id, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [o.businessId, o.ownerId, o.date, o.kind, rupeesText(o.amount), rupeesText(o.interest ?? 0n), o.accountId, o.toAccountId ?? null, o.category || null, o.loanId ?? null, o.investmentId ?? null, o.note || null]
  );
}

/** Adds or changes a bank account, credit card, cash or wallet. */
export async function savePersonalAccountAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const tab = "accounts";
  const id = num(form, "id");
  const kind = text(form, "kind", 20);
  const card = kind === "CREDIT_CARD";
  const bank = kind === "BANK";
  const name = text(form, "account_name", 100);
  const amountText = text(form, card ? "owed_today" : "opening_balance", 20);
  const amount = amountText ? parseRupees(amountText) : 0n;
  const openingDate = text(form, "opening_date", 10) || todayInIndia();
  const limitText = text(form, "credit_limit", 20);
  const limit = limitText ? parseRupees(limitText) : null;
  const billDay = day(form, "bill_day");
  const dueDay = day(form, "due_day");
  const ifsc = normalIfsc(text(form, "ifsc", 20));
  const holder = text(form, "account_holder", 150);
  const accountNoText = text(form, "account_no", 40).replace(/[\s-]/g, "");
  let last4 = text(form, "last4", 4);

  if (name.length < 2) fail(tab, "Give it a name, for example: My HDFC savings, or SBI credit card.");
  if (!KINDS.has(kind)) fail(tab, "Choose what kind of account it is.");
  if (amount === null) fail(tab, "Type amounts as numbers, for example 25000.");
  if (!isDate(openingDate) || openingDate > todayInIndia()) fail(tab, "Choose the date of the balance (today or earlier).");
  if (card) {
    if (limit === null || limit <= 0n) fail(tab, "Type the card limit, for example 200000.");
    if (!billDay || !dueDay) fail(tab, "Choose the bill date and the payment due date of the card (day of the month).");
    if (amount < 0n) fail(tab, "Type what you owe on the card today as a plain amount (0 if nothing).");
  }
  if (bank) {
    if (ifsc && !IFSC_PATTERN.test(ifsc)) fail(tab, "IFSC is 11 letters and numbers, for example SBIN0001234.");
    if (accountNoText && !/^\d{6,24}$/.test(accountNoText)) fail(tab, "Account number must be 6 to 24 digits.");
    if (accountNoText) last4 = accountNoText.slice(-4);
    if (accountNoText && !secretsReady()) fail(tab, "The server has no encryption key, so the account number cannot be saved. Leave it empty for now.");
  }
  if (last4 && !/^\d{4}$/.test(last4)) fail(tab, "Last 4 digits must be 4 numbers.");

  // A card balance is kept below zero while money is owed.
  const opening = card ? -amount : amount;
  const openingText = (opening < 0n ? "-" : "") + rupeesText(opening < 0n ? -opening : opening);
  const bankName = text(form, "bank_name", 120) || (bank && ifsc ? bankFromIfsc(ifsc) : null);
  const base = [name, kind, bankName || null, last4 || null, card && limit !== null ? rupeesText(limit) : null,
    card ? billDay : null, card ? dueDay : null, openingText, openingDate, text(form, "note", 300) || null];
  const bankCols = [bank ? holder || null : null, bank ? ifsc || null : null];
  const cipher = bank && accountNoText ? sealSecret(accountNoText, ACCOUNT_NO_PURPOSE) : null;

  try {
    if (id) {
      if (!(await ownsAccount(user.legal_business_id, user.id, id))) fail(tab, "That account was not found.");
      await db.execute(
        `UPDATE acct_owner_accounts SET account_name = ?, kind = ?, bank_name = ?, last4 = ?, credit_limit = ?, bill_day = ?, due_day = ?,
                opening_balance = ?, opening_date = ?, note = ?, owner_user_id = ? WHERE id = ? AND legal_business_id = ?`,
        [...base, user.id, id, user.legal_business_id]
      );
      await db.execute(`UPDATE acct_owner_accounts SET account_holder = ?, ifsc = ? WHERE id = ? AND legal_business_id = ?`, [...bankCols, id, user.legal_business_id]);
      // A blank account number keeps the one saved; a card or cash never keeps one.
      if (cipher || !bank) await db.execute(`UPDATE acct_owner_accounts SET account_no_cipher = ? WHERE id = ? AND legal_business_id = ?`, [cipher, id, user.legal_business_id]);
    } else {
      await db.execute(
        `INSERT INTO acct_owner_accounts (legal_business_id, account_name, kind, bank_name, last4, credit_limit, bill_day, due_day, opening_balance, opening_date, note,
                account_holder, ifsc, account_no_cipher, owner_user_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [user.legal_business_id, ...base, ...bankCols, cipher, user.id, user.id]
      );
    }
  } catch (e) {
    unstable_rethrow(e);
    fail(tab, (e as { code?: string }).code === "ER_DUP_ENTRY" ? "You already have an account with that name." : missing(e) ? NEEDS : "It could not be saved. Nothing was changed.");
  }
  done(tab, `${id ? "Saved" : "Added"} ${name}.`, id ? `&account=${id}` : "");
}

export type RevealState = { id: number; password?: string; error?: string } | null;

/** Shows the full account number to the owner for a short time. */
export async function revealPersonalAccountNoAction(_prev: RevealState, form: FormData): Promise<RevealState> {
  const user = await requireGroupOwner();
  const id = Number(form.get("id"));
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT account_no_cipher FROM acct_owner_accounts WHERE id = ? AND legal_business_id = ? AND (owner_user_id = ? OR owner_user_id IS NULL)`,
    [id, user.legal_business_id, user.id]
  );
  const cipher = rows[0]?.account_no_cipher as Buffer | null | undefined;
  if (!cipher) return { id, error: "No account number saved." };
  try {
    return { id, password: openSecret(Buffer.from(cipher), ACCOUNT_NO_PURPOSE) };
  } catch {
    return { id, error: "It could not be opened (the server key may have changed)." };
  }
}

/** Money in, spent, moved between your accounts, or a payment against a loan or investment. */
export async function addPersonalEntryAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const kind = text(form, "kind", 20) as EntryKind;
  const tab = text(form, "tab", 20) || "overview";
  const date = text(form, "entry_date", 10) || todayInIndia();
  const amount = parseRupees(text(form, "amount", 20));
  const interest = text(form, "interest_amount", 20) ? parseRupees(text(form, "interest_amount", 20)) : 0n;
  const accountId = num(form, "account_id");
  const toAccountId = num(form, "to_account_id");
  const loanId = num(form, "loan_id");
  const investmentId = num(form, "investment_id");
  const stay = num(form, "account") ? `&account=${num(form, "account")}` : "";
  if (!ENTRY_KINDS.has(kind)) fail(tab, "Choose what this money is.", stay);
  if (!isDate(date) || date > todayInIndia()) fail(tab, "Choose a date (not in the future).", stay);
  if (amount === null || amount <= 0n) fail(tab, "Type the amount, for example 1500.", stay);
  if (interest === null || interest < 0n || interest > amount) fail(tab, "Interest must be a number no bigger than the amount.", stay);
  try {
    if (!(await ownsAccount(user.legal_business_id, user.id, accountId))) fail(tab, "Choose which account the money went from or came into.", stay);
    if (kind === "TRANSFER") {
      if (!(await ownsAccount(user.legal_business_id, user.id, toAccountId)) || toAccountId === accountId) fail(tab, "Choose a different account to move the money to.", stay);
    }
    const needsLoan = kind === "LOAN_RECEIVED" || kind === "LOAN_PAID";
    if (needsLoan && !(await owns("acct_personal_loans", user.legal_business_id, user.id, loanId))) fail(tab, "Choose the loan.", stay);
    const needsInv = kind === "INVEST" || kind === "REDEEM";
    if (needsInv && !(await owns("acct_personal_investments", user.legal_business_id, user.id, investmentId))) fail(tab, "Choose the investment.", stay);
    await insertEntry({
      businessId: user.legal_business_id, ownerId: user.id, date, kind, amount, interest: needsLoan ? interest : 0n,
      accountId, toAccountId: kind === "TRANSFER" ? toAccountId : null,
      category: kind === "INCOME" || kind === "EXPENSE" ? text(form, "category", 60) || null : null,
      loanId: needsLoan ? loanId : null, investmentId: needsInv ? investmentId : null, note: text(form, "note", 300),
    });
  } catch (e) {
    unstable_rethrow(e);
    fail(tab, missing(e) ? NEEDS : "It could not be saved. Nothing was changed.", stay);
  }
  done(tab, "Saved.", stay);
}

/** Removes a wrong entry (kept, marked as removed, so balances recalculate). */
export async function voidPersonalEntryAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const id = num(form, "id");
  const tab = text(form, "tab", 20) || "overview";
  const extra = num(form, "account") ? `&account=${num(form, "account")}` : "";
  if (!id) fail(tab, "That entry was not found.", extra);
  await db.execute(`UPDATE acct_personal_entries SET status = 'VOID' WHERE id = ? AND legal_business_id = ? AND owner_user_id = ?`, [id, user.legal_business_id, user.id]);
  done(tab, "Entry removed. Balances are recalculated.", extra);
}

/** A loan you gave or took. If the money moves now, pick the account; for an older loan, type what is still owed. */
export async function addPersonalLoanAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const tab = "loans";
  const direction = text(form, "direction", 10);
  const party = text(form, "party_name", 150);
  const start = text(form, "start_date", 10) || todayInIndia();
  const amount = parseRupees(text(form, "amount", 20));
  const accountId = num(form, "account_id");
  const emi = text(form, "emi_amount", 20) ? parseRupees(text(form, "emi_amount", 20)) : null;
  const rate = text(form, "interest_rate", 8);
  const end = text(form, "end_date", 10);
  if (direction !== "GIVEN" && direction !== "TAKEN") fail(tab, "Choose whether you lent or borrowed.");
  if (party.length < 2) fail(tab, "Type who it is with (a person, bank or lender).");
  if (!isDate(start)) fail(tab, "Choose the start date.");
  if (amount === null || amount <= 0n) fail(tab, "Type the amount, for example 200000.");
  if (rate && !/^\d{1,2}(\.\d{1,2})?$/.test(rate)) fail(tab, "Interest rate is a number like 12 or 10.5 (% a year).");
  if (end && !isDate(end)) fail(tab, "Choose a proper end date, or leave it empty.");
  if (text(form, "emi_amount", 20) && (emi === null || emi <= 0n)) fail(tab, "EMI must be a number.");
  try {
    if (accountId && !(await ownsAccount(user.legal_business_id, user.id, accountId))) fail(tab, "That account was not found.");
    const [res] = await db.execute(
      `INSERT INTO acct_personal_loans (legal_business_id, owner_user_id, direction, party_name, start_date, opening_outstanding, interest_rate, emi_amount, emi_day, end_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, user.id, direction, party, start, accountId ? "0.00" : rupeesText(amount), rate || null,
        emi === null ? null : rupeesText(emi), day(form, "emi_day"), end || null, text(form, "note", 300) || null]
    );
    const loanId = Number((res as { insertId: number }).insertId);
    if (accountId) {
      await insertEntry({ businessId: user.legal_business_id, ownerId: user.id, date: start, kind: direction === "GIVEN" ? "LOAN_GIVEN" : "LOAN_TAKEN", amount, accountId, loanId });
    }
  } catch (e) {
    unstable_rethrow(e);
    fail(tab, missing(e) ? NEEDS : "It could not be saved. Nothing was changed.");
  }
  done(tab, `Loan with ${party} added.`);
}

/** Marks a loan closed, or opens it again. */
export async function setPersonalLoanStatusAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const id = num(form, "id");
  const status = text(form, "status", 10) === "CLOSED" ? "CLOSED" : "OPEN";
  await db.execute(`UPDATE acct_personal_loans SET status = ? WHERE id = ? AND legal_business_id = ? AND owner_user_id = ?`, [status, id, user.legal_business_id, user.id]);
  done("loans", status === "CLOSED" ? "Loan closed." : "Loan opened again.");
}

/** An FD, gold, shares, chit... If you pay for it now, pick the account; for an older one, type what you had put in. */
export async function addPersonalInvestmentAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const tab = "investments";
  const kind = text(form, "kind", 20);
  const name = text(form, "name", 150);
  const date = text(form, "start_date", 10) || todayInIndia();
  const amount = parseRupees(text(form, "amount", 20));
  const accountId = num(form, "account_id");
  const current = text(form, "current_value", 20) ? parseRupees(text(form, "current_value", 20)) : null;
  const maturity = text(form, "maturity_date", 10);
  if (!INV_KINDS.has(kind)) fail(tab, "Choose the kind of investment.");
  if (name.length < 2) fail(tab, "Give it a name, for example: SBI FD 2027, or Gold chain.");
  if (!isDate(date)) fail(tab, "Choose the date.");
  if (amount === null || amount < 0n) fail(tab, "Type the amount put in, for example 100000.");
  if (text(form, "current_value", 20) && current === null) fail(tab, "Today's value must be a number, or leave it empty.");
  if (maturity && !isDate(maturity)) fail(tab, "Choose a proper maturity date, or leave it empty.");
  try {
    if (accountId && !(await ownsAccount(user.legal_business_id, user.id, accountId))) fail(tab, "That account was not found.");
    const [res] = await db.execute(
      `INSERT INTO acct_personal_investments (legal_business_id, owner_user_id, kind, name, opening_invested, current_value, value_on, maturity_date, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user.legal_business_id, user.id, kind, name, accountId ? "0.00" : rupeesText(amount), current === null ? null : rupeesText(current),
        current === null ? null : todayInIndia(), maturity || null, text(form, "note", 300) || null]
    );
    const investmentId = Number((res as { insertId: number }).insertId);
    if (accountId && amount > 0n) await insertEntry({ businessId: user.legal_business_id, ownerId: user.id, date, kind: "INVEST", amount, accountId, investmentId });
  } catch (e) {
    unstable_rethrow(e);
    fail(tab, missing(e) ? NEEDS : "It could not be saved. Nothing was changed.");
  }
  done(tab, `${name} added.`);
}

/** Today's value of an investment (gold rate, share price...), or closes it. */
export async function updatePersonalInvestmentAction(form: FormData): Promise<void> {
  const user = await requireGroupOwner();
  const id = num(form, "id");
  if (form.get("status")) {
    const status = text(form, "status", 10) === "CLOSED" ? "CLOSED" : "ACTIVE";
    await db.execute(`UPDATE acct_personal_investments SET status = ? WHERE id = ? AND legal_business_id = ? AND owner_user_id = ?`, [status, id, user.legal_business_id, user.id]);
    done("investments", status === "CLOSED" ? "Investment closed." : "Investment opened again.");
  }
  const value = parseRupees(text(form, "current_value", 20));
  if (value === null || value < 0n) fail("investments", "Type today's value as a number.");
  await db.execute(
    `UPDATE acct_personal_investments SET current_value = ?, value_on = ? WHERE id = ? AND legal_business_id = ? AND owner_user_id = ?`,
    [rupeesText(value), todayInIndia(), id, user.legal_business_id, user.id]
  );
  done("investments", "Value updated.");
}
