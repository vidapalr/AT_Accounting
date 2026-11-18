/**
 * GST return summaries (pure): GSTR-1 (sales), GSTR-3B (monthly summary and payment) and the
 * composition quarterly statement (CMP-08). Money is integer paise. The accountant files them on
 * the GST portal; these give the figures table by table.
 *
 * GSTR-1: B2B invoice by invoice; B2C Large = inter-state bill to an unregistered buyer above
 * Rs 1 lakh, invoice by invoice; B2C Small = everything else to unregistered buyers, by state and
 * rate; credit notes (CDNR registered, CDNUR large inter-state); HSN summary split B2B / B2C;
 * document count.
 */
import { addTax, setOff, taxTotal, ZERO_TAX, type TaxSplit } from "./engine.ts";

export const B2CL_LIMIT = 10000000n; // Rs 1 lakh in paise

export type RateRow = TaxSplit & { rate: number; taxable: bigint; hsn: string | null; qty: number };

export type InvoiceRec = {
  no: string;
  date: string;
  buyerGstin: string | null;
  buyerName: string;
  pos: string; // state code
  value: bigint; // invoice total
  rows: RateRow[]; // one per line (delivery included as a row with hsn null)
};

export type CreditNoteRec = {
  no: string;
  date: string;
  invoiceNo: string;
  invoiceDate: string;
  buyerGstin: string | null;
  buyerName: string;
  pos: string;
  value: bigint;
  rows: RateRow[];
};

type Bucket = TaxSplit & { taxable: bigint };
const emptyBucket = (): Bucket => ({ ...ZERO_TAX, taxable: 0n });
const addRow = (b: Bucket, r: { taxable: bigint } & TaxSplit, sign: 1n | -1n = 1n): Bucket => ({
  taxable: b.taxable + sign * r.taxable,
  cgst: b.cgst + sign * r.cgst,
  sgst: b.sgst + sign * r.sgst,
  igst: b.igst + sign * r.igst,
});

/** Rows of one document added up by rate. */
export function byRate(rows: RateRow[]): Array<Bucket & { rate: number }> {
  const m = new Map<number, Bucket>();
  for (const r of rows) m.set(r.rate, addRow(m.get(r.rate) ?? emptyBucket(), r));
  return [...m].sort((a, b) => a[0] - b[0]).map(([rate, b]) => ({ rate, ...b }));
}

export type Gstr1 = {
  b2b: Array<{ inv: InvoiceRec; rates: Array<Bucket & { rate: number }> }>;
  b2cl: Array<{ inv: InvoiceRec; rates: Array<Bucket & { rate: number }> }>;
  b2cs: Array<Bucket & { pos: string; rate: number; interState: boolean }>;
  cdnr: Array<{ note: CreditNoteRec; rates: Array<Bucket & { rate: number }> }>;
  cdnur: Array<{ note: CreditNoteRec; rates: Array<Bucket & { rate: number }> }>;
  nil: bigint; // 0% sales value
  hsn: { b2b: HsnRow[]; b2c: HsnRow[] };
  docs: { invoices: { from: string; to: string; count: number }; creditNotes: { from: string; to: string; count: number } };
  totals: Bucket;
};

export type HsnRow = Bucket & { hsn: string; rate: number; qty: number };

function hsnRows(rows: RateRow[], into: Map<string, HsnRow>, sign: 1n | -1n) {
  for (const r of rows) {
    const hsn = r.hsn ?? "9965"; // delivery: goods transport service
    const key = `${hsn}|${r.rate}`;
    const cur = into.get(key) ?? { hsn, rate: r.rate, qty: 0, ...emptyBucket() };
    into.set(key, { ...addRow(cur, r, sign), hsn, rate: r.rate, qty: cur.qty + (sign === 1n ? r.qty : -r.qty) });
  }
}

function range(nos: string[]): { from: string; to: string; count: number } {
  if (nos.length === 0) return { from: "", to: "", count: 0 };
  const sorted = [...nos].sort();
  return { from: sorted[0], to: sorted[sorted.length - 1], count: nos.length };
}

export function buildGstr1(input: { homeState: string; invoices: InvoiceRec[]; creditNotes: CreditNoteRec[] }): Gstr1 {
  const out: Gstr1 = { b2b: [], b2cl: [], b2cs: [], cdnr: [], cdnur: [], nil: 0n, hsn: { b2b: [], b2c: [] }, docs: { invoices: range([]), creditNotes: range([]) }, totals: emptyBucket() };
  const b2cs = new Map<string, Bucket & { pos: string; rate: number; interState: boolean }>();
  const hsnB2b = new Map<string, HsnRow>();
  const hsnB2c = new Map<string, HsnRow>();
  const smallInto = (pos: string, rows: RateRow[], sign: 1n | -1n) => {
    for (const r of byRate(rows)) {
      const key = `${pos}|${r.rate}`;
      const cur = b2cs.get(key) ?? { pos, rate: r.rate, interState: pos !== input.homeState, ...emptyBucket() };
      b2cs.set(key, { ...cur, ...addRow(cur, r, sign) });
    }
  };
  for (const inv of input.invoices) {
    const taxed = inv.rows.filter((r) => r.rate > 0);
    out.nil += inv.rows.filter((r) => r.rate === 0).reduce((t, r) => t + r.taxable, 0n);
    for (const r of inv.rows) out.totals = addRow(out.totals, r);
    if (inv.buyerGstin) {
      out.b2b.push({ inv, rates: byRate(taxed) });
      hsnRows(inv.rows, hsnB2b, 1n);
    } else {
      hsnRows(inv.rows, hsnB2c, 1n);
      if (inv.pos !== input.homeState && inv.value > B2CL_LIMIT) out.b2cl.push({ inv, rates: byRate(taxed) });
      else smallInto(inv.pos, taxed, 1n);
    }
  }
  for (const note of input.creditNotes) {
    const taxed = note.rows.filter((r) => r.rate > 0);
    for (const r of note.rows) out.totals = addRow(out.totals, r, -1n);
    if (note.buyerGstin) {
      out.cdnr.push({ note, rates: byRate(taxed) });
      hsnRows(note.rows, hsnB2b, -1n);
    } else {
      hsnRows(note.rows, hsnB2c, -1n);
      if (note.pos !== input.homeState && note.value > B2CL_LIMIT) out.cdnur.push({ note, rates: byRate(taxed) });
      else smallInto(note.pos, taxed, -1n);
    }
  }
  out.b2cs = [...b2cs.values()].sort((a, b) => (a.pos === b.pos ? a.rate - b.rate : a.pos < b.pos ? -1 : 1));
  out.hsn = { b2b: [...hsnB2b.values()], b2c: [...hsnB2c.values()] };
  out.docs = { invoices: range(input.invoices.map((i) => i.no)), creditNotes: range(input.creditNotes.map((n) => n.no)) };
  return out;
}

export type InwardRec = {
  kind: "PURCHASE" | "EXPENSE" | "SUPPLIER_RETURN";
  treatment: "REGULAR" | "UNREGISTERED" | "COMPOSITION" | "RCM" | "NONE";
  value: bigint; // value before GST
  credit: TaxSplit; // input credit (negative for a supplier return)
  rcm: TaxSplit; // reverse-charge GST owed
};

export type Gstr3b = {
  outward: Bucket; // 3.1(a)
  nilRated: bigint; // 3.1(c)
  rcmInward: Bucket; // 3.1(d)
  interStateUnregistered: Array<{ pos: string; taxable: bigint; igst: bigint }>; // 3.2
  itcRcm: TaxSplit; // 4(A)(3)
  itcOther: TaxSplit; // 4(A)(5), net of supplier returns
  itcTotal: TaxSplit;
  inwardComposition: bigint; // 5
  inwardUnregistered: bigint; // for information
  setOff: ReturnType<typeof setOff>;
  rcmCash: bigint;
  cashTotal: bigint;
};

export function buildGstr3b(input: { gstr1: Gstr1; homeState: string; inward: InwardRec[]; creditBroughtForward?: TaxSplit }): Gstr3b {
  const g = input.gstr1;
  const outward = { ...g.totals, taxable: g.totals.taxable - g.nil };
  const inter = new Map<string, { pos: string; taxable: bigint; igst: bigint }>();
  for (const row of g.b2cs.filter((r) => r.interState)) {
    const cur = inter.get(row.pos) ?? { pos: row.pos, taxable: 0n, igst: 0n };
    inter.set(row.pos, { pos: row.pos, taxable: cur.taxable + row.taxable, igst: cur.igst + row.igst });
  }
  for (const { inv, rates } of g.b2cl) {
    const cur = inter.get(inv.pos) ?? { pos: inv.pos, taxable: 0n, igst: 0n };
    inter.set(inv.pos, { pos: inv.pos, taxable: cur.taxable + rates.reduce((t, r) => t + r.taxable, 0n), igst: cur.igst + rates.reduce((t, r) => t + r.igst, 0n) });
  }
  let rcmInward = emptyBucket();
  let itcRcm = { ...ZERO_TAX };
  let itcOther = { ...ZERO_TAX };
  let inwardComposition = 0n;
  let inwardUnregistered = 0n;
  for (const r of input.inward) {
    if (r.treatment === "RCM") {
      rcmInward = addRow(rcmInward, { taxable: r.value, ...r.rcm });
      itcRcm = addTax(itcRcm, r.credit);
    } else if (r.treatment === "REGULAR") itcOther = addTax(itcOther, r.credit);
    else if (r.treatment === "COMPOSITION") inwardComposition += r.value;
    else if (r.treatment === "UNREGISTERED") inwardUnregistered += r.value;
  }
  const itcTotal = addTax(addTax(itcRcm, itcOther), input.creditBroughtForward ?? ZERO_TAX);
  const so = setOff({ cgst: outward.cgst, sgst: outward.sgst, igst: outward.igst }, itcTotal);
  const rcmCash = taxTotal(rcmInward);
  return {
    outward,
    nilRated: g.nil,
    rcmInward,
    interStateUnregistered: [...inter.values()],
    itcRcm,
    itcOther,
    itcTotal,
    inwardComposition,
    inwardUnregistered,
    setOff: so,
    rcmCash,
    cashTotal: taxTotal(so.cash) + rcmCash,
  };
}

/** Months covered by a monthly return or a composition quarter (April-June, July-September, ...). */
export function periodRange(kind: "MONTH" | "QUARTER", ym: string): { from: string; to: string; label: string } {
  const [y, m] = ym.split("-").map(Number);
  const startMonth = kind === "MONTH" ? m : m - ((m - 4 + 12) % 3);
  const startYear = startMonth > m ? y - 1 : y;
  const endIndex = startYear * 12 + startMonth - 1 + (kind === "MONTH" ? 0 : 2);
  const ey = Math.floor(endIndex / 12);
  const em = (endIndex % 12) + 1;
  const last = new Date(Date.UTC(ey, em, 0)).getUTCDate();
  const name = (yy: number, mm: number) => new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
  return {
    from: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
    to: `${ey}-${String(em).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
    label: kind === "MONTH" ? name(y, m) : `${name(startYear, startMonth)} to ${name(ey, em)}`,
  };
}
