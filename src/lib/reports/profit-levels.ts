/**
 * Profit at group / division / branch level, from posted ledger lines.
 * Pure (no database access) so it can be tested on its own.
 *
 * Levels:
 *   gross     = sales - discounts - cost of goods sold
 *   operating = gross - running expenses
 *   net       = operating - set-up costs
 *
 * A ledger line counts at the most specific place it names:
 *   branch line   -> that branch, its division, and the group
 *   division line -> that division and the group
 *   neither       -> the group only
 */

export const SETUP_ACCOUNT = "6900";

export type LedgerTotal = {
  accountCode: string;
  divisionId: number | null;
  branchId: number | null;
  debit: bigint; // paise
  credit: bigint; // paise
};

export type ProfitFigures = {
  sales: bigint;
  /** All contra-sales: discounts and returns together. */
  discounts: bigint;
  /** Part of `discounts` that is customer returns (account 4210). */
  returns: bigint;
  /** All cost of goods: normal cost plus damaged stock. */
  costOfGoods: bigint;
  /** Part of `costOfGoods` that is damaged and lost stock (account 5150). */
  damagedStock: bigint;
  gross: bigint;
  runningExpenses: bigint;
  operating: bigint;
  setupCosts: bigint;
  net: bigint;
};

export type ScopeProfit = {
  scope: "GROUP" | "DIVISION" | "BRANCH";
  divisionId: number | null;
  branchId: number | null;
  figures: ProfitFigures;
};

type Raw = {
  sales: bigint;
  discounts: bigint;
  returns: bigint;
  costOfGoods: bigint;
  damaged: bigint;
  running: bigint;
  setup: bigint;
};

const empty = (): Raw => ({ sales: 0n, discounts: 0n, returns: 0n, costOfGoods: 0n, damaged: 0n, running: 0n, setup: 0n });

function add(target: Raw, line: LedgerTotal) {
  const code = line.accountCode;
  const credit = line.credit - line.debit;
  const debit = line.debit - line.credit;

  if (code === "4000" || code === "4300") target.sales += credit; // 4300 = delivery charged to customers
  else if (code.startsWith("4")) {
    target.discounts += debit; // 4200, 4210 and any other contra-sales
    if (code === "4210") target.returns += debit;
  } else if (code.startsWith("5")) {
    target.costOfGoods += debit;
    if (code === "5150") target.damaged += debit;
  }
  else if (code === SETUP_ACCOUNT) target.setup += debit;
  else if (code.startsWith("6")) target.running += debit;
}

function figures(raw: Raw): ProfitFigures {
  const gross = raw.sales - raw.discounts - raw.costOfGoods;
  const operating = gross - raw.running;
  return {
    sales: raw.sales,
    discounts: raw.discounts,
    returns: raw.returns,
    costOfGoods: raw.costOfGoods,
    damagedStock: raw.damaged,
    gross,
    runningExpenses: raw.running,
    operating,
    setupCosts: raw.setup,
    net: operating - raw.setup,
  };
}

/**
 * @param divisionOfBranch maps each branch id to its division, so branch
 *        totals still roll up if a line has a branch but no division.
 */
export function profitByScope(
  lines: LedgerTotal[],
  divisionOfBranch: Map<number, number>
): ScopeProfit[] {
  const group = empty();
  const divisions = new Map<number, Raw>();
  const branches = new Map<number, Raw>();

  const get = (map: Map<number, Raw>, id: number) => {
    let raw = map.get(id);
    if (!raw) map.set(id, (raw = empty()));
    return raw;
  };

  for (const line of lines) {
    add(group, line);
    const divisionId =
      line.divisionId ??
      (line.branchId !== null ? divisionOfBranch.get(line.branchId) ?? null : null);
    if (divisionId !== null) add(get(divisions, divisionId), line);
    if (line.branchId !== null) add(get(branches, line.branchId), line);
  }

  const result: ScopeProfit[] = [
    { scope: "GROUP", divisionId: null, branchId: null, figures: figures(group) },
  ];
  for (const [id, raw] of [...divisions].sort((a, b) => a[0] - b[0])) {
    result.push({ scope: "DIVISION", divisionId: id, branchId: null, figures: figures(raw) });
  }
  for (const [id, raw] of [...branches].sort((a, b) => a[0] - b[0])) {
    result.push({
      scope: "BRANCH",
      divisionId: divisionOfBranch.get(id) ?? null,
      branchId: id,
      figures: figures(raw),
    });
  }
  return result;
}

export type BalanceSheet = {
  assets: { code: string; amount: bigint }[];
  liabilities: { code: string; amount: bigint }[];
  capital: { code: string; amount: bigint }[];
  profitToDate: bigint;
  totalAssets: bigint;
  totalLiabilitiesAndCapital: bigint;
};

/** Balance sheet from cumulative ledger totals per account (all dates up to the report date). */
export function balanceSheet(totals: { accountCode: string; debit: bigint; credit: bigint }[]): BalanceSheet {
  const assets: BalanceSheet["assets"] = [];
  const liabilities: BalanceSheet["liabilities"] = [];
  const capital: BalanceSheet["capital"] = [];
  let profit = 0n;

  for (const t of totals) {
    const net = t.debit - t.credit;
    const first = t.accountCode[0];
    if (first === "1") assets.push({ code: t.accountCode, amount: net });
    else if (first === "2") liabilities.push({ code: t.accountCode, amount: -net });
    else if (first === "3") capital.push({ code: t.accountCode, amount: -net });
    else profit += -net; // revenue positive, expenses negative
  }

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0n);
  const totalLiabilitiesAndCapital =
    liabilities.reduce((s, a) => s + a.amount, 0n) +
    capital.reduce((s, a) => s + a.amount, 0n) +
    profit;

  return { assets, liabilities, capital, profitToDate: profit, totalAssets, totalLiabilitiesAndCapital };
}
