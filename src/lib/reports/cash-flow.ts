/** Cash flow statement rules (pure): which kind of entry is which kind of money movement. */

export type FlowSection = "OPERATING" | "INVESTING" | "FINANCING" | "OTHER";

export type FlowKind = { section: FlowSection; label: string; order: number };

const KINDS: Record<string, FlowKind> = {
  SALES_RECEIPT: { section: "OPERATING", label: "Received from customers", order: 1 },
  SALES_REFUND: { section: "OPERATING", label: "Refunded to customers", order: 2 },
  PURCHASE_PAYMENT: { section: "OPERATING", label: "Paid to suppliers", order: 3 },
  SUPPLIER_REFUND: { section: "OPERATING", label: "Refunds received from suppliers", order: 4 },
  EXPENSE_PAYMENT: { section: "OPERATING", label: "Running costs and set-up costs paid", order: 5 },
  OPENING_BALANCE: { section: "OTHER", label: "Opening balances entered", order: 1 },
  DEPOSIT_PAID: { section: "INVESTING", label: "Shop deposits paid", order: 1 },
  DEPOSIT_REFUND: { section: "INVESTING", label: "Shop deposits refunded", order: 2 },
};

/** Entries that bring money in or out of the business from its owners and lenders. */
const FINANCING = /FUNDING|INVESTOR|CAPITAL|LOAN|DRAWING|PROFIT_PAYOUT|DISTRIBUTION/;

export function classifyFlow(sourceType: string | null): FlowKind {
  if (sourceType && KINDS[sourceType]) return KINDS[sourceType];
  if (sourceType && FINANCING.test(sourceType) && sourceType !== "SETUP_CAPITALISATION") {
    return { section: "FINANCING", label: "Owner and investor money in or out", order: 1 };
  }
  return { section: "OTHER", label: "Other entries and corrections", order: 2 };
}

export type FlowRow = { sourceType: string | null; netPaise: bigint };
export type FlowLine = { label: string; paise: bigint };
export type FlowSectionResult = { section: FlowSection; title: string; lines: FlowLine[]; total: bigint };

const TITLES: Record<FlowSection, string> = {
  OPERATING: "Day-to-day business",
  INVESTING: "Deposits and long-term spending",
  FINANCING: "Owner and investor money",
  OTHER: "Other entries",
};
const SECTION_ORDER: FlowSection[] = ["OPERATING", "INVESTING", "FINANCING", "OTHER"];

/**
 * Groups the movement of cash and bank money in a period. Everything that
 * moved is shown, so opening + movement always equals closing.
 */
export function buildCashFlow(rows: FlowRow[], openingPaise: bigint) {
  const bucket = new Map<string, { kind: FlowKind; paise: bigint }>();
  for (const r of rows) {
    const kind = classifyFlow(r.sourceType);
    const key = `${kind.section}|${kind.label}`;
    const cur = bucket.get(key) ?? { kind, paise: 0n };
    cur.paise += r.netPaise;
    bucket.set(key, cur);
  }
  const sections: FlowSectionResult[] = [];
  for (const section of SECTION_ORDER) {
    const items = [...bucket.values()]
      .filter((b) => b.kind.section === section && b.paise !== 0n)
      .sort((a, b) => a.kind.order - b.kind.order);
    if (items.length === 0) continue;
    sections.push({
      section,
      title: TITLES[section],
      lines: items.map((i) => ({ label: i.kind.label, paise: i.paise })),
      total: items.reduce((s, i) => s + i.paise, 0n),
    });
  }
  const movement = sections.reduce((s, x) => s + x.total, 0n);
  return { sections, movement, openingPaise, closingPaise: openingPaise + movement };
}
