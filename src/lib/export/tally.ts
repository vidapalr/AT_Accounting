/** Turns ledger entries into files the auditor's Tally can import (pure, no database). */

export type ExportLine = {
  accountCode: string;
  accountName: string;
  debitPaise: bigint;
  creditPaise: bigint;
  memo: string;
};

export type ExportJournal = {
  journalNo: string;
  date: string; // YYYY-MM-DD
  sourceType: string | null;
  description: string;
  lines: ExportLine[];
};

export type ExportAccount = { code: string; name: string; type: string };

/** The Tally voucher type each kind of entry is filed under. */
const VOUCHER_TYPES: Record<string, string> = {
  SALES_INVOICE: "Sales",
  SALES_RECEIPT: "Receipt",
  SALES_RETURN: "Credit Note",
  SALES_REFUND: "Payment",
  PURCHASE_RECEIPT: "Purchase",
  PURCHASE_PAYMENT: "Payment",
  EXPENSE_PAYMENT: "Payment",
  DEPOSIT_PAID: "Payment",
  DEPOSIT_REFUND: "Receipt",
  SUPPLIER_RETURN: "Debit Note",
  SUPPLIER_REFUND: "Receipt",
};

export function tallyVoucherType(sourceType: string | null): string {
  return (sourceType && VOUCHER_TYPES[sourceType]) || "Journal";
}

/** The Tally group (like a folder of ledgers) an account is placed in. */
export function tallyGroup(code: string, type: string): string {
  if (code === "1000" || code === "1001") return "Cash-in-Hand";
  if (code === "1010" || code === "1011") return "Bank Accounts";
  if (code === "1100") return "Sundry Debtors";
  if (code === "1200") return "Stock-in-Hand";
  if (code === "1310") return "Deposits (Asset)";
  if (code === "2000") return "Sundry Creditors";
  if (code === "2100" || code === "2110" || code === "2120") return "Loans (Liability)";
  if (type === "ASSET") return "Current Assets";
  if (type === "LIABILITY") return "Current Liabilities";
  if (type === "EQUITY") return "Capital Account";
  if (type === "REVENUE") return code.startsWith("7") ? "Indirect Incomes" : "Sales Accounts";
  if (code.startsWith("5")) return "Direct Expenses";
  return "Indirect Expenses";
}

export function xmlEscape(text: string): string {
  return text
    // characters XML does not allow at all
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const rupees = (paise: bigint) => `${paise / 100n}.${String(paise % 100n).padStart(2, "0")}`;
const tallyDate = (iso: string) => iso.replaceAll("-", "");

/** Tally shows an account by name, so the name is what ties vouchers to ledgers. */
const ledgerName = (a: { accountName: string }) => a.accountName.trim();

function envelope(reportName: string, body: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n <HEADER>\n  <TALLYREQUEST>Import Data</TALLYREQUEST>\n </HEADER>\n <BODY>\n  <IMPORTDATA>\n` +
    `   <REQUESTDESC>\n    <REPORTNAME>${reportName}</REPORTNAME>\n   </REQUESTDESC>\n   <REQUESTDATA>\n${body}   </REQUESTDATA>\n  </IMPORTDATA>\n </BODY>\n</ENVELOPE>\n`
  );
}

/** Ledger masters. Import this first so the vouchers find their ledgers. */
export function tallyLedgersXml(accounts: ExportAccount[]): string {
  const body = accounts
    .map(
      (a) =>
        `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n     <LEDGER NAME="${xmlEscape(a.name.trim())}" ACTION="Create">\n` +
        `      <NAME>${xmlEscape(a.name.trim())}</NAME>\n      <PARENT>${xmlEscape(tallyGroup(a.code, a.type))}</PARENT>\n     </LEDGER>\n    </TALLYMESSAGE>\n`
    )
    .join("");
  return envelope("All Masters", body);
}

/**
 * Vouchers. In Tally a debit is a negative amount marked "deemed positive",
 * and a credit is a positive amount. Entries that do not balance are refused
 * rather than exported wrong.
 */
export function tallyVouchersXml(journals: ExportJournal[]): string {
  const body = journals
    .map((j) => {
      const debit = j.lines.reduce((s, l) => s + l.debitPaise, 0n);
      const credit = j.lines.reduce((s, l) => s + l.creditPaise, 0n);
      if (debit !== credit) throw new Error(`Journal ${j.journalNo} does not balance and cannot be exported.`);
      const type = tallyVoucherType(j.sourceType);
      const entries = j.lines
        .map((l) => {
          const isDebit = l.debitPaise > 0n;
          const amount = isDebit ? l.debitPaise : l.creditPaise;
          return (
            `       <ALLLEDGERENTRIES.LIST>\n        <LEDGERNAME>${xmlEscape(ledgerName(l))}</LEDGERNAME>\n` +
            `        <ISDEEMEDPOSITIVE>${isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>\n` +
            `        <AMOUNT>${isDebit ? "-" : ""}${rupees(amount)}</AMOUNT>\n       </ALLLEDGERENTRIES.LIST>\n`
          );
        })
        .join("");
      return (
        `    <TALLYMESSAGE xmlns:UDF="TallyUDF">\n     <VOUCHER VCHTYPE="${xmlEscape(type)}" ACTION="Create">\n` +
        `      <DATE>${tallyDate(j.date)}</DATE>\n      <VOUCHERTYPENAME>${xmlEscape(type)}</VOUCHERTYPENAME>\n` +
        `      <VOUCHERNUMBER>${xmlEscape(j.journalNo)}</VOUCHERNUMBER>\n      <NARRATION>${xmlEscape(j.description)}</NARRATION>\n` +
        entries +
        `     </VOUCHER>\n    </TALLYMESSAGE>\n`
      );
    })
    .join("");
  return envelope("Vouchers", body);
}
