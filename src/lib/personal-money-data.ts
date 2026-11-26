import "server-only";
import type { RowDataPacket } from "mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";

import { toPaise } from "@/lib/reports/money";
import {
  billCycles, cardStatus, entryEffect, linkEffect, netWorth, ENTRY_WORDS, LINK_WORDS,
  type BusinessLink, type EntryKind,
} from "@/lib/personal-money";

type Q = Pool | PoolConnection;

export type AccountKind = "BANK" | "CREDIT_CARD" | "CASH" | "WALLET";
export const ACCOUNT_KIND_WORDS: Record<AccountKind, string> = { BANK: "Bank account", CREDIT_CARD: "Credit card", CASH: "Cash at home", WALLET: "Wallet / UPI" };

export type StatementLine = { date: string; label: string; amount: bigint; balance: bigint; entryId: number | null; fromBusiness: boolean };

export type PersonalAccount = {
  id: number; name: string; kind: AccountKind; bankName: string | null; last4: string | null; note: string | null;
  creditLimit: bigint | null; billDay: number | null; dueDay: number | null;
  openingBalance: bigint; openingDate: string | null;
  holder: string | null; ifsc: string | null; hasAccountNo: boolean;
  balance: bigint;
  card: (ReturnType<typeof cardStatus> & { cycles: ReturnType<typeof billCycles<StatementLine>> | null; billDue: { amount: bigint; dueOn: string } | null }) | null;
};

export type PersonalLoan = {
  id: number; direction: "GIVEN" | "TAKEN"; party: string; startDate: string; openingOutstanding: bigint;
  interestRate: string | null; emi: bigint | null; emiDay: number | null; endDate: string | null; note: string | null;
  status: "OPEN" | "CLOSED"; outstanding: bigint; interestPaid: bigint; principalBack: bigint;
};

export type PersonalInvestment = {
  id: number; kind: string; name: string; invested: bigint; currentValue: bigint | null; valueOn: string | null;
  maturityDate: string | null; note: string | null; status: "ACTIVE" | "CLOSED"; value: bigint; gain: bigint;
};

export type PersonalEntry = {
  id: number; date: string; kind: EntryKind; amount: bigint; interest: bigint; accountId: number | null; toAccountId: number | null;
  category: string | null; loanId: number | null; investmentId: number | null; note: string | null;
};

export type PersonalMoney = {
  ready: boolean;
  accounts: PersonalAccount[];
  loans: PersonalLoan[];
  investments: PersonalInvestment[];
  entries: PersonalEntry[];
  statements: Map<number, StatementLine[]>;
  totals: { accounts: bigint; cardsOwed: bigint; loansGiven: bigint; loansTaken: bigint; investments: bigint; netWorth: bigint };
  month: { income: bigint; expense: bigint; byCategory: Array<{ category: string; amount: bigint }> };
};

const EMPTY_TOTALS = { accounts: 0n, cardsOwed: 0n, loansGiven: 0n, loansTaken: 0n, investments: 0n, netWorth: 0n };
const p = (v: unknown) => toPaise(v == null ? "0" : String(v));
const pn = (v: unknown) => (v == null ? null : toPaise(String(v)));
const s = (v: unknown) => (v == null || v === "" ? null : String(v));

/** Business-linked movements on the owner's accounts (recorded once, on the business side). */
async function businessLinks(db: Q, businessId: number, ids: number[]): Promise<Array<{ accountId: number; date: string; label: string; amount: bigint }>> {
  if (ids.length === 0) return [];
  const marks = ids.map(() => "?").join(",");
  const out: Array<{ accountId: number; date: string; label: string; amount: bigint }> = [];
  const pull = async (sql: string, link: BusinessLink, detail: (r: RowDataPacket) => string) => {
    try {
      const [rows] = await db.execute<RowDataPacket[]>(sql, [businessId, ...ids]);
      for (const r of rows) {
        const d = detail(r);
        out.push({ accountId: Number(r.oid), date: String(r.d), label: d ? `${LINK_WORDS[link]}: ${d}` : LINK_WORDS[link], amount: linkEffect(link, p(r.amt)) });
      }
    } catch { /* that business table or column is not there yet */ }
  };
  await pull(
    `SELECT c.taken_owner_account_id AS oid, DATE_FORMAT(c.closing_date, '%Y-%m-%d') AS d, c.taken_out AS amt, a.cash_name
       FROM acct_cash_closings c JOIN acct_cash_accounts a ON a.id = c.cash_account_id
      WHERE c.legal_business_id = ? AND c.taken_owner_account_id IN (${marks}) AND c.taken_to = 'OWNER' AND c.taken_out > 0`,
    "SHOP_CASH_TAKEN_HOME", (r) => `from ${String(r.cash_name)}`
  );
  await pull(
    `SELECT owner_account_id AS oid, DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, amount AS amt, entry_no, direction
       FROM acct_owner_money WHERE legal_business_id = ? AND owner_account_id IN (${marks}) AND direction = 'OUT'`,
    "TAKEN_FROM_BUSINESS", (r) => String(r.entry_no)
  );
  await pull(
    `SELECT owner_account_id AS oid, DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, amount AS amt, entry_no
       FROM acct_owner_money WHERE legal_business_id = ? AND owner_account_id IN (${marks}) AND direction = 'IN'`,
    "PUT_INTO_BUSINESS", (r) => String(r.entry_no)
  );
  await pull(
    `SELECT p.owner_account_id AS oid, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, p.amount AS amt, e.description
       FROM acct_expense_payments p JOIN acct_expenses e ON e.id = p.expense_id AND e.legal_business_id = p.legal_business_id
      WHERE p.legal_business_id = ? AND p.owner_account_id IN (${marks}) AND p.payment_source = 'OWNER_PERSONAL' AND p.status = 'RECORDED'`,
    "BUSINESS_EXPENSE_PAID", (r) => String(r.description ?? "").slice(0, 60)
  );
  await pull(
    `SELECT p.owner_account_id AS oid, DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS d, p.amount AS amt, p.payment_no
       FROM acct_purchase_payments p
      WHERE p.legal_business_id = ? AND p.owner_account_id IN (${marks}) AND p.payment_source = 'OWNER_PERSONAL' AND p.status IN ('DRAFT','VERIFIED')`,
    "SUPPLIER_BILL_PAID", (r) => String(r.payment_no)
  );
  return out;
}

/** Plain description of one personal entry, as it shows on a statement. */
export function entryLabel(e: PersonalEntry, names: Map<number, string>, side: "from" | "to", loans: Map<number, string>, invs: Map<number, string>, cards = new Set<number>()): string {
  const what = e.category ? `${ENTRY_WORDS[e.kind]}: ${e.category}` : ENTRY_WORDS[e.kind];
  if (e.kind === "TRANSFER") {
    const other = side === "from" ? e.toAccountId : e.accountId;
    const cardPaid = e.toAccountId != null && cards.has(e.toAccountId);
    if (cardPaid && side === "from") return `Card bill paid: ${names.get(e.toAccountId!) ?? "card"}`;
    if (cardPaid && side === "to") return `Payment received from ${names.get(other ?? 0) ?? "another account"}`;
    return `${side === "from" ? "Moved to" : "Moved from"} ${names.get(other ?? 0) ?? "another account"}`;
  }
  if (e.loanId) return `${what} (${loans.get(e.loanId) ?? "loan"})`;
  if (e.investmentId) return `${what} (${invs.get(e.investmentId) ?? "investment"})`;
  return what;
}

/** Everything on the owner's personal side: only rows of this owner (and older owner accounts with no owner yet). */
export async function loadPersonalMoney(db: Q, businessId: number, ownerId: number, todayIso: string): Promise<PersonalMoney> {
  const empty: PersonalMoney = { ready: false, accounts: [], loans: [], investments: [], entries: [], statements: new Map(), totals: EMPTY_TOTALS, month: { income: 0n, expense: 0n, byCategory: [] } };
  let accRows: RowDataPacket[], loanRows: RowDataPacket[], invRows: RowDataPacket[], entRows: RowDataPacket[];
  try {
    const accountSql = (extra: string) =>
      `SELECT id, account_name, note, kind, bank_name, last4, credit_limit, bill_day, due_day, opening_balance,
              DATE_FORMAT(opening_date, '%Y-%m-%d') AS opening_date${extra}
         FROM acct_owner_accounts
        WHERE legal_business_id = ? AND status = 'ACTIVE' AND (owner_user_id = ? OR owner_user_id IS NULL)
        ORDER BY FIELD(kind, 'BANK', 'CASH', 'WALLET', 'CREDIT_CARD'), account_name`;
    try {
      [accRows] = await db.execute<RowDataPacket[]>(accountSql(", account_holder, ifsc, account_no_cipher IS NOT NULL AS has_no"), [businessId, ownerId]);
    } catch {
      [accRows] = await db.execute<RowDataPacket[]>(accountSql(""), [businessId, ownerId]); // 099 not run yet
    }
    [loanRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, direction, party_name, DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date, opening_outstanding, interest_rate,
              emi_amount, emi_day, DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date, note, status
         FROM acct_personal_loans WHERE legal_business_id = ? AND owner_user_id = ? ORDER BY status, start_date DESC, id DESC`,
      [businessId, ownerId]
    );
    [invRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, kind, name, opening_invested, current_value, DATE_FORMAT(value_on, '%Y-%m-%d') AS value_on,
              DATE_FORMAT(maturity_date, '%Y-%m-%d') AS maturity_date, note, status
         FROM acct_personal_investments WHERE legal_business_id = ? AND owner_user_id = ? ORDER BY status, name`,
      [businessId, ownerId]
    );
    [entRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS d, kind, amount, interest_amount, account_id, to_account_id, category, loan_id, investment_id, note
         FROM acct_personal_entries WHERE legal_business_id = ? AND owner_user_id = ? AND status = 'RECORDED'
        ORDER BY entry_date, id`,
      [businessId, ownerId]
    );
  } catch {
    return empty; // 098_personal_money has not been run yet
  }

  const entries: PersonalEntry[] = entRows.map((r) => ({
    id: Number(r.id), date: String(r.d), kind: String(r.kind) as EntryKind, amount: p(r.amount), interest: p(r.interest_amount),
    accountId: r.account_id == null ? null : Number(r.account_id), toAccountId: r.to_account_id == null ? null : Number(r.to_account_id),
    category: s(r.category), loanId: r.loan_id == null ? null : Number(r.loan_id), investmentId: r.investment_id == null ? null : Number(r.investment_id), note: s(r.note),
  }));

  const names = new Map<number, string>(accRows.map((r) => [Number(r.id), String(r.account_name)]));
  const cards = new Set<number>(accRows.filter((r) => String(r.kind) === "CREDIT_CARD").map((r) => Number(r.id)));
  const loanNames = new Map<number, string>(loanRows.map((r) => [Number(r.id), String(r.party_name)]));
  const invNames = new Map<number, string>(invRows.map((r) => [Number(r.id), String(r.name)]));

  // Statements: opening balance, then personal entries and business-linked rows, oldest first.
  const raw = new Map<number, Array<Omit<StatementLine, "balance">>>();
  for (const id of names.keys()) raw.set(id, []);
  const loanMove = new Map<number, { moved: bigint; interest: bigint; principal: bigint }>();
  const invMove = new Map<number, bigint>();
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  let income = 0n, expense = 0n;
  const cats = new Map<string, bigint>();

  for (const e of entries) {
    const fx = entryEffect(e.kind, e.amount, e.interest);
    if (e.accountId && raw.has(e.accountId)) raw.get(e.accountId)!.push({ date: e.date, label: entryLabel(e, names, "from", loanNames, invNames, cards), amount: fx.account, entryId: e.id, fromBusiness: false });
    if (e.kind === "TRANSFER" && e.toAccountId && raw.has(e.toAccountId)) raw.get(e.toAccountId)!.push({ date: e.date, label: entryLabel(e, names, "to", loanNames, invNames, cards), amount: fx.toAccount, entryId: e.id, fromBusiness: false });
    if (e.loanId) {
      const m = loanMove.get(e.loanId) ?? { moved: 0n, interest: 0n, principal: 0n };
      m.moved += fx.loan;
      if (fx.loan < 0n) { m.principal += -fx.loan; m.interest += e.interest; }
      loanMove.set(e.loanId, m);
    }
    if (e.investmentId) invMove.set(e.investmentId, (invMove.get(e.investmentId) ?? 0n) + fx.invested);
    if (e.date >= monthStart && e.date <= todayIso) {
      income += fx.income; expense += fx.expense;
      if (fx.expense > 0n) {
        const c = e.kind === "LOAN_PAID" ? "Loan interest" : e.category ?? "Other";
        cats.set(c, (cats.get(c) ?? 0n) + fx.expense);
      }
    }
  }
  for (const l of await businessLinks(db, businessId, [...names.keys()])) {
    raw.get(l.accountId)?.push({ date: l.date, label: l.label, amount: l.amount, entryId: null, fromBusiness: true });
  }

  const statements = new Map<number, StatementLine[]>();
  const accounts: PersonalAccount[] = accRows.map((r) => {
    const id = Number(r.id);
    const opening = p(r.opening_balance);
    let bal = opening;
    const lines = (raw.get(id) ?? []).sort((a, b) => a.date.localeCompare(b.date)).map((l) => { bal += l.amount; return { ...l, balance: bal }; });
    const kind = (String(r.kind ?? "BANK") as AccountKind);
    const limit = pn(r.credit_limit);
    const billDay = r.bill_day == null ? null : Number(r.bill_day);
    const dueDay = r.due_day == null ? null : Number(r.due_day);
    const cycles = kind === "CREDIT_CARD" && billDay
      ? billCycles({ lines, opening, openingDate: s(r.opening_date), billDay, dueDay, today: todayIso })
      : null;
    const lastBill = cycles?.past[0];
    statements.set(id, lines.reverse());
    return {
      id, name: String(r.account_name), kind, bankName: s(r.bank_name), last4: s(r.last4), note: s(r.note),
      creditLimit: limit, billDay: r.bill_day == null ? null : Number(r.bill_day), dueDay: r.due_day == null ? null : Number(r.due_day),
      openingBalance: opening, openingDate: s(r.opening_date), balance: bal,
      holder: s(r.account_holder), ifsc: s(r.ifsc), hasAccountNo: Number(r.has_no ?? 0) === 1,
      card: kind === "CREDIT_CARD" ? {
        ...cardStatus(bal, limit, dueDay, todayIso), cycles,
        billDue: lastBill && lastBill.stillDue > 0n ? { amount: lastBill.stillDue, dueOn: lastBill.dueOn } : null,
      } : null,
    };
  });

  const loans: PersonalLoan[] = loanRows.map((r) => {
    const id = Number(r.id);
    const m = loanMove.get(id) ?? { moved: 0n, interest: 0n, principal: 0n };
    return {
      id, direction: String(r.direction) as "GIVEN" | "TAKEN", party: String(r.party_name), startDate: String(r.start_date),
      openingOutstanding: p(r.opening_outstanding), interestRate: s(r.interest_rate), emi: pn(r.emi_amount),
      emiDay: r.emi_day == null ? null : Number(r.emi_day), endDate: s(r.end_date), note: s(r.note), status: String(r.status) as "OPEN" | "CLOSED",
      outstanding: p(r.opening_outstanding) + m.moved, interestPaid: m.interest, principalBack: m.principal,
    };
  });

  const investments: PersonalInvestment[] = invRows.map((r) => {
    const id = Number(r.id);
    const invested = p(r.opening_invested) + (invMove.get(id) ?? 0n);
    const current = pn(r.current_value);
    const value = String(r.status) === "CLOSED" ? 0n : current ?? invested;
    return {
      id, kind: String(r.kind), name: String(r.name), invested, currentValue: current, valueOn: s(r.value_on),
      maturityDate: s(r.maturity_date), note: s(r.note), status: String(r.status) as "ACTIVE" | "CLOSED",
      value, gain: String(r.status) === "CLOSED" ? 0n : value - invested,
    };
  });

  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
  const totals = {
    accounts: sum(accounts.map((a) => a.balance)),
    cardsOwed: sum(accounts.map((a) => a.card?.owed ?? 0n)),
    loansGiven: sum(loans.filter((l) => l.direction === "GIVEN" && l.outstanding > 0n).map((l) => l.outstanding)),
    loansTaken: sum(loans.filter((l) => l.direction === "TAKEN" && l.outstanding > 0n).map((l) => l.outstanding)),
    investments: sum(investments.map((i) => i.value)),
    netWorth: 0n,
  };
  totals.netWorth = netWorth({ accounts: totals.accounts, loansGiven: totals.loansGiven, loansTaken: totals.loansTaken, investments: totals.investments });

  return {
    ready: true, accounts, loans, investments, entries: [...entries].reverse(), statements, totals,
    month: { income, expense, byCategory: [...cats].map(([category, amount]) => ({ category, amount })).sort((a, b) => (b.amount > a.amount ? 1 : -1)) },
  };
}
