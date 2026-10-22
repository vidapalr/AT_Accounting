import ExcelJS from "exceljs";

import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { getBalanceReport, getProfitReport } from "@/lib/reports/report-data";
import { isDate, todayInIndia, toNumber } from "@/lib/reports/money";

const MONEY = '#,##0.00;[Red]-#,##0.00';

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canAccess(user.role, "reports")) return new Response("Not allowed.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const today = todayInIndia();
  const to = isDate(params.get("to") ?? undefined) ? params.get("to")! : today;
  const from = isDate(params.get("from") ?? undefined) ? params.get("from")! : `${today.slice(0, 4)}-04-01`;

  const businessId = user.legal_business_id;
  const scopes = await getProfitReport(db, businessId, from, to);
  const { accounts, sheet, names } = await getBalanceReport(db, businessId, to);

  const book = new ExcelJS.Workbook();
  book.creator = "Abhiram Group Accounting";

  const bold = { bold: true };

  // Profit
  const profit = book.addWorksheet("Profit");
  profit.addRow(["Abhiram Group"]).font = { bold: true, size: 14 };
  profit.addRow([`Profit report ${from} to ${to}`]);
  profit.addRow([]);
  profit.addRow([
    "", "Sales", "Discounts and returns", "Cost of goods", "Gross profit", "Running expenses",
    "Operating profit", "Set-up costs", "Net profit",
  ]).font = bold;
  for (const s of scopes) {
    const f = s.figures;
    const row = profit.addRow([
      `${s.depth === 2 ? "   " : ""}${s.label}`,
      toNumber(f.sales), toNumber(f.discounts), toNumber(f.costOfGoods), toNumber(f.gross),
      toNumber(f.runningExpenses), toNumber(f.operating), toNumber(f.setupCosts), toNumber(f.net),
    ]);
    if (s.scope === "GROUP") row.font = bold;
  }
  profit.columns.forEach((c, i) => {
    c.width = i === 0 ? 34 : 20;
    if (i > 0) c.numFmt = MONEY;
  });

  // Balance sheet
  const bs = book.addWorksheet("Balance Sheet");
  bs.addRow(["Abhiram Group"]).font = { bold: true, size: 14 };
  bs.addRow([`Balance sheet as at ${to}`]);
  bs.addRow([]);
  const block = (title: string, rows: { code: string; amount: bigint }[]) => {
    bs.addRow([title]).font = bold;
    for (const r of rows) bs.addRow([`${r.code} ${names.get(r.code) ?? ""}`, toNumber(r.amount)]);
  };
  block("Assets", sheet.assets);
  bs.addRow(["Total assets", toNumber(sheet.totalAssets)]).font = bold;
  block("Liabilities", sheet.liabilities);
  block("Capital (owner and investor money)", sheet.capital);
  bs.addRow(["Profit to date (net)", toNumber(sheet.profitToDate)]);
  bs.addRow(["Total liabilities, capital and profit", toNumber(sheet.totalLiabilitiesAndCapital)]).font = bold;
  bs.getColumn(1).width = 46;
  bs.getColumn(2).width = 20;
  bs.getColumn(2).numFmt = MONEY;

  // Trial balance
  const tb = book.addWorksheet("Trial Balance");
  tb.addRow(["Abhiram Group"]).font = { bold: true, size: 14 };
  tb.addRow([`Trial balance as at ${to}`]);
  tb.addRow([]);
  tb.addRow(["Account", "Debit", "Credit"]).font = bold;
  let td = 0n;
  let tc = 0n;
  for (const a of accounts) {
    td += a.debit;
    tc += a.credit;
    tb.addRow([`${a.code} ${a.name}`, toNumber(a.debit), toNumber(a.credit)]);
  }
  tb.addRow(["Total", toNumber(td), toNumber(tc)]).font = bold;
  tb.getColumn(1).width = 46;
  tb.getColumn(2).width = 20;
  tb.getColumn(3).width = 20;
  tb.getColumn(2).numFmt = MONEY;
  tb.getColumn(3).numFmt = MONEY;

  const buffer = await book.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="abhiram-reports-${from}-to-${to}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
