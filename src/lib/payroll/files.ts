/**
 * Files for the government portals and the accountant, built from saved payslips. Pure: no database.
 *  - PF ECR 2.0 text: one line per member, 11 fields joined by #~#, whole rupees (EPFO Unified Portal).
 *  - ESI monthly contribution sheet (ESIC portal upload columns), as CSV.
 *  - Professional tax register, as CSV.
 *  - Salary TDS deductee details for the quarterly statement (Form 138, earlier Form 24Q), as CSV.
 */

export type PayslipRow = {
  employeeName: string;
  nameAsPerUan: string | null;
  uan: string | null;
  esiNumber: string | null;
  pan: string | null;
  month: string;
  daysInMonth: number;
  paidDays: number;
  gross: bigint;
  pfWages: bigint;
  epsWages: bigint;
  edliWages: bigint;
  esiWages: bigint;
  empPf: bigint;
  erEps: bigint;
  erEpf: bigint;
  empEsi: bigint;
  erEsi: bigint;
  pt: bigint;
  tds: bigint;
  paidOn: string | null;
};

const rupees = (p: bigint) => String((p + 50n) / 100n); // whole rupees, as the portals want
const money = (p: bigint) => `${p / 100n}.${String(p % 100n).padStart(2, "0")}`;
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const ecrName = (n: string) => n.toUpperCase().replace(/[^A-Z. ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 85);

export type FileResult = { content: string; skipped: string[] };

/** PF ECR 2.0. Members without a UAN cannot be filed and are listed in `skipped`. */
export function pfEcr(rows: PayslipRow[]): FileResult {
  const skipped: string[] = [];
  const lines: string[] = [];
  for (const r of rows) {
    if (r.pfWages <= 0n && r.empPf <= 0n) continue;
    if (!r.uan || !/^\d{12}$/.test(r.uan)) {
      skipped.push(`${r.employeeName}: no 12-digit UAN`);
      continue;
    }
    lines.push(
      [
        r.uan,
        ecrName(r.nameAsPerUan || r.employeeName),
        rupees(r.gross),
        rupees(r.pfWages),
        rupees(r.epsWages),
        rupees(r.edliWages),
        rupees(r.empPf),
        rupees(r.erEps),
        rupees(r.erEpf),
        String(Math.max(0, r.daysInMonth - r.paidDays)),
        "0",
      ].join("#~#")
    );
  }
  return { content: lines.join("\n") + (lines.length ? "\n" : ""), skipped };
}

/** ESIC monthly contribution sheet. */
export function esiSheet(rows: PayslipRow[]): FileResult {
  const skipped: string[] = [];
  const out: string[][] = [["IP Number", "IP Name", "No of Days for which wages paid/payable during the month", "Total Monthly Wages", "Reason Code for Zero workings days", "Last Working Day"]];
  for (const r of rows) {
    if (r.esiWages <= 0n) continue;
    if (!r.esiNumber || !/^\d{10}$/.test(r.esiNumber)) {
      skipped.push(`${r.employeeName}: no 10-digit ESI number`);
      continue;
    }
    out.push([r.esiNumber, r.employeeName, String(r.paidDays), rupees(r.esiWages), r.paidDays === 0 ? "1" : "", ""]);
  }
  return { content: csv(out), skipped };
}

/** Professional tax register for the month. */
export function ptRegister(rows: PayslipRow[]): FileResult {
  const out: string[][] = [["Employee", "Month", "Gross salary", "Professional tax"]];
  for (const r of rows) if (r.pt > 0n) out.push([r.employeeName, r.month, money(r.gross), money(r.pt)]);
  return { content: csv(out), skipped: [] };
}

/** Salary TDS deductee details for one quarter (the accountant imports these into the return utility). */
export function salaryTdsDetails(rows: PayslipRow[], section: string): FileResult {
  const skipped: string[] = [];
  const out: string[][] = [["PAN", "Employee", "Section", "Month", "Date paid", "Amount paid", "Tax deducted"]];
  for (const r of rows) {
    if (r.tds <= 0n) continue;
    if (!r.pan || !/^[A-Z]{5}\d{4}[A-Z]$/.test(r.pan)) skipped.push(`${r.employeeName}: PAN missing or not valid (tax is then due at a higher rate)`);
    out.push([r.pan ?? "PANNOTAVBL", r.employeeName, section, r.month, r.paidOn ?? "", money(r.gross), money(r.tds)]);
  }
  return { content: csv(out), skipped };
}

/** Payroll register for the month: every payslip, every amount, for the accountant. */
export function payrollRegister(rows: PayslipRow[]): string {
  const out: string[][] = [["Employee", "Month", "Paid days", "Gross", "PF (employee)", "ESI (employee)", "Professional tax", "TDS", "PF (employer, incl. pension)", "ESI (employer)"]];
  for (const r of rows) {
    out.push([r.employeeName, r.month, String(r.paidDays), money(r.gross), money(r.empPf), money(r.empEsi), money(r.pt), money(r.tds), money(r.erEpf + r.erEps), money(r.erEsi)]);
  }
  return csv(out);
}
