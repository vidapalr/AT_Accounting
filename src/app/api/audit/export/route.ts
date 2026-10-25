import ExcelJS from "exceljs";

import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { getBalanceReport } from "@/lib/reports/report-data";
import { isDate, todayInIndia, toNumber } from "@/lib/reports/money";
import { loadAccounts, loadJournals } from "@/lib/export/ledger-data";
import { tallyLedgersXml, tallyVoucherType, tallyVouchersXml } from "@/lib/export/tally";

const MONEY = "#,##0.00;[Red]-#,##0.00";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!canAccess(user.role, "audit_view")) return new Response("Not allowed.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const today = todayInIndia();
  const to = isDate(params.get("to") ?? undefined) ? params.get("to")! : today;
  const from = isDate(params.get("from") ?? undefined) ? params.get("from")! : `${today.slice(0, 4)}-04-01`;
  const format = params.get("format") ?? "xlsx";
  const businessId = user.legal_business_id;
  const noStore = { "Cache-Control": "no-store" };

  if (format === "tally-ledgers") {
    const xml = tallyLedgersXml(await loadAccounts(db, businessId));
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="tally-1-ledgers.xml"`,
        ...noStore,
      },
    });
  }

  const journals = await loadJournals(db, businessId, from, to);

  if (format === "tally-vouchers") {
    let xml: string;
    try {
      xml = tallyVouchersXml(journals);
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Could not build the file.", { status: 422 });
    }
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="tally-2-vouchers-${from}-to-${to}.xml"`,
        ...noStore,
      },
    });
  }

  // Excel workbook: day book, trial balance, list of accounts.
  const book = new ExcelJS.Workbook();
  book.creator = "Abhiram Group Accounting";
  const bold = { bold: true };

  const day = book.addWorksheet("Day book");
  day.addRow(["Abhiram Group"]).font = { bold: true, size: 14 };
  day.addRow([`Every posted entry, ${from} to ${to}`]);
  day.addRow([]);
  day.addRow(["Date", "Entry no", "Voucher type (Tally)", "Account code", "Account", "Details", "Debit", "Credit"]).font = bold;
  for (const j of journals) {
    for (const l of j.lines) {
      day.addRow([
        j.date, j.journalNo, tallyVoucherType(j.sourceType), l.accountCode, l.accountName,
        l.memo || j.description, toNumber(l.debitPaise), toNumber(l.creditPaise),
      ]);
    }
  }
  [12, 22, 20, 14, 34, 50, 16, 16].forEach((w, i) => (day.getColumn(i + 1).width = w));
  day.getColumn(7).numFmt = MONEY;
  day.getColumn(8).numFmt = MONEY;
  day.views = [{ state: "frozen", ySplit: 4 }];
  day.autoFilter = { from: "A4", to: "H4" };

  const { accounts } = await getBalanceReport(db, businessId, to);
  const tb = book.addWorksheet("Trial balance");
  tb.addRow(["Abhiram Group"]).font = { bold: true, size: 14 };
  tb.addRow([`Trial balance as at ${to}`]);
  tb.addRow([]);
  tb.addRow(["Account code", "Account", "Debit", "Credit"]).font = bold;
  let td = 0n;
  let tc = 0n;
  for (const a of accounts) {
    td += a.debit;
    tc += a.credit;
    tb.addRow([a.code, a.name, toNumber(a.debit), toNumber(a.credit)]);
  }
  tb.addRow(["", "Total", toNumber(td), toNumber(tc)]).font = bold;
  [14, 40, 18, 18].forEach((w, i) => (tb.getColumn(i + 1).width = w));
  tb.getColumn(3).numFmt = MONEY;
  tb.getColumn(4).numFmt = MONEY;

  const chart = book.addWorksheet("Accounts");
  chart.addRow(["Account code", "Account", "Type"]).font = bold;
  for (const a of await loadAccounts(db, businessId)) chart.addRow([a.code, a.name, a.type]);
  [14, 44, 14].forEach((w, i) => (chart.getColumn(i + 1).width = w));

  const buffer = await book.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="abhiram-ledger-${from}-to-${to}.xlsx"`,
      ...noStore,
    },
  });
}
