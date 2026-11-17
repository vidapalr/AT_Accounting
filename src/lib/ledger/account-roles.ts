/**
 * Which ledger account each kind of posting goes to, per company.
 *
 * The posting rules (posting-rules.ts) speak in ROLES: "receivables", "sales", "rent"... Each role has a
 * standard account code (the starter chart of accounts). A company that keeps its own chart of accounts
 * maps a role to its own code in acct_account_map (migration 085, Accounting > Account mapping).
 *
 *  - Posting: drafts are built with standard codes, then mapDraftCodes() swaps in the company's codes.
 *  - Reports: standardCode() turns a company code back into the standard one before a report decides
 *    whether an account is sales, cost, expense and so on.
 * With no rows in the table every company uses the standard codes, exactly as before.
 *
 * Pure (no database) so it can be tested; the loader is in account-map.ts.
 */
import { ACCOUNT, EXPENSE_ACCOUNT_BY_CATEGORY, type JournalDraft } from "./posting-rules.ts";

export type AccountRole = { key: string; label: string; standardCode: string; group: string };

const LABELS: Record<keyof typeof ACCOUNT, [string, string]> = {
  RECEIVABLES: ["Money customers owe (receivables)", "Assets"],
  INVENTORY: ["Stock value (inventory)", "Assets"],
  DEPOSITS: ["Refundable deposits paid", "Assets"],
  SETUP_ASSET: ["Set-up costs (held as an asset)", "Assets"],
  STAFF_ADVANCES: ["Advances to staff", "Assets"],
  FIXED_ASSETS: ["Fixed assets at cost", "Assets"],
  ACCUMULATED_DEPRECIATION: ["Wear to date on fixed assets", "Assets"],
  PAYABLES: ["Money owed to suppliers (payables)", "Liabilities"],
  ACCRUED_EXPENSES: ["Expenses not yet paid", "Liabilities"],
  LOANS_PAYABLE: ["Loans payable", "Liabilities"],
  PROPRIETOR_CAPITAL: ["Owner's capital", "Capital"],
  INVESTOR_CAPITAL: ["Investor capital", "Capital"],
  INVESTOR_PROFIT_SHARE: ["Investor profit share", "Capital"],
  SALES: ["Sales", "Income"],
  DELIVERY_INCOME: ["Delivery charged to customers", "Income"],
  SALES_DISCOUNTS: ["Sales discounts", "Income"],
  SALES_RETURNS: ["Sales returns", "Income"],
  COGS: ["Cost of goods sold", "Cost of sales"],
  DAMAGED_STOCK: ["Damaged or lost stock", "Cost of sales"],
  SUPPLIER_RETURN_LOSS: ["Loss on goods returned to suppliers", "Cost of sales"],
  GIFTS: ["Gifts and free stock", "Expenses"],
  DEPRECIATION: ["Depreciation", "Expenses"],
  DISPOSAL_LOSS: ["Loss or gain on selling assets", "Expenses"],
  INVESTOR_RETURN_COST: ["Returns paid to investors (cost)", "Expenses"],
  SETUP_COSTS: ["Set-up costs (expense)", "Expenses"],
};

const EXPENSE_LABELS: Record<string, string> = {
  RENT: "Rent",
  SALARY: "Salaries",
  ELECTRICITY: "Electricity",
  TRANSPORT: "Transport",
  PACKING: "Packing",
  MARKETING: "Marketing",
  MAINTENANCE: "Repairs and maintenance",
  INTERNET_PHONE: "Internet and phone",
  OFFICE_SUPPLIES: "Office supplies",
  BANK_CHARGES: "Bank charges",
  MISCELLANEOUS: "Other expenses",
};

/** Every role the posting rules use, with its standard code. */
export const ACCOUNT_ROLES: AccountRole[] = [
  ...(Object.keys(ACCOUNT) as Array<keyof typeof ACCOUNT>).map((k) => ({
    key: k,
    label: LABELS[k][0],
    group: LABELS[k][1],
    standardCode: ACCOUNT[k],
  })),
  ...Object.entries(EXPENSE_ACCOUNT_BY_CATEGORY).map(([cat, code]) => ({
    key: `EXPENSE_${cat}`,
    label: EXPENSE_LABELS[cat] ?? cat,
    group: "Expenses",
    standardCode: code,
  })),
];

const ROLE_BY_KEY = new Map(ACCOUNT_ROLES.map((r) => [r.key, r]));

/** Company mapping: standard code -> company code (only roles the company changed). */
export type CodeMap = Map<string, string>;

/** Builds the mapping from saved rows (role key -> company code); unknown roles and no-op rows are ignored. */
export function buildCodeMap(rows: Array<{ role: string; code: string }>): CodeMap {
  const map: CodeMap = new Map();
  for (const { role, code } of rows) {
    const r = ROLE_BY_KEY.get(role);
    const c = code.trim();
    if (r && c && c !== r.standardCode) map.set(r.standardCode, c);
  }
  return map;
}

/** Problems with a mapping: two roles on one account, or a company code that takes over another role's standard code. */
export function mappingProblems(map: CodeMap): string[] {
  const problems: string[] = [];
  const targets = new Map<string, string>();
  for (const [std, code] of map) {
    const prev = targets.get(code);
    if (prev) problems.push(`Account ${code} is chosen for both ${prev} and ${std}.`);
    targets.set(code, std);
  }
  const standard = new Set(ACCOUNT_ROLES.map((r) => r.standardCode));
  for (const [std, code] of map) {
    if (standard.has(code) && !map.has(code)) problems.push(`Account ${code} is the standard account of another role; move that role first (${std}).`);
  }
  return problems;
}

/** Puts the company's own codes on a draft built with standard codes. */
export function mapDraftCodes(draft: JournalDraft, map: CodeMap): JournalDraft {
  if (map.size === 0) return draft;
  return { ...draft, lines: draft.lines.map((l) => (map.has(l.accountCode) ? { ...l, accountCode: map.get(l.accountCode)! } : l)) };
}

/** company code -> standard code, for reports that classify accounts by their standard codes. */
export function standardCoder(map: CodeMap): (code: string) => string {
  if (map.size === 0) return (code) => code;
  const back = new Map<string, string>();
  for (const [std, code] of map) back.set(code, std);
  return (code) => back.get(code) ?? (map.has(code) ? `moved:${code}` : code);
}
