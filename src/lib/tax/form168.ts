/**
 * Reading the annual tax statement (Form 168 from tax year 2026-27, Form 26AS before) and
 * matching it with the books (pure).
 *
 * The statement downloads from the TRACES / e-filing site as a text file with fields
 * separated by "^". Two kinds of lines matter here:
 *  - TDS summary lines: Sr ^ Name of deductor ^ TAN ^ Amount paid/credited ^ Tax deducted ^ TDS deposited
 *  - Tax paid lines (advance and self-assessment tax): ... ^ Total tax ^ BSR code ^ Date ^ Challan serial ...
 * Tab- or comma-separated copies are accepted too. Lines that fit neither are ignored.
 */
import { parseRupees } from "../reports/money.ts";

export type TdsCredit = { deductor: string; tan: string; amountPaid: bigint; tds: bigint };
export type TaxPaidLine = { bsrCode: string; date: string; serial: string; amount: bigint; minorHead: string | null };

const TAN = /^[A-Z]{4}\d{5}[A-Z]$/;
const BSR = /^\d{7}$/;
const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** "15-Jun-2026", "15/06/2026" or "2026-06-15" -> "2026-06-15"; anything else null. */
export function statementDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (m && MONTHS[m[2].toUpperCase()]) return `${m[3]}-${MONTHS[m[2].toUpperCase()]}-${m[1].padStart(2, "0")}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? s : null;
}

function splitLine(line: string): string[] {
  if (line.includes("^")) return line.split("^").map((f) => f.trim());
  if (line.includes("\t")) return line.split("\t").map((f) => f.trim());
  // Comma separated, with quoted fields that may hold commas.
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function parseStatement(text: string): { tds: TdsCredit[]; taxPaid: TaxPaidLine[] } {
  const tds: TdsCredit[] = [];
  const taxPaid: TaxPaidLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const f = splitLine(raw);
    if (f.length < 4) continue;
    const t = f.findIndex((x) => TAN.test(x.toUpperCase()));
    if (t > 0) {
      // The amounts are the first numbers after the TAN (the downloaded file leaves empty fields between).
      const nums = f.slice(t + 1).filter((x) => x !== "").map(parseRupees);
      const [amountPaid, tax] = nums;
      if (amountPaid != null && tax != null) {
        tds.push({ deductor: f[t - 1], tan: f[t].toUpperCase(), amountPaid, tds: tax });
        continue;
      }
    }
    const b = f.findIndex((x, i) => BSR.test(x) && i + 2 < f.length && statementDate(f[i + 1]) !== null);
    if (b > 0) {
      const amount = parseRupees(f[b - 1]);
      const minor = f.slice(0, b).find((x) => /^(100|102|300|400)$/.test(x)) ?? null;
      if (amount !== null && amount > 0n) taxPaid.push({ bsrCode: f[b], date: statementDate(f[b + 1])!, serial: f[b + 2].replace(/\D/g, ""), amount, minorHead: minor });
    }
  }
  return { tds, taxPaid };
}

export type ChallanInBooks = { id: number; paidOn: string; amount: bigint; bsrCode: string | null; serial: string | null };
export type ChallanMatch = {
  matched: Array<{ book: ChallanInBooks; statement: TaxPaidLine }>;
  onlyInBooks: ChallanInBooks[];
  onlyInStatement: TaxPaidLine[];
};

/** Pair the tax challans entered in the app with the tax-paid lines of the statement. */
export function matchChallans(books: ChallanInBooks[], statement: TaxPaidLine[]): ChallanMatch {
  const left = [...statement];
  const matched: ChallanMatch["matched"] = [];
  const onlyInBooks: ChallanInBooks[] = [];
  const take = (pred: (s: TaxPaidLine) => boolean) => {
    const i = left.findIndex(pred);
    return i >= 0 ? left.splice(i, 1)[0] : null;
  };
  for (const c of books) {
    const s =
      (c.bsrCode && c.serial ? take((x) => x.bsrCode === c.bsrCode && Number(x.serial) === Number(c.serial)) : null) ??
      take((x) => x.date === c.paidOn && x.amount === c.amount);
    if (s) matched.push({ book: c, statement: s });
    else onlyInBooks.push(c);
  }
  return { matched, onlyInBooks, onlyInStatement: left };
}

/** Lower-case words of a name without the usual company words, for a loose match. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(m\/s|ms|pvt|private|ltd|limited|llp|the|and|co|company|india|enterprises?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
