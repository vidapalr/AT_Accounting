import "server-only";

/**
 * One download for the accountant at the year end: an Excel workbook with every year-end figure,
 * and the tax papers kept in the app, packed in a ZIP.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { isMissingTable } from "@/lib/db-errors";
import { getBrand } from "@/lib/brand";
import { readPrivateDocument } from "@/lib/document-storage";
import { loadJournals } from "@/lib/export/ledger-data";
import { getBalanceReport, getProfitReport } from "@/lib/reports/report-data";
import { toNumber, toPaise } from "@/lib/reports/money";
import { advanceTaxPlan, closingStock, creditorsAt, debtorsAt, DOC_KIND_LABELS, loadItDepreciation, loadLoans, loadTaxDocuments, statementCheck, turnoverByMonth } from "./data";
import { BLOCK_LABELS } from "./it-depreciation";
import { formNames, taxYearLabel, taxYearRange } from "./tax-year";
import { monthName } from "./year-figures";

type Row = RowDataPacket & Record<string, string | number | null>;
type Cell = string | number | null;
const MONEY = "#,##0.00;[Red]-#,##0.00";

/** One sheet: a title, a line saying what it is, a header row and the rows. Money columns are numbers. */
function sheet(book: ExcelJS.Workbook, name: string, title: string, about: string, header: string[], rows: Cell[][], money: number[], widths: number[]) {
  const ws = book.addWorksheet(name);
  ws.addRow([title]).font = { bold: true, size: 14 };
  ws.addRow([about]);
  ws.addRow([]);
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (const c of money) ws.getColumn(c).numFmt = MONEY;
  ws.views = [{ state: "frozen", ySplit: 4 }];
  return ws;
}

const n = toNumber;

export async function buildTaxPack(businessId: number, year: number, today: string): Promise<{ zip: Buffer; fileName: string }> {
  const brand = await getBrand(businessId);
  const names = formNames(year);
  const label = taxYearLabel(year);
  const { from, to } = taxYearRange(year);
  const upTo = today < to ? today : to;
  const book = new ExcelJS.Workbook();
  book.creator = brand.appName;
  const head = `${brand.groupName} · tax year ${label}`;

  // Summary and advance tax
  const plan = await advanceTaxPlan(businessId, year, today);
  const summary: Cell[][] = [
    ["Figures up to", upTo],
    ["Kind of business", plan.settings.legalForm],
    ["Net profit in the books", n(plan.profitSoFar)],
    ["Profit used for the tax estimate", n(plan.income)],
    ["Estimated income tax (with surcharge and cess)", n(plan.tax.total)],
    ["How it was worked out", plan.tax.basis],
    [`TDS taken by customers (${names.statementShort})`, n(plan.tdsCredit)],
    ["Advance tax due for the year (estimate)", n(plan.plan.netTax)],
    ["Advance tax paid", n(plan.plan.paidTotal)],
    ["Self-assessment and other tax paid", n(plan.challans.filter((c) => c.kind !== "ADVANCE").reduce((t, c) => t + c.amount, 0n))],
    ["Estimated interest for short instalments", n(plan.plan.interestTotal)],
    ["Tax regime (owner)", plan.settings.regime === "OLD" ? `Old (opt-out acknowledgement: ${plan.settings.optOutAck || "not saved"})` : "New (default)"],
    ["Presumptive income", plan.settings.presumptive ? "Yes" : "No"],
    ["Accounts audited", plan.settings.audited ? "Yes" : "No"],
    [],
    ["Instalment due", "Should be paid", "Paid by then", "Short"],
    ...plan.plan.rows.map((r) => [r.due, n(r.cumulativeDue), n(r.paidByDue), n(r.shortfall)] as Cell[]),
  ];
  const s = sheet(book, "Summary", head, `Year-end pack made on ${today}. Estimates are for planning; please confirm.`, ["Item", "Amount / answer"], summary, [], [48, 22, 18, 18]);
  s.getColumn(2).numFmt = MONEY;
  s.getColumn(3).numFmt = MONEY;
  s.getColumn(4).numFmt = MONEY;

  // Profit and loss for every level
  const profit = await getProfitReport(db, businessId, from, upTo);
  sheet(
    book,
    "Profit and loss",
    head,
    `Profit and loss ${from} to ${upTo}, for the group, each division and each branch.`,
    ["Level", "Sales", "Discounts and returns", "Cost of goods", "Gross profit", "Running expenses", "Operating profit", "Set-up costs", "Net profit"],
    profit.map((p) => [p.label, n(p.figures.sales), n(p.figures.discounts), n(p.figures.costOfGoods), n(p.figures.gross), n(p.figures.runningExpenses), n(p.figures.operating), n(p.figures.setupCosts), n(p.figures.net)]),
    [2, 3, 4, 5, 6, 7, 8, 9],
    [34, 16, 16, 16, 16, 16, 16, 16, 16]
  );

  // Balance sheet and trial balance at the year end
  const balance = await getBalanceReport(db, businessId, upTo);
  const bsRows: Cell[][] = [];
  const nameOf = (code: string) => balance.accounts.find((a) => a.standard === code)?.name ?? code;
  bsRows.push(["What the business owns", null]);
  for (const a of balance.sheet.assets) bsRows.push([nameOf(a.code), n(a.amount)]);
  bsRows.push(["Total", n(balance.sheet.totalAssets)], [], ["What the business owes", null]);
  for (const a of balance.sheet.liabilities) bsRows.push([nameOf(a.code), n(a.amount)]);
  bsRows.push([], ["Capital", null]);
  for (const a of balance.sheet.capital) bsRows.push([nameOf(a.code), n(a.amount)]);
  bsRows.push(["Profit to date", n(balance.sheet.profitToDate)], ["Total", n(balance.sheet.totalLiabilitiesAndCapital)]);
  sheet(book, "Balance sheet", head, `Balance sheet as at ${upTo}.`, ["Item", "Amount"], bsRows, [2], [44, 18]);
  sheet(
    book,
    "Trial balance",
    head,
    `Trial balance as at ${upTo}.`,
    ["Account code", "Account", "Type", "Debit", "Credit", "Balance (debit +)"],
    balance.accounts.map((a) => [a.code, a.name, a.subtype, n(a.debit), n(a.credit), n(a.debit - a.credit)]),
    [4, 5, 6],
    [14, 40, 16, 16, 16, 18]
  );

  // Day book
  const journals = await loadJournals(db, businessId, from, upTo);
  sheet(
    book,
    "Day book",
    head,
    `Every posted entry, ${from} to ${upTo}.`,
    ["Date", "Entry no", "Account code", "Account", "Details", "Debit", "Credit"],
    journals.flatMap((j) => j.lines.map((l) => [j.date, j.journalNo, l.accountCode, l.accountName, l.memo || j.description, n(l.debitPaise), n(l.creditPaise)] as Cell[])),
    [6, 7],
    [12, 22, 14, 34, 50, 16, 16]
  );

  // Turnover by month
  const turnover = await turnoverByMonth(businessId, year);
  sheet(book, "Sales by month", head, "Net sales after discounts and returns.", ["Month", "Sales"], [...turnover.map((m) => [monthName(m.month), n(m.amount)] as Cell[]), ["Year", n(turnover.reduce((t, m) => t + m.amount, 0n))]], [2], [16, 18]);

  // Debtors and creditors
  const [debtors, creditors] = await Promise.all([debtorsAt(businessId, upTo), creditorsAt(businessId, upTo)]);
  const partyRows = (rows: typeof debtors) => rows.map((r) => [r.name, r.phone, r.gstin, r.pan ?? "", n(r.amount)] as Cell[]);
  sheet(book, "Customers who owe", head, `Customers with unpaid bills at ${upTo} (minus = advance received).`, ["Name", "Phone", "GSTIN", "PAN", "Amount"], partyRows(debtors), [5], [34, 16, 20, 14, 16]);
  sheet(book, "Suppliers owed", head, `Suppliers the business owes at ${upTo} (minus = they owe the business).`, ["Name", "Phone", "GSTIN", "PAN", "Amount"], partyRows(creditors), [5], [34, 16, 20, 14, 16]);

  // Closing stock
  const stock = await closingStock(businessId, upTo);
  sheet(
    book,
    "Closing stock",
    head,
    `Stock in hand at cost on ${upTo}: ${stock.total / 100n} counted, ${stock.books / 100n} in the stock account.`,
    ["Item", "Code", "Quantity", "Cost each", "Value", "Selling price"],
    stock.lines.map((l) => [l.name, l.sku, l.qty, n(l.unitCost), n(l.value), l.sellingPrice === null ? null : n(l.sellingPrice)]),
    [4, 5, 6],
    [44, 18, 12, 14, 16, 14]
  );

  // Fixed assets: books register and income-tax depreciation
  const [assets] = await db.query<Row[]>(
    `SELECT asset_no, asset_name, category, DATE_FORMAT(purchase_date, '%Y-%m-%d') AS purchase_date, cost, life_months, status,
            DATE_FORMAT(disposed_on, '%Y-%m-%d') AS disposed_on, proceeds
       FROM acct_fixed_assets WHERE legal_business_id = ? ORDER BY purchase_date, id`,
    [businessId]
  );
  sheet(
    book,
    "Fixed assets",
    head,
    "Every fixed asset in the books.",
    ["Asset no", "Name", "Group", "Bought on", "Cost", "Life (months)", "Status", "Sold / scrapped on", "Sale money"],
    assets.map((a) => [String(a.asset_no), String(a.asset_name), String(a.category), String(a.purchase_date), n(toPaise(a.cost)), Number(a.life_months), String(a.status), a.disposed_on ? String(a.disposed_on) : "", n(toPaise(a.proceeds))]),
    [5, 9],
    [12, 34, 20, 12, 16, 12, 12, 16, 14]
  );
  const dep = await loadItDepreciation(businessId, year);
  sheet(
    book,
    "Tax depreciation",
    head,
    `Income-tax depreciation by group of assets, ${label}. Half rate for assets used under 180 days.`,
    ["Group", "Rate %", "Value at 1 April", "Bought (180+ days)", "Bought (under 180 days)", "Sold for", "Depreciation", "Value at 31 March", "Short-term capital gain"],
    dep.rows.map((r) => [BLOCK_LABELS[r.block], r.ratePct, n(r.opening), n(r.additionsFull), n(r.additionsHalf), n(r.sales), n(r.depreciation), n(r.closing), n(r.capitalGain)]),
    [3, 4, 5, 6, 7, 8, 9],
    [26, 8, 16, 16, 18, 14, 14, 16, 16]
  );

  // Loans
  const loans = await loadLoans(businessId, year);
  sheet(
    book,
    "Loans",
    head,
    `Loans and the interest for ${label}: worked out from the schedule, and from the lender's certificate.`,
    ["Loan", "Lender", "Kind", "Account no", "Taken on", "Amount", "Rate %", "Interest (worked out)", "Repaid (worked out)", "Owed at 31 March (worked out)", "Interest (certificate)", "Repaid (certificate)", "Owed (certificate)"],
    loans.map(({ loan, ours, certified }) => [loan.code, loan.lender, loan.kind, loan.accountNo, loan.takenOn, n(loan.principal), loan.rateBps / 100, ours ? n(ours.interest) : null, ours ? n(ours.principal) : null, ours ? n(ours.closing) : null, certified?.interest != null ? n(certified.interest) : null, certified?.principal != null ? n(certified.principal) : null, certified?.closing != null ? n(certified.closing) : null]),
    [6, 8, 9, 10, 11, 12, 13],
    [10, 26, 12, 18, 12, 14, 8, 16, 16, 18, 16, 16, 16]
  );

  // Tax paid and the tax statement
  const check = await statementCheck(businessId, year);
  sheet(
    book,
    "Tax paid",
    head,
    `Advance and self-assessment tax entered, and whether each is in ${names.statementShort}.`,
    ["Date", "Kind", "Amount", "BSR code", "Challan serial", "In the statement"],
    check.challans.map((c) => [c.paidOn, c.kind, n(c.amount), c.bsrCode ?? "", c.serial ?? "", check.challanMatch.matched.some((m) => m.book.id === c.id) ? "Yes" : check.statement.readAt ? "Not yet" : "Statement not read"]),
    [3],
    [12, 18, 16, 12, 14, 18]
  );
  sheet(
    book,
    "TDS by customers",
    head,
    `TDS lines from ${names.statementShort}${check.statement.readAt ? ` (read ${check.statement.readAt})` : " (not read yet)"}.`,
    ["Deducted by", "TAN", "Amount paid to us", "TDS", "Customer in books", "Their sales in books"],
    check.tdsRows.map((t) => [t.deductor, t.tan, n(t.amountPaid), n(t.tds), t.customer ?? "", t.salesInBooks === null ? null : n(t.salesInBooks)]),
    [3, 4, 6],
    [34, 14, 18, 14, 30, 18]
  );

  // Salaries (payroll), when payroll is in use
  try {
    const [pay] = await db.query<Row[]>(
      `SELECT e.full_name, e.pan, COUNT(*) AS months, SUM(p.gross) AS gross, SUM(p.emp_pf) AS pf, SUM(p.emp_esi) AS esi,
              SUM(p.emp_pt) AS pt, SUM(p.emp_tds) AS tds, SUM(p.net_pay) AS net,
              SUM(p.er_epf + p.er_eps + p.er_edli + p.er_pf_admin + p.er_esi) AS employer
         FROM acct_payslips p JOIN acct_employees e ON e.id = p.employee_id AND e.legal_business_id = p.legal_business_id
        WHERE p.legal_business_id = ? AND p.status = 'PAID' AND p.salary_month BETWEEN ? AND ?
        GROUP BY e.id, e.full_name, e.pan ORDER BY e.full_name`,
      [businessId, from.slice(0, 7), to.slice(0, 7)]
    );
    sheet(
      book,
      "Salaries",
      head,
      `Salaries paid through payroll in ${label}.`,
      ["Person", "PAN", "Months", "Gross", "PF", "ESI", "Professional tax", "TDS", "Net paid", "Employer PF and ESI"],
      pay.map((p) => [String(p.full_name), String(p.pan ?? ""), Number(p.months), n(toPaise(p.gross)), n(toPaise(p.pf)), n(toPaise(p.esi)), n(toPaise(p.pt)), n(toPaise(p.tds)), n(toPaise(p.net)), n(toPaise(p.employer))]),
      [4, 5, 6, 7, 8, 9, 10],
      [28, 14, 8, 16, 14, 14, 14, 14, 16, 16]
    );
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }

  const zip = new JSZip();
  zip.file(`${brand.fileSlug}-year-end-${label}.xlsx`, Buffer.from(await book.xlsx.writeBuffer()));

  const docs = await loadTaxDocuments(businessId, year);
  const [keys] = docs.length
    ? await db.query<Row[]>(`SELECT id, storage_key FROM acct_tax_documents WHERE legal_business_id = ? AND id IN (${docs.map(() => "?").join(",")})`, [businessId, ...docs.map((d) => d.id)])
    : [[] as Row[]];
  const keyOf = new Map(keys.map((k) => [Number(k.id), String(k.storage_key)]));
  const used = new Set<string>();
  const list: string[] = [];
  for (const d of docs) {
    const key = keyOf.get(d.id);
    if (!key) continue;
    const ext = key.split(".").pop();
    const base = `${d.kind.toLowerCase()}-${d.title}`.replace(/[^A-Za-z0-9 ._-]+/g, "_").slice(0, 80).trim();
    let file = `papers/${base}.${ext}`;
    for (let i = 2; used.has(file); i++) file = `papers/${base}-${i}.${ext}`;
    used.add(file);
    try {
      zip.file(file, await readPrivateDocument(key));
      list.push(`${file}  (${DOC_KIND_LABELS[d.kind] ?? d.kind}, kept ${d.uploadedAt})`);
    } catch {
      list.push(`${file}  MISSING from storage`);
    }
  }
  zip.file(
    "README.txt",
    [
      `${brand.groupName}: year-end pack for tax year ${label} (${names.act})`,
      `Made on ${today}. Figures up to ${upTo}.`,
      "",
      `${brand.fileSlug}-year-end-${label}.xlsx: summary and advance tax, profit and loss, balance sheet, trial balance, day book,`,
      "sales by month, customers who owe, suppliers owed, closing stock, fixed assets, tax depreciation, loans,",
      `tax paid, TDS by customers (${names.statementShort}) and salaries.`,
      "",
      list.length ? "Papers:" : "No tax papers were kept in the app for this year.",
      ...list,
      "",
    ].join("\r\n")
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { zip: buffer, fileName: `${brand.fileSlug}-year-end-${label}.zip` };
}
