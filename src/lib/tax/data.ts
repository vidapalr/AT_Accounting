import "server-only";

/**
 * Reading the year-end and income-tax figures from the database. The sums and rules live in the
 * pure modules next to this file (advance-tax, it-depreciation, loan-schedule, form168).
 */
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";
import { businessSettings } from "@/lib/business-settings";
import { getBalanceReport, getDailySeries, getProfitReport } from "@/lib/reports/report-data";
import { toPaise } from "@/lib/reports/money";
import { ACCOUNT } from "@/lib/ledger/posting-rules";
import { loadSupplierEvents } from "@/lib/supplier-ledger";
import { effectOf } from "@/lib/supplier-statement";
import { estimateTax, planInstalments, projectYearProfit, type CompanyScheme, type LegalForm, type Regime } from "./advance-tax";
import { ASSET_BLOCKS, DEFAULT_IT_RATES, itDepreciation, type AssetBlock, type TaxAsset } from "./it-depreciation";
import { loanSchedule, yearTotals } from "./loan-schedule";
import { matchChallans, nameKey, type TaxPaidLine } from "./form168";
import { taxYearRange } from "./tax-year";
import { monthTotals, panOf } from "./year-figures";

type Row = RowDataPacket & Record<string, string | number | null>;

/** Settings read by the tax screens. Per-year keys carry the year at the end. */
export const TAX_KEYS = ["tax_regime", "tax_presumptive", "tax_company_scheme", "tax_audited", "it_wdv_year", ...ASSET_BLOCKS.map((b) => `it_rate_${b}`), ...ASSET_BLOCKS.map((b) => `it_wdv_${b}`)];
export const yearKeys = (year: number) => [`tax_estimate_${year}`, `tax_optout_ack_${year}`];

export type TaxSettings = {
  legalForm: LegalForm;
  regime: Regime;
  presumptive: boolean;
  companyScheme: CompanyScheme;
  audited: boolean;
  /** Owner's own estimate of the year's profit, overriding the projection. */
  estimate: bigint | null;
  optOutAck: string;
  rates: Record<AssetBlock, number>;
  opening: { taxYear: number; wdv: Partial<Record<AssetBlock, bigint>> } | null;
};

export async function loadTaxSettings(businessId: number, year: number): Promise<TaxSettings> {
  const [biz] = await db.query<Row[]>(`SELECT legal_form FROM acct_legal_businesses WHERE id = ?`, [businessId]);
  const s = await businessSettings(businessId, [...TAX_KEYS, ...yearKeys(year)]);
  const rates = { ...DEFAULT_IT_RATES };
  for (const b of ASSET_BLOCKS) {
    const n = Number(s[`it_rate_${b}`]);
    if (s[`it_rate_${b}`] && Number.isFinite(n) && n >= 0 && n <= 100) rates[b] = n;
  }
  const wdvYear = Number(s.it_wdv_year);
  const wdv: Partial<Record<AssetBlock, bigint>> = {};
  for (const b of ASSET_BLOCKS) if (s[`it_wdv_${b}`]) wdv[b] = toPaise(s[`it_wdv_${b}`]);
  const est = s[`tax_estimate_${year}`];
  return {
    legalForm: (String(biz[0]?.legal_form ?? "PROPRIETORSHIP") as LegalForm),
    regime: s.tax_regime === "OLD" ? "OLD" : "NEW",
    presumptive: s.tax_presumptive === "1",
    companyScheme: s.tax_company_scheme === "25" || s.tax_company_scheme === "30" ? s.tax_company_scheme : "22",
    audited: s.tax_audited === "1",
    estimate: est ? toPaise(est) : null,
    optOutAck: s[`tax_optout_ack_${year}`] ?? "",
    rates,
    opening: Number.isInteger(wdvYear) && wdvYear > 2000 ? { taxYear: wdvYear, wdv } : null,
  };
}

/** Runs a query on a table added by migration 089; an empty list when it has not been run yet. */
async function rows089(sql: string, params: unknown[]): Promise<Row[]> {
  try {
    const [r] = await db.query<Row[]>(sql, params);
    return r;
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export async function taxTablesReady(): Promise<boolean> {
  try {
    await db.query(`SELECT 1 FROM acct_tax_challans LIMIT 1`);
    return true;
  } catch (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
}

export type Challan = { id: number; kind: string; paidOn: string; amount: bigint; bsrCode: string | null; serial: string | null; note: string };

export async function loadChallans(businessId: number, year: number): Promise<Challan[]> {
  const r = await rows089(
    `SELECT id, kind, DATE_FORMAT(paid_on, '%Y-%m-%d') AS paid_on, amount, bsr_code, challan_serial, note
       FROM acct_tax_challans WHERE legal_business_id = ? AND tax_year = ? AND status = 'ACTIVE' ORDER BY paid_on, id`,
    [businessId, year]
  );
  return r.map((c) => ({ id: Number(c.id), kind: String(c.kind), paidOn: String(c.paid_on), amount: toPaise(c.amount), bsrCode: c.bsr_code ? String(c.bsr_code) : null, serial: c.challan_serial ? String(c.challan_serial) : null, note: String(c.note ?? "") }));
}

export type StatementTds = { deductor: string; tan: string; amountPaid: bigint; tds: bigint };

export async function loadStatement(businessId: number, year: number): Promise<{ tds: StatementTds[]; taxPaid: TaxPaidLine[]; readAt: string | null }> {
  const r = await rows089(
    `SELECT line_kind, party_name, tan, amount_paid, tax_amount, bsr_code, challan_serial,
            DATE_FORMAT(deposit_date, '%Y-%m-%d') AS deposit_date, minor_head, DATE_FORMAT(read_at, '%Y-%m-%d') AS read_at
       FROM acct_tax_statement_lines WHERE legal_business_id = ? AND tax_year = ? ORDER BY id`,
    [businessId, year]
  );
  return {
    tds: r.filter((x) => x.line_kind === "TDS").map((x) => ({ deductor: String(x.party_name ?? ""), tan: String(x.tan ?? ""), amountPaid: toPaise(x.amount_paid), tds: toPaise(x.tax_amount) })),
    taxPaid: r.filter((x) => x.line_kind === "TAX_PAID").map((x) => ({ bsrCode: String(x.bsr_code ?? ""), date: String(x.deposit_date ?? ""), serial: String(x.challan_serial ?? ""), amount: toPaise(x.tax_amount), minorHead: x.minor_head ? String(x.minor_head) : null })),
    readAt: r[0]?.read_at ? String(r[0].read_at) : null,
  };
}

/** Profit in the books for the tax year up to today, and the year's tax plan. */
export async function advanceTaxPlan(businessId: number, year: number, today: string) {
  const settings = await loadTaxSettings(businessId, year);
  const { from, to } = taxYearRange(year);
  const upTo = today < to ? today : to;
  const started = today >= from;
  const group = started ? (await getProfitReport(db, businessId, from, upTo)).find((s) => s.scope === "GROUP") : undefined;
  const profitSoFar = group?.figures.net ?? 0n;
  const projection = started ? projectYearProfit(profitSoFar, year, upTo) : { projected: 0n, share: 0 };
  const income = settings.estimate ?? projection.projected;
  const tax = estimateTax({ legalForm: settings.legalForm, income, taxYear: year, regime: settings.regime, companyScheme: settings.companyScheme });
  const statement = await loadStatement(businessId, year);
  const tdsCredit = statement.tds.reduce((t, x) => t + x.tds, 0n);
  const challans = await loadChallans(businessId, year);
  const advance = challans.filter((c) => c.kind === "ADVANCE");
  const plan = planInstalments({
    taxYear: year,
    netTax: tax.total - tdsCredit,
    presumptive: settings.presumptive,
    payments: advance.map((c) => ({ date: c.paidOn, amount: c.amount })),
    today,
  });
  return { settings, profitSoFar, projection, income, tax, tdsCredit, plan, challans, statement };
}

/** Challans in the app against the tax-paid lines of the statement; TDS lines against customers. */
export async function statementCheck(businessId: number, year: number) {
  const statement = await loadStatement(businessId, year);
  const challans = await loadChallans(businessId, year);
  const challanMatch = matchChallans(challans.map((c) => ({ id: c.id, paidOn: c.paidOn, amount: c.amount, bsrCode: c.bsrCode, serial: c.serial })), statement.taxPaid);
  const { from, to } = taxYearRange(year);
  const [customers] = await db.query<Row[]>(
    `SELECT c.id, c.full_name, COALESCE(SUM(s.grand_total), 0) AS sales
       FROM acct_customers c
       LEFT JOIN acct_sales_headers s ON s.legal_business_id = c.legal_business_id AND s.customer_id = c.id
            AND s.status = 'POSTED' AND s.invoice_date BETWEEN ? AND ?
      WHERE c.legal_business_id = ?
      GROUP BY c.id, c.full_name`,
    [from, to, businessId]
  );
  const byKey = new Map(customers.map((c) => [nameKey(String(c.full_name)), c]));
  const tdsRows = statement.tds.map((t) => {
    const c = byKey.get(nameKey(t.deductor));
    return { ...t, customer: c ? String(c.full_name) : null, salesInBooks: c ? toPaise(c.sales) : null };
  });
  return { statement, challans, challanMatch, tdsRows };
}

export type Loan = {
  id: number;
  code: string;
  lender: string;
  kind: string;
  accountNo: string;
  takenOn: string;
  principal: bigint;
  rateBps: number;
  months: number;
  firstMonth: string | null;
  emi: bigint | null;
  status: string;
  note: string;
};

export async function loadLoans(businessId: number, year: number) {
  const r = await rows089(
    `SELECT id, loan_code, lender_name, loan_kind, lender_account_no, DATE_FORMAT(taken_on, '%Y-%m-%d') AS taken_on,
            principal, rate_bps, tenure_months, first_emi_month, emi, status, note
       FROM acct_loans WHERE legal_business_id = ? ORDER BY status, taken_on, id`,
    [businessId]
  );
  const figs = await rows089(
    `SELECT loan_id, certified_interest, certified_principal, certified_closing FROM acct_loan_year_figures WHERE legal_business_id = ? AND tax_year = ?`,
    [businessId, year]
  );
  const figBy = new Map(figs.map((f) => [Number(f.loan_id), f]));
  return r.map((x) => {
    const loan: Loan = {
      id: Number(x.id),
      code: String(x.loan_code),
      lender: String(x.lender_name),
      kind: String(x.loan_kind),
      accountNo: String(x.lender_account_no ?? ""),
      takenOn: String(x.taken_on),
      principal: toPaise(x.principal),
      rateBps: Number(x.rate_bps),
      months: Number(x.tenure_months),
      firstMonth: x.first_emi_month ? String(x.first_emi_month) : null,
      emi: x.emi === null ? null : toPaise(x.emi),
      status: String(x.status),
      note: String(x.note ?? ""),
    };
    const hasSchedule = loan.months > 0 && !!loan.firstMonth && loan.kind !== "OVERDRAFT";
    const schedule = hasSchedule ? loanSchedule({ principal: loan.principal, rateBps: loan.rateBps, months: loan.months, firstMonth: loan.firstMonth!, instalment: loan.emi }) : [];
    const ours = hasSchedule ? yearTotals(schedule, year) : null;
    const f = figBy.get(loan.id);
    const certified = f
      ? {
          interest: f.certified_interest === null ? null : toPaise(f.certified_interest),
          principal: f.certified_principal === null ? null : toPaise(f.certified_principal),
          closing: f.certified_closing === null ? null : toPaise(f.certified_closing),
        }
      : null;
    return { loan, schedule, ours, certified };
  });
}

export async function loadItDepreciation(businessId: number, year: number) {
  const settings = await loadTaxSettings(businessId, year);
  const [r] = await db.query<Row[]>(
    `SELECT category, DATE_FORMAT(purchase_date, '%Y-%m-%d') AS purchase_date, cost,
            DATE_FORMAT(disposed_on, '%Y-%m-%d') AS disposed_on, proceeds
       FROM acct_fixed_assets WHERE legal_business_id = ?`,
    [businessId]
  );
  const firstYear = settings.opening?.taxYear ?? null;
  const assets: TaxAsset[] = r
    .map((a) => ({
      block: (ASSET_BLOCKS as readonly string[]).includes(String(a.category)) ? (String(a.category) as AssetBlock) : "OTHER",
      purchaseDate: String(a.purchase_date),
      cost: toPaise(a.cost),
      disposedOn: a.disposed_on ? String(a.disposed_on) : null,
      proceeds: toPaise(a.proceeds),
    }))
    // Assets bought before the opening year are already inside the opening values.
    .filter((a) => firstYear === null || a.purchaseDate >= `${firstYear}-04-01`);
  const result = itDepreciation({ assets, rates: settings.rates, opening: settings.opening, taxYear: year });
  return { ...result, settings, assetCount: assets.length };
}

export type StockLine = { sku: string; name: string; qty: number; value: bigint; unitCost: bigint; sellingPrice: bigint | null };

/** Stock in hand at cost on a date (31 March for the year end), item by item, and the books' stock account. */
export async function closingStock(businessId: number, asAt: string) {
  const [r] = await db.query<Row[]>(
    `SELECT v.sku, p.product_name, v.size_label, v.color_name, v.shop_price,
            SUM(m.quantity_change) AS qty,
            SUM(CASE WHEN m.quantity_change < 0 THEN -ROUND(m.total_cost * 100) ELSE ROUND(m.total_cost * 100) END) AS paise
       FROM acct_stock_movements m
       JOIN acct_product_variants v ON v.id = m.variant_id AND v.legal_business_id = m.legal_business_id
       JOIN acct_products p ON p.id = v.product_id AND p.legal_business_id = v.legal_business_id
      WHERE m.legal_business_id = ? AND m.movement_date <= ?
        AND m.movement_type NOT IN ('TRANSFER_OUT','TRANSFER_IN')
      GROUP BY v.id, v.sku, p.product_name, v.size_label, v.color_name, v.shop_price
     HAVING qty <> 0 OR paise <> 0
      ORDER BY p.product_name, v.sku`,
    [businessId, asAt]
  );
  const lines: StockLine[] = r.map((x) => {
    const qty = Number(x.qty);
    const value = BigInt(String(x.paise ?? 0));
    return {
      sku: String(x.sku),
      name: [x.product_name, x.size_label, x.color_name].filter(Boolean).join(" · "),
      qty,
      value,
      unitCost: qty > 0 ? (value * 1000n) / BigInt(Math.max(1, Math.round(qty * 1000))) : 0n,
      sellingPrice: x.shop_price === null ? null : toPaise(x.shop_price),
    };
  });
  const total = lines.reduce((t, l) => t + l.value, 0n);
  const balance = await getBalanceReport(db, businessId, asAt);
  const books = balance.accounts.filter((a) => a.standard === ACCOUNT.INVENTORY).reduce((t, a) => t + a.debit - a.credit, 0n);
  // Selling below cost: the stock may have to be valued at the lower selling price.
  const belowCost = lines.filter((l) => l.qty > 0 && l.sellingPrice !== null && l.sellingPrice < l.unitCost);
  return { lines, total, books, belowCost };
}

export async function turnoverByMonth(businessId: number, year: number) {
  const { from, to } = taxYearRange(year);
  const series = await getDailySeries(db, businessId, from, to);
  return monthTotals(series, year, (p) => p.sales);
}

export type PartyBalance = { id: number; name: string; phone: string; gstin: string; pan: string | null; panFromGstin: boolean; amount: bigint };

/** Customers who owe money on a date. */
export async function debtorsAt(businessId: number, asAt: string): Promise<PartyBalance[]> {
  const panCol = (await taxTablesReady()) ? "c.pan" : "NULL";
  const [r] = await db.query<Row[]>(
    `SELECT c.id, c.full_name, c.phone, c.gstin, ${panCol} AS pan,
            COALESCE((SELECT SUM(ROUND(s.grand_total * 100)) FROM acct_sales_headers s
                       WHERE s.legal_business_id = c.legal_business_id AND s.customer_id = c.id
                         AND s.status = 'POSTED' AND s.invoice_date <= ?), 0) AS billed,
            COALESCE((SELECT SUM(ROUND(p.amount * 100)) FROM acct_sales_payments p
                        JOIN acct_sales_headers s ON s.id = p.sale_id AND s.legal_business_id = p.legal_business_id
                       WHERE p.legal_business_id = c.legal_business_id AND s.customer_id = c.id
                         AND s.status = 'POSTED' AND p.status = 'RECORDED' AND p.payment_date <= ?), 0) AS paid
       FROM acct_customers c
      WHERE c.legal_business_id = ?`,
    [asAt, asAt, businessId]
  );
  return r
    .map((c) => {
      const p = panOf(c.pan ? String(c.pan) : null, c.gstin ? String(c.gstin) : null);
      return { id: Number(c.id), name: String(c.full_name), phone: String(c.phone ?? ""), gstin: String(c.gstin ?? ""), pan: p.pan, panFromGstin: p.fromGstin, amount: BigInt(String(c.billed)) - BigInt(String(c.paid)) };
    })
    .filter((c) => c.amount !== 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

/** Suppliers the business owes on a date. */
export async function creditorsAt(businessId: number, asAt: string): Promise<PartyBalance[]> {
  const panCol = (await taxTablesReady()) ? "pan" : "NULL";
  const [r] = await db.query<Row[]>(`SELECT id, supplier_name, mobile, gstin, ${panCol} AS pan FROM acct_suppliers WHERE legal_business_id = ?`, [businessId]);
  const out: PartyBalance[] = [];
  for (const s of r) {
    const events = await loadSupplierEvents(db, businessId, Number(s.id));
    const amount = events.filter((e) => e.date <= asAt).reduce((t, e) => t + effectOf(e.kind, e.amount), 0n);
    if (amount === 0n) continue;
    const p = panOf(s.pan ? String(s.pan) : null, s.gstin ? String(s.gstin) : null);
    out.push({ id: Number(s.id), name: String(s.supplier_name), phone: String(s.mobile ?? ""), gstin: String(s.gstin ?? ""), pan: p.pan, panFromGstin: p.fromGstin, amount });
  }
  return out.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
}

export type TaxDocument = { id: number; kind: string; title: string; mime: string; size: number; uploadedAt: string; loanId: number | null; challanId: number | null };

export async function loadTaxDocuments(businessId: number, year: number): Promise<TaxDocument[]> {
  const r = await rows089(
    `SELECT id, doc_kind, title, mime_type, file_size, DATE_FORMAT(uploaded_at, '%Y-%m-%d') AS uploaded_at, loan_id, challan_id
       FROM acct_tax_documents WHERE legal_business_id = ? AND tax_year = ? AND status = 'ACTIVE' ORDER BY doc_kind, id`,
    [businessId, year]
  );
  return r.map((d) => ({ id: Number(d.id), kind: String(d.doc_kind), title: String(d.title), mime: String(d.mime_type), size: Number(d.file_size), uploadedAt: String(d.uploaded_at), loanId: d.loan_id === null ? null : Number(d.loan_id), challanId: d.challan_id === null ? null : Number(d.challan_id) }));
}

export const DOC_KIND_LABELS: Record<string, string> = {
  STATEMENT: "Annual tax statement (Form 168 / 26AS)",
  AIS: "Annual Information Statement (AIS)",
  TIS: "Taxpayer Information Summary (TIS)",
  TDS_CERTIFICATE: "TDS certificate from a customer",
  CHALLAN: "Tax challan receipt",
  LOAN_STATEMENT: "Loan statement",
  INTEREST_CERTIFICATE: "Loan interest certificate",
  REGIME_OPT_OUT: "Tax regime opt-out acknowledgement",
  RETURN: "Income tax return / acknowledgement",
  OTHER: "Other tax paper",
};
