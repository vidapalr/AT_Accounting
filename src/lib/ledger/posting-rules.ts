/**
 * Ledger posting rules (pure functions, no database access).
 *
 * Each operational record (invoice, receipt, purchase, payment, expense,
 * deposit) becomes one balanced journal draft. Money is integer paise
 * (bigint) throughout; amounts arrive as DECIMAL strings from MySQL.
 *
 * Accounting basis: accrual.
 *   Sale      Dr Receivables, Dr Sales Discounts / Cr Sales;  Dr COGS / Cr Inventory
 *   Receipt   Dr bank | cash | Investor Capital / Cr Receivables
 *   Purchase  Dr Inventory / Cr Supplier Payables
 *   Payment   Dr Supplier Payables / Cr bank | cash | Investor Capital | Proprietor Capital
 *   Expense   Dr expense account / Cr Accrued Expenses, then paid like a purchase payment
 *   Deposit   Dr Refundable Shop Deposits / Cr the paying source
 *   Supplier return   Dr Supplier Payables (agreed value), Dr Loss on Supplier Returns (any shortfall) / Cr Inventory (cost)
 *   Supplier refund   Dr bank | cash / Cr Supplier Payables
 *   Free stock        Dr Gifts and Free Stock / Cr Inventory (at cost)
 *
 * Investor money is capital for now: whatever the investor pays out of
 * (or receives into) his own bank is a credit (or debit) to Investor Capital.
 * Money the owner pays personally is a contribution to Proprietor Capital.
 *
 * Keep this file free of imports so it can be unit-tested directly.
 */

export const ACCOUNT = {
  RECEIVABLES: "1100",
  INVENTORY: "1200",
  DEPOSITS: "1310",
  PAYABLES: "2000",
  ACCRUED_EXPENSES: "2200",
  PROPRIETOR_CAPITAL: "3000",
  INVESTOR_CAPITAL: "3200",
  SALES: "4000",
  SETUP_COSTS: "6900",
  SETUP_ASSET: "1320",
  SALES_DISCOUNTS: "4200",
  SALES_RETURNS: "4210",
  COGS: "5000",
  DAMAGED_STOCK: "5150",
  SUPPLIER_RETURN_LOSS: "5160",
  GIFTS: "6045",
} as const;

export const EXPENSE_ACCOUNT_BY_CATEGORY: Record<string, string> = {
  RENT: "6000",
  SALARY: "6010",
  ELECTRICITY: "6020",
  TRANSPORT: "6030",
  PACKING: "6035",
  MARKETING: "6040",
  MAINTENANCE: "6050",
  INTERNET_PHONE: "6060",
  OFFICE_SUPPLIES: "6070",
  BANK_CHARGES: "6080",
  MISCELLANEOUS: "6090",
};

export type SourceType =
  | "OPENING_BALANCE"
  | "SALES_INVOICE"
  | "SALES_RECEIPT"
  | "PURCHASE_RECEIPT"
  | "PURCHASE_PAYMENT"
  | "EXPENSE"
  | "EXPENSE_PAYMENT"
  | "DEPOSIT_PAID"
  | "DEPOSIT_REFUND"
  | "SALES_RETURN"
  | "SALES_REFUND"
  | "STOCK_DAMAGE"
  | "SUPPLIER_RETURN"
  | "SUPPLIER_REFUND"
  | "FREE_STOCK"
  | "SETUP_CAPITALISATION";

export type Dimensions = {
  divisionId: number | null;
  branchId: number | null;
};

/** Where money came from, or went to. */
export type Settlement =
  | { kind: "ACCOUNT"; accountCode: string } // business bank or cash GL account
  | { kind: "INVESTOR" } // investor's own bank / cash
  | { kind: "OWNER" }; // owner's personal money

export type DraftLine = {
  accountCode: string;
  debit: bigint;
  credit: bigint;
  divisionId: number | null;
  branchId: number | null;
  memo: string;
};

export type JournalDraft = {
  sourceType: SourceType;
  sourceId: number;
  entryDate: string; // YYYY-MM-DD
  description: string;
  lines: DraftLine[];
};

// ---------------------------------------------------------------- money

export function parseMoney(value: string | number): bigint {
  const text = String(value);
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(text)) {
    throw new Error(`Invalid money amount: ${text}`);
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function formatMoney(paise: bigint): string {
  const negative = paise < 0n;
  const abs = negative ? -paise : paise;
  const whole = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

// -------------------------------------------------------------- helpers

function settlementAccount(settlement: Settlement): string {
  switch (settlement.kind) {
    case "ACCOUNT":
      return settlement.accountCode;
    case "INVESTOR":
      return ACCOUNT.INVESTOR_CAPITAL;
    case "OWNER":
      return ACCOUNT.PROPRIETOR_CAPITAL;
  }
}

function debit(
  accountCode: string,
  amount: bigint,
  dims: Dimensions,
  memo: string
): DraftLine {
  return {
    accountCode,
    debit: amount,
    credit: 0n,
    divisionId: dims.divisionId,
    branchId: dims.branchId,
    memo,
  };
}

function credit(
  accountCode: string,
  amount: bigint,
  dims: Dimensions,
  memo: string
): DraftLine {
  return {
    accountCode,
    debit: 0n,
    credit: amount,
    divisionId: dims.divisionId,
    branchId: dims.branchId,
    memo,
  };
}

function makeDraft(
  sourceType: SourceType,
  sourceId: number,
  entryDate: string,
  description: string,
  lines: DraftLine[]
): JournalDraft {
  // The journal poster rejects zero lines, so drop them here.
  const kept = lines.filter((l) => l.debit > 0n || l.credit > 0n);

  const totalDebit = kept.reduce((s, l) => s + l.debit, 0n);
  const totalCredit = kept.reduce((s, l) => s + l.credit, 0n);

  if (kept.length < 2 || totalDebit === 0n || totalDebit !== totalCredit) {
    throw new Error(
      `${sourceType} ${sourceId} (${description}) does not balance: ` +
        `debit ${formatMoney(totalDebit)} vs credit ${formatMoney(totalCredit)}`
    );
  }

  for (const l of kept) {
    if (l.debit > 0n && l.credit > 0n) {
      throw new Error(`${sourceType} ${sourceId}: a line cannot carry both sides`);
    }
  }

  return { sourceType, sourceId, entryDate, description, lines: kept };
}

export function expenseAccountForCategory(category: string): string {
  const code = EXPENSE_ACCOUNT_BY_CATEGORY[category];
  if (!code) {
    throw new Error(`No ledger account mapped for expense category ${category}`);
  }
  return code;
}

// -------------------------------------------------------------- entries

export function saleInvoiceEntry(sale: {
  id: number;
  invoiceNo: string;
  date: string;
  dims: Dimensions;
  subtotal: string; // sum of qty x price, before any discount
  discount: string; // line discounts + invoice discount
  grandTotal: string;
  costOfGoodsSold: string;
}): JournalDraft {
  const subtotal = parseMoney(sale.subtotal);
  const discount = parseMoney(sale.discount);
  const grandTotal = parseMoney(sale.grandTotal);
  const cogs = parseMoney(sale.costOfGoodsSold);

  if (subtotal - discount !== grandTotal) {
    throw new Error(
      `Invoice ${sale.invoiceNo}: subtotal ${sale.subtotal} less discount ` +
        `${sale.discount} does not equal total ${sale.grandTotal}`
    );
  }

  const memo = `Invoice ${sale.invoiceNo}`;

  return makeDraft("SALES_INVOICE", sale.id, sale.date, memo, [
    debit(ACCOUNT.RECEIVABLES, grandTotal, sale.dims, memo),
    debit(ACCOUNT.SALES_DISCOUNTS, discount, sale.dims, memo),
    credit(ACCOUNT.SALES, subtotal, sale.dims, memo),
    debit(ACCOUNT.COGS, cogs, sale.dims, `${memo} cost of goods`),
    credit(ACCOUNT.INVENTORY, cogs, sale.dims, `${memo} cost of goods`),
  ]);
}

export function salesReceiptEntry(receipt: {
  id: number;
  invoiceNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  if (receipt.settlement.kind === "OWNER") {
    throw new Error(`Receipt ${receipt.id}: owner cannot be a receiving account`);
  }
  const amount = parseMoney(receipt.amount);
  const memo = `Receipt for invoice ${receipt.invoiceNo}`;

  return makeDraft("SALES_RECEIPT", receipt.id, receipt.date, memo, [
    debit(settlementAccount(receipt.settlement), amount, receipt.dims, memo),
    credit(ACCOUNT.RECEIVABLES, amount, receipt.dims, memo),
  ]);
}

/** A discount allowed to close a bill: Sales Discounts up, what the customer owes down. No cash or bank moves. */
export function salesSettlementDiscountEntry(d: {
  id: number;
  invoiceNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
}): JournalDraft {
  const amount = parseMoney(d.amount);
  const memo = `Discount to close invoice ${d.invoiceNo}`;
  return makeDraft("SALES_RECEIPT", d.id, d.date, memo, [
    debit(ACCOUNT.SALES_DISCOUNTS, amount, d.dims, memo),
    credit(ACCOUNT.RECEIVABLES, amount, d.dims, memo),
  ]);
}

export function purchaseReceiptEntry(purchase: {
  id: number;
  purchaseNo: string;
  date: string;
  dims: Dimensions;
  total: string;
}): JournalDraft {
  const total = parseMoney(purchase.total);
  const memo = `Purchase ${purchase.purchaseNo}`;

  return makeDraft("PURCHASE_RECEIPT", purchase.id, purchase.date, memo, [
    debit(ACCOUNT.INVENTORY, total, purchase.dims, memo),
    credit(ACCOUNT.PAYABLES, total, purchase.dims, memo),
  ]);
}

export function purchasePaymentEntry(payment: {
  id: number;
  paymentNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  const amount = parseMoney(payment.amount);
  const memo = `Supplier payment ${payment.paymentNo}`;

  return makeDraft("PURCHASE_PAYMENT", payment.id, payment.date, memo, [
    debit(ACCOUNT.PAYABLES, amount, payment.dims, memo),
    credit(settlementAccount(payment.settlement), amount, payment.dims, memo),
  ]);
}

export function expenseEntry(expense: {
  id: number;
  expenseNo: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  dims: Dimensions;
  /** One-off cost of starting up: reported below operating profit. */
  isSetupCost?: boolean;
}): JournalDraft {
  const amount = parseMoney(expense.amount);
  const memo = expense.isSetupCost
    ? `Set-up cost ${expense.expenseNo} (${expense.category})`
    : `Expense ${expense.expenseNo} (${expense.category})`;
  const expenseAccount = expense.isSetupCost
    ? ACCOUNT.SETUP_COSTS
    : expenseAccountForCategory(expense.category);

  return makeDraft("EXPENSE", expense.id, expense.date, memo, [
    debit(expenseAccount, amount, expense.dims, memo),
    credit(ACCOUNT.ACCRUED_EXPENSES, amount, expense.dims, memo),
  ]);
}

/**
 * Moves a set-up cost out of expenses and into an asset, so it does not
 * reduce profit. Posted after the expense itself, keyed by the expense.
 */
export function setupCapitalisationEntry(expense: {
  id: number;
  expenseNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
}): JournalDraft {
  const amount = parseMoney(expense.amount);
  const memo = `Set-up cost ${expense.expenseNo} carried as an asset`;

  return makeDraft("SETUP_CAPITALISATION", expense.id, expense.date, memo, [
    debit(ACCOUNT.SETUP_ASSET, amount, expense.dims, memo),
    credit(ACCOUNT.SETUP_COSTS, amount, expense.dims, memo),
  ]);
}

export function expensePaymentEntry(payment: {
  id: number;
  expenseNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  const amount = parseMoney(payment.amount);
  const memo = `Payment of expense ${payment.expenseNo}`;

  return makeDraft("EXPENSE_PAYMENT", payment.id, payment.date, memo, [
    debit(ACCOUNT.ACCRUED_EXPENSES, amount, payment.dims, memo),
    credit(settlementAccount(payment.settlement), amount, payment.dims, memo),
  ]);
}

export function depositPaidEntry(deposit: {
  id: number;
  advanceNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  const amount = parseMoney(deposit.amount);
  const memo = `Deposit paid ${deposit.advanceNo}`;

  return makeDraft("DEPOSIT_PAID", deposit.id, deposit.date, memo, [
    debit(ACCOUNT.DEPOSITS, amount, deposit.dims, memo),
    credit(settlementAccount(deposit.settlement), amount, deposit.dims, memo),
  ]);
}

export function depositRefundEntry(refund: {
  id: number;
  advanceNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  if (refund.settlement.kind === "OWNER") {
    throw new Error(`Refund ${refund.id}: owner cannot be a receiving account`);
  }
  const amount = parseMoney(refund.amount);
  const memo = `Deposit refund ${refund.advanceNo}`;

  return makeDraft("DEPOSIT_REFUND", refund.id, refund.date, memo, [
    debit(settlementAccount(refund.settlement), amount, refund.dims, memo),
    credit(ACCOUNT.DEPOSITS, amount, refund.dims, memo),
  ]);
}

/**
 * A customer brings goods back.
 *   Sales Returns takes back the sale at its selling price; the part of the
 *   invoice discount that belonged to those pieces is given back too, so the
 *   customer is credited only what they actually paid for them.
 *   Resellable pieces go back into stock at their original cost; damaged
 *   pieces do not, and their cost becomes a damaged-stock loss.
 */
export function salesReturnEntry(ret: {
  id: number;
  returnNo: string;
  invoiceNo: string;
  date: string;
  dims: Dimensions;
  grossValue: string;
  refundValue: string;
  restockCost: string;
  damagedCost: string;
}): JournalDraft {
  const gross = parseMoney(ret.grossValue);
  const refund = parseMoney(ret.refundValue);
  const restock = parseMoney(ret.restockCost);
  const damaged = parseMoney(ret.damagedCost);
  const memo = `Return ${ret.returnNo} against invoice ${ret.invoiceNo}`;

  if (refund > gross) {
    throw new Error(`Return ${ret.returnNo}: refund value exceeds the selling value`);
  }

  return makeDraft("SALES_RETURN", ret.id, ret.date, memo, [
    debit(ACCOUNT.SALES_RETURNS, gross, ret.dims, memo),
    credit(ACCOUNT.SALES_DISCOUNTS, gross - refund, ret.dims, memo),
    credit(ACCOUNT.RECEIVABLES, refund, ret.dims, memo),
    debit(ACCOUNT.INVENTORY, restock, ret.dims, memo),
    debit(ACCOUNT.DAMAGED_STOCK, damaged, ret.dims, memo),
    credit(ACCOUNT.COGS, restock + damaged, ret.dims, memo),
  ]);
}

/** Money paid back to the customer for a return. */
export function salesRefundEntry(refund: {
  id: number;
  returnNo: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  if (refund.settlement.kind === "OWNER") {
    throw new Error(`Refund ${refund.id}: pay refunds from a business or investor account`);
  }
  const amount = parseMoney(refund.amount);
  const memo = `Refund for return ${refund.returnNo}`;

  return makeDraft("SALES_REFUND", refund.id, refund.date, memo, [
    debit(ACCOUNT.RECEIVABLES, amount, refund.dims, memo),
    credit(settlementAccount(refund.settlement), amount, refund.dims, memo),
  ]);
}

/** Stock damaged or lost in the shop or warehouse. */
export function stockDamageEntry(damage: {
  id: number;
  date: string;
  reason: string;
  cost: string;
  dims: Dimensions;
}): JournalDraft {
  const cost = parseMoney(damage.cost);
  const memo = `Stock ${damage.reason.toLowerCase()} (record ${damage.id})`;

  return makeDraft("STOCK_DAMAGE", damage.id, damage.date, memo, [
    debit(ACCOUNT.DAMAGED_STOCK, cost, damage.dims, memo),
    credit(ACCOUNT.INVENTORY, cost, damage.dims, memo),
  ]);
}

/**
 * Goods sent back to a supplier. Stock leaves at its cost; what we owe the
 * supplier drops by the value he agreed. If he agreed to less than the cost,
 * the shortfall is shown as a loss rather than hidden.
 */
export function supplierReturnEntry(ret: {
  id: number;
  returnNo: string;
  date: string;
  dims: Dimensions;
  costValue: string;
  agreedValue: string;
}): JournalDraft {
  const cost = parseMoney(ret.costValue);
  const agreed = parseMoney(ret.agreedValue);
  if (agreed > cost) {
    throw new Error(`${ret.returnNo}: agreed value cannot be more than the cost of the goods`);
  }
  const memo = `Supplier return ${ret.returnNo}`;

  return makeDraft("SUPPLIER_RETURN", ret.id, ret.date, memo, [
    debit(ACCOUNT.PAYABLES, agreed, ret.dims, memo),
    debit(ACCOUNT.SUPPLIER_RETURN_LOSS, cost - agreed, ret.dims, memo),
    credit(ACCOUNT.INVENTORY, cost, ret.dims, memo),
  ]);
}

/** Money a supplier paid back to us. It settles the credit he owed. */
export function supplierRefundEntry(refund: {
  id: number;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  const amount = parseMoney(refund.amount);
  const memo = `Supplier refund (record ${refund.id})`;

  return makeDraft("SUPPLIER_REFUND", refund.id, refund.date, memo, [
    debit(settlementAccount(refund.settlement), amount, refund.dims, memo),
    credit(ACCOUNT.PAYABLES, amount, refund.dims, memo),
  ]);
}

/** Stock given away free. Always a business expense, at cost. */
export function freeStockEntry(give: {
  id: number;
  entryNo: string;
  date: string;
  cost: string;
  givenTo: string;
  dims: Dimensions;
}): JournalDraft {
  const cost = parseMoney(give.cost);
  const memo = `Free stock ${give.entryNo} to ${give.givenTo}`.slice(0, 480);

  return makeDraft("FREE_STOCK", give.id, give.date, memo, [
    debit(ACCOUNT.GIFTS, cost, give.dims, memo),
    credit(ACCOUNT.INVENTORY, cost, give.dims, memo),
  ]);
}

export function openingBalanceEntry(batch: {
  id: number;
  date: string;
  description: string;
  lines: Array<{
    accountCode: string;
    debit: string;
    credit: string;
    dims: Dimensions;
    memo: string;
  }>;
}): JournalDraft {
  return makeDraft(
    "OPENING_BALANCE",
    batch.id,
    batch.date,
    batch.description,
    batch.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: parseMoney(l.debit),
      credit: parseMoney(l.credit),
      divisionId: l.dims.divisionId,
      branchId: l.dims.branchId,
      memo: l.memo,
    }))
  );
}

// -------------------------------------------------------- trial balance

export type TrialBalanceRow = {
  accountCode: string;
  debit: bigint;
  credit: bigint;
};

export function trialBalance(drafts: JournalDraft[]): TrialBalanceRow[] {
  const totals = new Map<string, TrialBalanceRow>();

  for (const draft of drafts) {
    for (const l of draft.lines) {
      const row = totals.get(l.accountCode) ?? {
        accountCode: l.accountCode,
        debit: 0n,
        credit: 0n,
      };
      row.debit += l.debit;
      row.credit += l.credit;
      totals.set(l.accountCode, row);
    }
  }

  return [...totals.values()].sort((a, b) =>
    a.accountCode.localeCompare(b.accountCode)
  );
}
