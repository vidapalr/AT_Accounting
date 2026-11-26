/**
 * The owner's personal money: pure rules, money in paise (bigint). Easy to test.
 *
 * An account's balance = opening balance + every entry's effect on it. For a credit card the balance
 * is below zero while money is owed on it (spending on the card takes it further below zero;
 * paying the card bill is a transfer into it).
 */

export type EntryKind = "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_GIVEN" | "LOAN_TAKEN" | "LOAN_RECEIVED" | "LOAN_PAID" | "INVEST" | "REDEEM";

/** Money that moved between your accounts and the business (recorded once, on the business side). */
export type BusinessLink = "PUT_INTO_BUSINESS" | "TAKEN_FROM_BUSINESS" | "BUSINESS_EXPENSE_PAID" | "SUPPLIER_BILL_PAID" | "SHOP_CASH_TAKEN_HOME";

export const ENTRY_WORDS: Record<EntryKind, string> = {
  INCOME: "Money in", EXPENSE: "Spent", TRANSFER: "Moved between my accounts",
  LOAN_GIVEN: "Lent to someone", LOAN_TAKEN: "Borrowed", LOAN_RECEIVED: "Loan repaid to me", LOAN_PAID: "Loan / EMI paid",
  INVEST: "Invested", REDEEM: "Investment taken out",
};

export const LINK_WORDS: Record<BusinessLink, string> = {
  PUT_INTO_BUSINESS: "Put into the business",
  TAKEN_FROM_BUSINESS: "Taken from the business",
  BUSINESS_EXPENSE_PAID: "Business expense paid from this account",
  SUPPLIER_BILL_PAID: "Supplier bill paid from this account",
  SHOP_CASH_TAKEN_HOME: "Shop cash taken home",
};

export const INCOME_CATEGORIES = ["Salary from business", "Drawings from business", "Rent received", "Interest", "Agriculture", "Gift received", "Other income"];
export const EXPENSE_CATEGORIES = ["Household", "Groceries", "Fuel and transport", "School and college fees", "Medical", "House rent", "Electricity and bills", "Phone and internet", "Insurance", "Shopping", "Travel", "Gifts and functions", "Taxes", "Other"];

export type Effect = { account: bigint; toAccount: bigint; loan: bigint; invested: bigint; income: bigint; expense: bigint };

/** What one personal entry does to the account, the second account, a loan, an investment and the month's income / spending. */
export function entryEffect(kind: EntryKind, amount: bigint, interest = 0n): Effect {
  const e: Effect = { account: 0n, toAccount: 0n, loan: 0n, invested: 0n, income: 0n, expense: 0n };
  const principal = amount - interest;
  switch (kind) {
    case "INCOME": e.account = amount; e.income = amount; break;
    case "EXPENSE": e.account = -amount; e.expense = amount; break;
    case "TRANSFER": e.account = -amount; e.toAccount = amount; break;
    case "LOAN_GIVEN": e.account = -amount; e.loan = amount; break;
    case "LOAN_TAKEN": e.account = amount; e.loan = amount; break;
    case "LOAN_RECEIVED": e.account = amount; e.loan = -principal; e.income = interest; break;
    case "LOAN_PAID": e.account = -amount; e.loan = -principal; e.expense = interest; break;
    case "INVEST": e.account = -amount; e.invested = amount; break;
    case "REDEEM": e.account = amount; e.invested = -amount; break;
  }
  return e;
}

/** What a business-linked movement does to your account. */
export function linkEffect(link: BusinessLink, amount: bigint): bigint {
  return link === "TAKEN_FROM_BUSINESS" || link === "SHOP_CASH_TAKEN_HOME" ? amount : -amount;
}

/** The next date a day of the month falls on, from today (the 31st becomes the month's last day). */
export function nextDayOfMonth(day: number, todayIso: string): string {
  const [y, m, d] = todayIso.split("-").map(Number);
  const make = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
  };
  const thisMonth = make(y, m);
  if (Number(thisMonth.slice(8)) >= d) return thisMonth;
  return m === 12 ? make(y + 1, 1) : make(y, m + 1);
}

/** A credit card: what is owed, what can still be spent, and the next due date. */
export function cardStatus(balance: bigint, limit: bigint | null, dueDay: number | null, todayIso: string): { owed: bigint; available: bigint | null; nextDue: string | null } {
  const owed = balance < 0n ? -balance : 0n;
  return {
    owed,
    available: limit === null ? null : limit - owed,
    nextDue: dueDay ? nextDayOfMonth(dueDay, todayIso) : null,
  };
}

/** Net worth: money in accounts (cards subtract what is owed) + loans you gave + investments - loans you took. */
export function netWorth(p: { accounts: bigint; loansGiven: bigint; loansTaken: bigint; investments: bigint }): bigint {
  return p.accounts + p.loansGiven + p.investments - p.loansTaken;
}

const dayAfter = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/** The first date on the given day of the month strictly after `iso`. */
export const dayOfMonthAfter = (day: number, iso: string) => nextDayOfMonth(day, dayAfter(iso));

export type CardLine = { date: string; amount: bigint };
export type BillCycle<T extends CardLine> = {
  from: string; billOn: string; dueOn: string;
  openingOwed: bigint; spent: bigint; credits: bigint;
  /** What the bill asked for on the bill date (never below zero). */
  billAmount: bigint;
  /** Payments and refunds after the bill date, until the next bill. */
  paidSince: bigint;
  stillDue: bigint;
  lines: T[];
};
export type OpenCycle<T extends CardLine> = { from: string; nextBillOn: string; spent: bigint; credits: bigint; owedNow: bigint; lines: T[] };

/**
 * A credit card's statement grouped by bill cycle. Lines oldest first; a card balance is below zero while owed.
 * A cycle runs from the day after one bill date to the next bill date. Payments made after a bill date
 * count against that bill first.
 */
export function billCycles<T extends CardLine>(p: { lines: T[]; opening: bigint; openingDate: string | null; billDay: number; dueDay: number | null; today: string; keep?: number }): { past: BillCycle<T>[]; open: OpenCycle<T> } {
  const start = p.openingDate ?? p.lines[0]?.date ?? p.today;
  const lines = [...p.lines].sort((a, b) => a.date.localeCompare(b.date));
  const bills: string[] = [];
  for (let b = nextDayOfMonth(p.billDay, start); b <= p.today && bills.length < 240; b = dayOfMonthAfter(p.billDay, b)) bills.push(b);

  let bal = p.opening;
  let i = 0;
  const take = (to: string) => {
    const got: T[] = [];
    let spent = 0n, credits = 0n;
    while (i < lines.length && lines[i].date <= to) {
      const l = lines[i++];
      got.push(l); bal += l.amount;
      if (l.amount < 0n) spent += -l.amount; else credits += l.amount;
    }
    return { got, spent, credits };
  };
  const owed = (b: bigint) => (b < 0n ? -b : 0n);

  const past: BillCycle<T>[] = [];
  let from = start;
  for (const billOn of bills) {
    const openingOwed = owed(bal);
    const t = take(billOn);
    past.push({
      from, billOn, dueOn: p.dueDay ? dayOfMonthAfter(p.dueDay, billOn) : billOn,
      openingOwed, spent: t.spent, credits: t.credits, billAmount: owed(bal), paidSince: 0n, stillDue: 0n, lines: t.got.reverse(),
    });
    from = dayAfter(billOn);
  }
  const t = take("9999-12-31");
  const open: OpenCycle<T> = {
    from, nextBillOn: bills.length ? dayOfMonthAfter(p.billDay, bills[bills.length - 1]) : nextDayOfMonth(p.billDay, start),
    spent: t.spent, credits: t.credits, owedNow: owed(bal), lines: t.got.reverse(),
  };
  for (let k = 0; k < past.length; k++) {
    past[k].paidSince = k + 1 < past.length ? past[k + 1].credits : open.credits;
    const left = past[k].billAmount - past[k].paidSince;
    past[k].stillDue = left > 0n ? left : 0n;
  }
  return { past: past.reverse().slice(0, p.keep ?? 12), open };
}
