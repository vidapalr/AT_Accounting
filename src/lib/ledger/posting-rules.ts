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
  LOANS_PAYABLE: "2120",
  INVESTOR_PROFIT_SHARE: "3250",
  INVESTOR_RETURN_COST: "6120",
  SALES: "4000",
  SETUP_COSTS: "6900",
  SETUP_ASSET: "1320",
  SALES_DISCOUNTS: "4200",
  DELIVERY_INCOME: "4300",
  SALES_RETURNS: "4210",
  COGS: "5000",
  DAMAGED_STOCK: "5150",
  SUPPLIER_RETURN_LOSS: "5160",
  GIFTS: "6045",
  STAFF_ADVANCES: "1330",
  FIXED_ASSETS: "1500",
  ACCUMULATED_DEPRECIATION: "1510",
  DEPRECIATION: "6100",
  DISPOSAL_LOSS: "6110",
  GST_INPUT_CGST: "1410",
  GST_INPUT_SGST: "1411",
  GST_INPUT_IGST: "1412",
  GST_OUTPUT_CGST: "2310",
  GST_OUTPUT_SGST: "2311",
  GST_OUTPUT_IGST: "2312",
  GST_RCM_PAYABLE: "2315",
  GST_COMPOSITION: "6130",
  GST_INTEREST_FEES: "6140",
} as const;

export const EXPENSE_ACCOUNT_BY_CATEGORY: Record<string, string> = {
  RENT: "6000",
  SALARY: "6010",
  EMPLOYER_CONTRIBUTION: "6015",
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
  | "STOCK_FIND"
  | "SUPPLIER_RETURN"
  | "SUPPLIER_REFUND"
  | "FREE_STOCK"
  | "SETUP_CAPITALISATION"
  | "AUDITOR_ADJUSTMENT"
  | "PARTY_SETOFF"
  | "FIXED_ASSET"
  | "ASSET_DEPRECIATION"
  | "ASSET_DISPOSAL"
  | "STAFF_ADVANCE"
  | "CUSTOMER_CREDIT_IN"
  | "CUSTOMER_CREDIT_REFUND"
  | "OWNER_MONEY"
  | "CASH_TAKEN"
  | "FUNDING_RECEIPT"
  | "GST_PAYMENT";

export type Dimensions = {
  divisionId: number | null;
  branchId: number | null;
};

/** GST amounts as DECIMAL strings (zero or absent when GST does not apply). */
export type GstAmounts = { cgst: string; sgst: string; igst: string };

function gstPaise(t: GstAmounts | undefined): { cgst: bigint; sgst: bigint; igst: bigint; total: bigint } {
  if (!t) return { cgst: 0n, sgst: 0n, igst: 0n, total: 0n };
  const cgst = parseMoney(t.cgst || "0");
  const sgst = parseMoney(t.sgst || "0");
  const igst = parseMoney(t.igst || "0");
  return { cgst, sgst, igst, total: cgst + sgst + igst };
}

/** Where money came from, or went to. */
export type Settlement =
  // business bank or cash GL account; for a cash drawer, `drawer` is the branch (and division) it belongs to
  | { kind: "ACCOUNT"; accountCode: string; drawer?: Dimensions }
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

/**
 * Where the bank or cash line of an entry is booked. A cash account needs a branch, but many entries (supplier
 * payments, owner money, assets) only know the division. When the line has no branch and the money moved
 * through a cash drawer, use that drawer's branch.
 */
function lineDims(settlement: Settlement, dims: Dimensions): Dimensions {
  if (settlement.kind === "ACCOUNT" && settlement.drawer && dims.branchId === null) {
    return { divisionId: dims.divisionId ?? settlement.drawer.divisionId, branchId: settlement.drawer.branchId };
  }
  return dims;
}

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
  /** Delivery charged on the bill (optional). */
  shipping?: string;
  /** GST inside the goods (prices include GST) and inside the delivery charge. */
  goodsTax?: GstAmounts;
  shippingTax?: GstAmounts;
}): JournalDraft {
  const subtotal = parseMoney(sale.subtotal);
  const gt = gstPaise(sale.goodsTax);
  const st = gstPaise(sale.shippingTax);
  const shipping = parseMoney(sale.shipping ?? "0");
  const discount = parseMoney(sale.discount);
  const grandTotal = parseMoney(sale.grandTotal);
  const cogs = parseMoney(sale.costOfGoodsSold);

  if (subtotal - discount + shipping !== grandTotal) {
    throw new Error(
      `Invoice ${sale.invoiceNo}: subtotal ${sale.subtotal} less discount ` +
        `${sale.discount} plus delivery ${sale.shipping ?? "0"} does not equal total ${sale.grandTotal}`
    );
  }

  const memo = `Invoice ${sale.invoiceNo}`;

  return makeDraft("SALES_INVOICE", sale.id, sale.date, memo, [
    debit(ACCOUNT.RECEIVABLES, grandTotal, sale.dims, memo),
    debit(ACCOUNT.SALES_DISCOUNTS, discount, sale.dims, memo),
    credit(ACCOUNT.SALES, subtotal - gt.total, sale.dims, memo),
    credit(ACCOUNT.DELIVERY_INCOME, shipping - st.total, sale.dims, `${memo} delivery`),
    credit(ACCOUNT.GST_OUTPUT_CGST, gt.cgst + st.cgst, sale.dims, `${memo} GST`),
    credit(ACCOUNT.GST_OUTPUT_SGST, gt.sgst + st.sgst, sale.dims, `${memo} GST`),
    credit(ACCOUNT.GST_OUTPUT_IGST, gt.igst + st.igst, sale.dims, `${memo} GST`),
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
    debit(settlementAccount(receipt.settlement), amount, lineDims(receipt.settlement, receipt.dims), memo),
    credit(ACCOUNT.RECEIVABLES, amount, receipt.dims, memo),
  ]);
}

/** Money a customer paid beyond what they owed. Cash or bank up, and what the customer owes goes below zero (we owe them). */
export function customerCreditReceivedEntry(c: {
  id: number;
  customerName: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  if (c.settlement.kind === "OWNER") throw new Error(`Customer credit ${c.id}: owner cannot be a receiving account`);
  const amount = parseMoney(c.amount);
  const memo = `Customer credit received from ${c.customerName}`;
  return makeDraft("CUSTOMER_CREDIT_IN", c.id, c.date, memo, [
    debit(settlementAccount(c.settlement), amount, lineDims(c.settlement, c.dims), memo),
    credit(ACCOUNT.RECEIVABLES, amount, c.dims, memo),
  ]);
}

/** Customer credit paid back to the customer. */
export function customerCreditRefundEntry(c: {
  id: number;
  customerName: string;
  date: string;
  amount: string;
  dims: Dimensions;
  settlement: Settlement;
}): JournalDraft {
  if (c.settlement.kind === "OWNER") throw new Error(`Customer credit ${c.id}: pay it back from a business or investor account`);
  const amount = parseMoney(c.amount);
  const memo = `Customer credit paid back to ${c.customerName}`;
  return makeDraft("CUSTOMER_CREDIT_REFUND", c.id, c.date, memo, [
    debit(ACCOUNT.RECEIVABLES, amount, c.dims, memo),
    credit(settlementAccount(c.settlement), amount, lineDims(c.settlement, c.dims), memo),
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

/** Money given to a staff member before payday: Staff Advances up, paid from bank or cash. */
export function staffAdvanceEntry(a: {
  id: number; advanceNo: string; employeeName: string; date: string; amount: string; dims: Dimensions; settlement: Settlement;
}): JournalDraft {
  const amount = parseMoney(a.amount);
  const memo = `Staff advance ${a.advanceNo}: ${a.employeeName}`;
  return makeDraft("STAFF_ADVANCE", a.id, a.date, memo, [
    debit(ACCOUNT.STAFF_ADVANCES, amount, a.dims, memo),
    credit(settlementAccount(a.settlement), amount, lineDims(a.settlement, a.dims), memo),
  ]);
}

/**
 * The owner puts money into a business bank or cash account (Proprietor Capital up),
 * or takes money back out (Proprietor Capital down).
 */
export function ownerMoneyEntry(a: {
  id: number; entryNo: string; direction: "IN" | "OUT"; date: string; amount: string; note: string; dims: Dimensions; settlement: Settlement;
}): JournalDraft {
  const amount = parseMoney(a.amount);
  const memo = `${a.direction === "IN" ? "Owner put in" : "Owner took out"} ${a.entryNo}${a.note ? `: ${a.note}` : ""}`;
  const account = settlementAccount(a.settlement);
  const accountDims = lineDims(a.settlement, a.dims);
  return makeDraft("OWNER_MONEY", a.id, a.date, memo, a.direction === "IN"
    ? [debit(account, amount, accountDims, memo), credit(ACCOUNT.PROPRIETOR_CAPITAL, amount, a.dims, memo)]
    : [debit(ACCOUNT.PROPRIETOR_CAPITAL, amount, a.dims, memo), credit(account, amount, accountDims, memo)]);
}

/**
 * Cash taken out of a drawer at day end: deposited to a business bank account (bank up), or taken by
 * the owner (Proprietor Capital down). Either way the cash drawer goes down.
 */
export function cashTakenEntry(a: {
  id: number; date: string; amount: string; to: "BANK" | "OWNER" | "CASH"; dims: Dimensions; cash: Settlement; target: Settlement | null;
}): JournalDraft {
  const amount = parseMoney(a.amount);
  const memo = a.to === "BANK" ? "Cash taken from the drawer to the bank"
    : a.to === "CASH" ? "Cash moved from one drawer to another"
    : "Cash taken from the drawer by the owner";
  const needTarget = () => { throw new Error(a.to === "BANK" ? "no bank account recorded" : "no cash drawer recorded"); };
  const toAccount = a.to === "OWNER"
    ? ACCOUNT.PROPRIETOR_CAPITAL
    : (a.target ? settlementAccount(a.target) : needTarget());
  const toDims = a.to !== "OWNER" && a.target ? lineDims(a.target, a.dims) : a.dims;
  return makeDraft("CASH_TAKEN", a.id, a.date, memo, [
    debit(toAccount, amount, toDims, memo),
    credit(settlementAccount(a.cash), amount, lineDims(a.cash, a.dims), memo),
  ]);
}

/**
 * Investor money received into a business bank or cash account (Investor Capital up), or the
 * principal paid back (Investor Capital down). Posted only after the owner confirmed it against the bank.
 */
export function fundingReceiptEntry(a: {
  id: number; txNo: string; kind: "RECEIVED" | "REPAID" | "RETURN_SHARE" | "RETURN_COST"; date: string; amount: string; agreementNo: string; dims: Dimensions; settlement: Settlement;
  /** Money on a Loan agreement is owed back (Loans Payable), not investor capital. */
  loan?: boolean;
}): JournalDraft {
  const amount = parseMoney(a.amount);
  const principal = a.loan ? ACCOUNT.LOANS_PAYABLE : ACCOUNT.INVESTOR_CAPITAL;
  const words = { RECEIVED: "Investor money received", REPAID: "Investor principal paid back", RETURN_SHARE: "Investor profit share paid", RETURN_COST: "Investor return paid (cost)" };
  const memo = `${words[a.kind]} ${a.txNo} (${a.agreementNo})`;
  const account = settlementAccount(a.settlement);
  const accountDims = lineDims(a.settlement, a.dims);
  if (a.kind === "RECEIVED") return makeDraft("FUNDING_RECEIPT", a.id, a.date, memo, [debit(account, amount, accountDims, memo), credit(principal, amount, a.dims, memo)]);
  const from = a.kind === "REPAID" ? principal : a.kind === "RETURN_SHARE" ? ACCOUNT.INVESTOR_PROFIT_SHARE : ACCOUNT.INVESTOR_RETURN_COST;
  return makeDraft("FUNDING_RECEIPT", a.id, a.date, memo, [debit(from, amount, a.dims, memo), credit(account, amount, accountDims, memo)]);
}

/** An asset bought: Fixed Assets up, paid from bank or cash (or the owner's / investor's own money). */
export function fixedAssetPurchaseEntry(a: {
  id: number; assetNo: string; name: string; date: string; cost: string; dims: Dimensions; settlement: Settlement;
}): JournalDraft {
  const cost = parseMoney(a.cost);
  const memo = `Asset ${a.assetNo}: ${a.name}`;
  return makeDraft("FIXED_ASSET", a.id, a.date, memo, [
    debit(ACCOUNT.FIXED_ASSETS, cost, a.dims, memo),
    credit(settlementAccount(a.settlement), cost, lineDims(a.settlement, a.dims), memo),
  ]);
}

/** One month's wear on all assets of a division: Depreciation expense up, Accumulated Depreciation up. */
export function assetDepreciationEntry(r: { id: number; period: string; date: string; total: string; dims: Dimensions }): JournalDraft {
  const total = parseMoney(r.total);
  const memo = `Depreciation for ${r.period}`;
  return makeDraft("ASSET_DEPRECIATION", r.id, r.date, memo, [
    debit(ACCOUNT.DEPRECIATION, total, r.dims, memo),
    credit(ACCOUNT.ACCUMULATED_DEPRECIATION, total, r.dims, memo),
  ]);
}

/**
 * An asset sold, scrapped or given away. The asset and its wear leave the books; whatever
 * money came in is received; the difference is the loss (or gain) on disposal.
 */
export function assetDisposalEntry(a: {
  id: number; assetNo: string; name: string; date: string; cost: string; accumulated: string; proceeds: string;
  dims: Dimensions; proceedsSettlement: Settlement | null;
}): JournalDraft {
  const cost = parseMoney(a.cost);
  const accumulated = parseMoney(a.accumulated);
  const proceeds = parseMoney(a.proceeds);
  const memo = `Disposal of asset ${a.assetNo}: ${a.name}`;
  if (proceeds > 0n && !a.proceedsSettlement) throw new Error("money received for the asset has no account");
  const lossOrGain = cost - accumulated - proceeds; // positive is a loss
  return makeDraft("ASSET_DISPOSAL", a.id, a.date, memo, [
    ...(proceeds > 0n ? [debit(settlementAccount(a.proceedsSettlement!), proceeds, lineDims(a.proceedsSettlement!, a.dims), memo)] : []),
    debit(ACCOUNT.ACCUMULATED_DEPRECIATION, accumulated, a.dims, memo),
    lossOrGain > 0n ? debit(ACCOUNT.DISPOSAL_LOSS, lossOrGain, a.dims, memo) : credit(ACCOUNT.DISPOSAL_LOSS, -lossOrGain, a.dims, memo),
    credit(ACCOUNT.FIXED_ASSETS, cost, a.dims, memo),
  ]);
}

/**
 * A supplier who is also a customer: what they owe us is cancelled against what we owe
 * them. Payables down, Receivables down, no cash or bank. Each side may span divisions,
 * so it is given as parts; the two totals must be equal.
 */
export function partySetoffEntry(d: {
  id: number;
  setoffNo: string;
  date: string;
  partyName: string;
  payableParts: { amount: string; dims: Dimensions }[];
  receivableParts: { amount: string; dims: Dimensions }[];
}): JournalDraft {
  const memo = `Set-off ${d.setoffNo} with ${d.partyName}`;
  const pay = d.payableParts.map((p) => ({ amount: parseMoney(p.amount), dims: p.dims }));
  const rec = d.receivableParts.map((p) => ({ amount: parseMoney(p.amount), dims: p.dims }));
  const sum = (xs: { amount: bigint }[]) => xs.reduce((s, x) => s + x.amount, 0n);
  if (sum(pay) !== sum(rec) || sum(pay) <= 0n) throw new Error("the two sides of the set-off do not match");
  return makeDraft("PARTY_SETOFF", d.id, d.date, memo, [
    ...pay.map((p) => debit(ACCOUNT.PAYABLES, p.amount, p.dims, memo)),
    ...rec.map((p) => credit(ACCOUNT.RECEIVABLES, p.amount, p.dims, memo)),
  ]);
}

/**
 * An adjustment the owner records on the auditor's advice. The lines are
 * whatever the auditor asked for; the entry must balance and have two or more lines.
 */
export function auditorAdjustmentEntry(adj: {
  id: number;
  adjustmentNo: string;
  date: string;
  reason: string;
  lines: { accountCode: string; debit: string; credit: string; memo: string; dims: Dimensions }[];
}): JournalDraft {
  const memo = `Auditor adjustment ${adj.adjustmentNo}: ${adj.reason}`;
  const lines = adj.lines.map((l) => {
    const d = parseMoney(l.debit || "0");
    const c = parseMoney(l.credit || "0");
    if (d > 0n && c > 0n) throw new Error(`${l.accountCode}: a line is either a debit or a credit, not both`);
    return d > 0n
      ? debit(l.accountCode, d, l.dims, l.memo || memo)
      : credit(l.accountCode, c, l.dims, l.memo || memo);
  });
  return makeDraft("AUDITOR_ADJUSTMENT", adj.id, adj.date, memo, lines);
}

export function purchaseReceiptEntry(purchase: {
  id: number;
  purchaseNo: string;
  date: string;
  dims: Dimensions;
  total: string;
  /** Input credit inside the supplier's bill (regular GST supplier only). */
  credit?: GstAmounts;
}): JournalDraft {
  const total = parseMoney(purchase.total);
  const c = gstPaise(purchase.credit);
  const memo = `Purchase ${purchase.purchaseNo}`;

  return makeDraft("PURCHASE_RECEIPT", purchase.id, purchase.date, memo, [
    debit(ACCOUNT.INVENTORY, total - c.total, purchase.dims, memo),
    debit(ACCOUNT.GST_INPUT_CGST, c.cgst, purchase.dims, `${memo} GST input credit`),
    debit(ACCOUNT.GST_INPUT_SGST, c.sgst, purchase.dims, `${memo} GST input credit`),
    debit(ACCOUNT.GST_INPUT_IGST, c.igst, purchase.dims, `${memo} GST input credit`),
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
    credit(settlementAccount(payment.settlement), amount, lineDims(payment.settlement, payment.dims), memo),
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
  /** ITC: GST inside the bill comes back as input credit. RCM: the business owes the GST itself and claims it back. */
  gst?: { mode: "ITC" | "RCM"; amounts: GstAmounts };
}): JournalDraft {
  const amount = parseMoney(expense.amount);
  const g = gstPaise(expense.gst?.amounts);
  const itc = expense.gst?.mode === "ITC";
  const rcm = expense.gst?.mode === "RCM";
  const memo = expense.isSetupCost
    ? `Set-up cost ${expense.expenseNo} (${expense.category})`
    : `Expense ${expense.expenseNo} (${expense.category})`;
  const expenseAccount = expense.isSetupCost
    ? ACCOUNT.SETUP_COSTS
    : expenseAccountForCategory(expense.category);

  return makeDraft("EXPENSE", expense.id, expense.date, memo, [
    debit(expenseAccount, itc ? amount - g.total : amount, expense.dims, memo),
    debit(ACCOUNT.GST_INPUT_CGST, g.cgst, expense.dims, `${memo} GST input credit`),
    debit(ACCOUNT.GST_INPUT_SGST, g.sgst, expense.dims, `${memo} GST input credit`),
    debit(ACCOUNT.GST_INPUT_IGST, g.igst, expense.dims, `${memo} GST input credit`),
    credit(ACCOUNT.ACCRUED_EXPENSES, amount, expense.dims, memo),
    credit(ACCOUNT.GST_RCM_PAYABLE, rcm ? g.total : 0n, expense.dims, `${memo} GST on reverse charge`),
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
    credit(settlementAccount(payment.settlement), amount, lineDims(payment.settlement, payment.dims), memo),
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
    credit(settlementAccount(deposit.settlement), amount, lineDims(deposit.settlement, deposit.dims), memo),
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
    debit(settlementAccount(refund.settlement), amount, lineDims(refund.settlement, refund.dims), memo),
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
  /** Everything owed to the customer for this return, including any delivery charge handed back. */
  refundValue: string;
  /** The part of refundValue that is the delivery charge (0 when it is not given back). */
  deliveryValue?: string;
  restockCost: string;
  damagedCost: string;
  /** GST given back (credit note): all of it, and the part that is on the delivery charge. */
  tax?: GstAmounts;
  deliveryTax?: string;
}): JournalDraft {
  const t = gstPaise(ret.tax);
  const deliveryTax = parseMoney(ret.deliveryTax || "0");
  const gross = parseMoney(ret.grossValue);
  const delivery = parseMoney(ret.deliveryValue ?? "0");
  const refund = parseMoney(ret.refundValue) - delivery;
  const restock = parseMoney(ret.restockCost);
  const damaged = parseMoney(ret.damagedCost);
  const memo = `Return ${ret.returnNo} against invoice ${ret.invoiceNo}`;

  if (refund > gross) {
    throw new Error(`Return ${ret.returnNo}: refund value exceeds the selling value`);
  }

  return makeDraft("SALES_RETURN", ret.id, ret.date, memo, [
    debit(ACCOUNT.SALES_RETURNS, gross - (t.total - deliveryTax), ret.dims, memo),
    debit(ACCOUNT.DELIVERY_INCOME, delivery - deliveryTax, ret.dims, `${memo} delivery`),
    debit(ACCOUNT.GST_OUTPUT_CGST, t.cgst, ret.dims, `${memo} GST given back`),
    debit(ACCOUNT.GST_OUTPUT_SGST, t.sgst, ret.dims, `${memo} GST given back`),
    debit(ACCOUNT.GST_OUTPUT_IGST, t.igst, ret.dims, `${memo} GST given back`),
    credit(ACCOUNT.SALES_DISCOUNTS, gross - refund, ret.dims, memo),
    credit(ACCOUNT.RECEIVABLES, refund + delivery, ret.dims, memo),
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
    credit(settlementAccount(refund.settlement), amount, lineDims(refund.settlement, refund.dims), memo),
  ]);
}

/** Extra stock found at a count: stock goes up and the lost-stock cost goes down by the same amount. */
export function stockFindEntry(find: { id: number; date: string; cost: string; dims: Dimensions }): JournalDraft {
  const cost = parseMoney(find.cost);
  const memo = `Stock found at count (record ${find.id})`;
  return makeDraft("STOCK_FIND", find.id, find.date, memo, [
    debit(ACCOUNT.INVENTORY, cost, find.dims, memo),
    credit(ACCOUNT.DAMAGED_STOCK, cost, find.dims, memo),
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
  /** Input credit taken back with the goods (debit note). `costValue` is then the stock value without GST. */
  credit?: GstAmounts;
}): JournalDraft {
  const cost = parseMoney(ret.costValue);
  const agreed = parseMoney(ret.agreedValue);
  const c = gstPaise(ret.credit);
  if (agreed > cost + c.total) {
    throw new Error(`${ret.returnNo}: agreed value cannot be more than the cost of the goods`);
  }
  const memo = `Supplier return ${ret.returnNo}`;

  return makeDraft("SUPPLIER_RETURN", ret.id, ret.date, memo, [
    debit(ACCOUNT.PAYABLES, agreed, ret.dims, memo),
    debit(ACCOUNT.SUPPLIER_RETURN_LOSS, cost + c.total - agreed, ret.dims, memo),
    credit(ACCOUNT.INVENTORY, cost, ret.dims, memo),
    credit(ACCOUNT.GST_INPUT_CGST, c.cgst, ret.dims, `${memo} GST input credit taken back`),
    credit(ACCOUNT.GST_INPUT_SGST, c.sgst, ret.dims, `${memo} GST input credit taken back`),
    credit(ACCOUNT.GST_INPUT_IGST, c.igst, ret.dims, `${memo} GST input credit taken back`),
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
    debit(settlementAccount(refund.settlement), amount, lineDims(refund.settlement, refund.dims), memo),
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

/**
 * GST paid for a return period. Regular: the GST owed on sales is cleared partly by input credit and
 * partly by cash; reverse-charge GST is always cash. Composition: the quarter's tax is a cost.
 */
export function gstPaymentEntry(p: {
  id: number;
  paymentNo: string;
  date: string;
  dims: Dimensions;
  settled: GstAmounts;
  credit: GstAmounts;
  rcmCash: string;
  compositionTax: string;
  interestFee: string;
  cashTotal: string;
  settlement: Settlement;
}): JournalDraft {
  const settled = gstPaise(p.settled);
  const used = gstPaise(p.credit);
  const rcm = parseMoney(p.rcmCash || "0");
  const comp = parseMoney(p.compositionTax || "0");
  const fee = parseMoney(p.interestFee || "0");
  const cash = parseMoney(p.cashTotal);
  const memo = `GST paid ${p.paymentNo}`;
  if (settled.total - used.total + rcm + comp + fee !== cash) {
    throw new Error(`${p.paymentNo}: GST settled less credit used, plus reverse charge, composition tax and fees, does not equal the cash paid`);
  }
  return makeDraft("GST_PAYMENT", p.id, p.date, memo, [
    debit(ACCOUNT.GST_OUTPUT_CGST, settled.cgst, p.dims, memo),
    debit(ACCOUNT.GST_OUTPUT_SGST, settled.sgst, p.dims, memo),
    debit(ACCOUNT.GST_OUTPUT_IGST, settled.igst, p.dims, memo),
    debit(ACCOUNT.GST_RCM_PAYABLE, rcm, p.dims, `${memo} reverse charge`),
    debit(ACCOUNT.GST_COMPOSITION, comp, p.dims, `${memo} composition tax`),
    debit(ACCOUNT.GST_INTEREST_FEES, fee, p.dims, `${memo} interest and late fee`),
    credit(ACCOUNT.GST_INPUT_CGST, used.cgst, p.dims, `${memo} input credit used`),
    credit(ACCOUNT.GST_INPUT_SGST, used.sgst, p.dims, `${memo} input credit used`),
    credit(ACCOUNT.GST_INPUT_IGST, used.igst, p.dims, `${memo} input credit used`),
    credit(settlementAccount(p.settlement), cash, lineDims(p.settlement, p.dims), memo),
  ]);
}

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
