/**
 * Bank statement reading and matching (item 2.11 part 2). Pure functions.
 * Money is worked in paise (integers).
 */

/** Split CSV text into rows of cells. Handles quotes, commas inside quotes, tabs and semicolons. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const delim = [",", ";", "\t", "|"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"') { if (clean[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell.trim()); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** Indian bank dates: 03/11/2026, 03-11-26, 3 Nov 2026, 03-Nov-2026, 2026-11-03. Returns YYYY-MM-DD or null. */
export function parseBankDate(raw: string): string | null {
  const s = raw.trim();
  let d: number, m: number, y: number;
  let x = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (x) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/.exec(s))) { d = +x[1]; m = +x[2]; y = +x[3]; }
  else if ((x = /^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*[-/. ,]*(\d{2,4})/.exec(s))) { d = +x[1]; m = MONTHS[x[2].toLowerCase()] ?? 0; y = +x[3]; }
  else return null;
  if (y < 100) y += 2000;
  if (!m || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "1,41,525.00", "(500)", "500 Dr", "-500" -> paise (sign kept). Empty -> 0. null if not a number. */
export function parseAmountPaise(raw: string): number | null {
  let s = raw.trim().replace(/₹|rs\.?|inr/gi, "").replace(/\s+/g, "");
  if (s === "" || s === "-") return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const dc = /(dr|cr)$/i.exec(s);
  if (dc) s = s.slice(0, -2);
  s = s.replace(/,/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const p = Math.round(Number(s) * 100);
  return neg ? -p : p;
}

export type StatementLine = { date: string; description: string; moneyOut: number; moneyIn: number; balance: number | null };
export type ParseResult = { lines: StatementLine[]; skipped: number; error?: string };

const find = (hs: string[], ...pats: RegExp[]) => hs.findIndex((h) => pats.some((p) => p.test(h)));

/** Read a bank CSV: find the header row, work out the columns, return lines. */
export function readStatement(text: string): ParseResult {
  const rows = parseCsv(text);
  const hIdx = rows.findIndex((r) => {
    const hs = r.map((c) => c.toLowerCase());
    return find(hs, /date/) >= 0 && (find(hs, /debit|withdraw|dr\b/) >= 0 || find(hs, /amount/) >= 0);
  });
  if (hIdx < 0) return { lines: [], skipped: 0, error: "I could not find the heading row (Date, Narration, Withdrawal, Deposit...). Send a sample file to Claude." };
  const hs = rows[hIdx].map((c) => c.toLowerCase());
  const iDate = find(hs, /^(txn |transaction |value )?date/, /date/);
  const iDesc = find(hs, /narration|description|particulars|remarks|details/);
  const iType = find(hs, /dr\s*\/\s*cr|^type$/);
  const money = hs.map((h, i) => (i === iType ? "" : h));
  const iOut = find(money, /withdraw|debit|\bdr\b/);
  const iIn = find(money, /deposit|credit|\bcr\b/);
  const iAmt = find(hs, /^amount/);
  const iBal = find(hs, /balance/);
  if (iDate < 0 || (iOut < 0 && iIn < 0 && iAmt < 0)) return { lines: [], skipped: 0, error: "I could not find the Date and Amount columns. Send a sample file to Claude." };

  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const r of rows.slice(hIdx + 1)) {
    const date = parseBankDate(r[iDate] ?? "");
    if (!date) { if (r.some((c) => c)) skipped++; continue; }
    let out = 0, inn = 0;
    if (iOut >= 0 || iIn >= 0) {
      const o = iOut >= 0 ? parseAmountPaise(r[iOut] ?? "") : 0;
      const i = iIn >= 0 ? parseAmountPaise(r[iIn] ?? "") : 0;
      if (o === null || i === null) { skipped++; continue; }
      out = Math.abs(o); inn = Math.abs(i);
    } else {
      const a = parseAmountPaise(r[iAmt] ?? "");
      if (a === null) { skipped++; continue; }
      const t = iType >= 0 ? (r[iType] ?? "").toLowerCase() : /dr\s*$/i.test(r[iAmt] ?? "") ? "dr" : "";
      if (a < 0 || t.startsWith("dr") || t.startsWith("d")) out = Math.abs(a); else inn = a;
    }
    if (out === 0 && inn === 0) continue;
    const bal = iBal >= 0 ? parseAmountPaise(r[iBal] ?? "") : null;
    lines.push({ date, description: (iDesc >= 0 ? r[iDesc] : "").slice(0, 500) || "(no description)", moneyOut: out, moneyIn: inn, balance: bal });
  }
  return { lines, skipped };
}

export type BookLine = { id: number; date: string; description: string; debit: number; credit: number };
export type MatchPair = { statementIndex: number; bookId: number };

const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/**
 * Pair statement lines with book lines: same amount, money out = book credit, money in = book debit,
 * dates within `days` of each other, one book line used once, closest date first.
 * Statement lines already matched are left out by the caller.
 */
export function matchStatement(lines: StatementLine[], books: BookLine[], days = 3): MatchPair[] {
  const cands: Array<{ si: number; bid: number; gap: number }> = [];
  lines.forEach((l, si) => {
    for (const b of books) {
      const same = l.moneyOut > 0 ? b.credit === l.moneyOut && b.debit === 0 : b.debit === l.moneyIn && b.credit === 0;
      if (!same) continue;
      const gap = Math.abs(dayNum(l.date) - dayNum(b.date));
      if (gap <= days) cands.push({ si, bid: b.id, gap });
    }
  });
  cands.sort((a, b) => a.gap - b.gap || a.si - b.si || a.bid - b.bid);
  const usedS = new Set<number>(), usedB = new Set<number>();
  const out: MatchPair[] = [];
  for (const c of cands) {
    if (usedS.has(c.si) || usedB.has(c.bid)) continue;
    usedS.add(c.si); usedB.add(c.bid);
    out.push({ statementIndex: c.si, bookId: c.bid });
  }
  return out;
}
