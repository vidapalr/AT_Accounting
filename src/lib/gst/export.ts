import "server-only";

/** Excel workbook of a GST period for the accountant: one sheet per return table. */
import ExcelJS from "exceljs";

import { getBrand } from "@/lib/brand";
import { GST_STATES } from "@/lib/gst";
import { toNumber as n } from "@/lib/reports/money";
import { gstPeriod, paymentFigures } from "./period";
import type { HsnRow } from "./returns";

type Cell = string | number | null;
const MONEY = "#,##0.00;[Red]-#,##0.00";
const pos = (code: string) => `${code}-${GST_STATES.find((s) => s.code === code)?.name ?? ""}`;

function sheet(book: ExcelJS.Workbook, name: string, about: string, header: string[], rows: Cell[][], money: number[]) {
  const ws = book.addWorksheet(name);
  ws.addRow([about]).font = { bold: true };
  ws.addRow(header).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  header.forEach((h, i) => (ws.getColumn(i + 1).width = Math.max(12, Math.min(40, h.length + 4))));
  for (const c of money) ws.getColumn(c).numFmt = MONEY;
  ws.views = [{ state: "frozen", ySplit: 2 }];
}

export async function buildGstWorkbook(businessId: number, from: string, to: string, label: string): Promise<{ buffer: Buffer; fileName: string }> {
  const brand = await getBrand(businessId);
  const p = await gstPeriod(businessId, from, to);
  const g = p.gstr1;
  const book = new ExcelJS.Workbook();
  book.creator = brand.appName;
  const head = `${brand.groupName} · GSTIN ${p.cfg.gstin} · ${label}`;

  sheet(book, "b2b", `${head} · B2B invoices (4A)`, ["GSTIN of recipient", "Receiver name", "Invoice number", "Invoice date", "Invoice value", "Place of supply", "Reverse charge", "Rate", "Taxable value", "CGST", "SGST", "IGST"],
    g.b2b.flatMap(({ inv, rates }) => rates.map((r) => [inv.buyerGstin, inv.buyerName, inv.no, inv.date, n(inv.value), pos(inv.pos), "N", r.rate, n(r.taxable), n(r.cgst), n(r.sgst), n(r.igst)] as Cell[])), [5, 9, 10, 11, 12]);
  sheet(book, "b2cl", `${head} · B2C Large invoices (5)`, ["Invoice number", "Invoice date", "Invoice value", "Place of supply", "Rate", "Taxable value", "IGST"],
    g.b2cl.flatMap(({ inv, rates }) => rates.map((r) => [inv.no, inv.date, n(inv.value), pos(inv.pos), r.rate, n(r.taxable), n(r.igst)] as Cell[])), [3, 6, 7]);
  sheet(book, "b2cs", `${head} · B2C Small (7)`, ["Type", "Place of supply", "Rate", "Taxable value", "CGST", "SGST", "IGST"],
    g.b2cs.map((r) => ["OE", pos(r.pos), r.rate, n(r.taxable), n(r.cgst), n(r.sgst), n(r.igst)] as Cell[]), [4, 5, 6, 7]);
  sheet(book, "cdnr", `${head} · Credit notes, registered (9B)`, ["GSTIN of recipient", "Receiver name", "Note number", "Note date", "Against invoice", "Invoice date", "Note value", "Place of supply", "Rate", "Taxable value", "CGST", "SGST", "IGST"],
    g.cdnr.flatMap(({ note, rates }) => rates.map((r) => [note.buyerGstin, note.buyerName, note.no, note.date, note.invoiceNo, note.invoiceDate, n(note.value), pos(note.pos), r.rate, n(r.taxable), n(r.cgst), n(r.sgst), n(r.igst)] as Cell[])), [7, 10, 11, 12, 13]);
  sheet(book, "cdnur", `${head} · Credit notes, unregistered large (9B)`, ["Note number", "Note date", "Against invoice", "Note value", "Place of supply", "Rate", "Taxable value", "IGST"],
    g.cdnur.flatMap(({ note, rates }) => rates.map((r) => [note.no, note.date, note.invoiceNo, n(note.value), pos(note.pos), r.rate, n(r.taxable), n(r.igst)] as Cell[])), [4, 7, 8]);
  const hsn = (rows: HsnRow[]) => rows.map((r) => [r.hsn, r.qty, "PCS", r.rate, n(r.taxable), n(r.cgst), n(r.sgst), n(r.igst)] as Cell[]);
  sheet(book, "hsn(b2b)", `${head} · HSN summary, B2B (12)`, ["HSN", "Quantity", "UQC", "Rate", "Taxable value", "CGST", "SGST", "IGST"], hsn(g.hsn.b2b), [5, 6, 7, 8]);
  sheet(book, "hsn(b2c)", `${head} · HSN summary, B2C (12)`, ["HSN", "Quantity", "UQC", "Rate", "Taxable value", "CGST", "SGST", "IGST"], hsn(g.hsn.b2c), [5, 6, 7, 8]);
  sheet(book, "docs", `${head} · Documents issued (13)`, ["Nature of document", "From", "To", "Total number", "Cancelled"],
    [["Invoices for outward supply", g.docs.invoices.from, g.docs.invoices.to, g.docs.invoices.count, 0], ["Credit notes", g.docs.creditNotes.from, g.docs.creditNotes.to, g.docs.creditNotes.count, 0]], []);
  const b = p.gstr3b;
  const f = paymentFigures(p);
  sheet(book, "3B", `${head} · GSTR-3B summary`, ["Table", "Taxable value", "CGST", "SGST", "IGST"], [
    ["3.1(a) Outward taxable", n(b.outward.taxable), n(b.outward.cgst), n(b.outward.sgst), n(b.outward.igst)],
    ["3.1(c) Nil rated", n(b.nilRated), null, null, null],
    ["3.1(d) Inward reverse charge", n(b.rcmInward.taxable), n(b.rcmInward.cgst), n(b.rcmInward.sgst), n(b.rcmInward.igst)],
    ...b.interStateUnregistered.map((r) => [`3.2 Unregistered, ${pos(r.pos)}`, n(r.taxable), null, null, n(r.igst)] as Cell[]),
    ["4(A)(3) ITC reverse charge", null, n(b.itcRcm.cgst), n(b.itcRcm.sgst), n(b.itcRcm.igst)],
    ["4(A)(5) All other ITC", null, n(b.itcOther.cgst), n(b.itcOther.sgst), n(b.itcOther.igst)],
    ["Credit brought forward (books)", null, n(p.broughtForward.cgst), n(p.broughtForward.sgst), n(p.broughtForward.igst)],
    ["5 Inward from composition suppliers", n(b.inwardComposition), null, null, null],
    ["Inward from unregistered suppliers (information)", n(b.inwardUnregistered), null, null, null],
    ["Paid from input credit", null, n(f.used.cgst), n(f.used.sgst), n(f.used.igst)],
    ["Paid in cash", null, n(f.cash.cgst), n(f.cash.sgst), n(f.cash.igst)],
    ["Reverse charge paid in cash", n(f.rcm), null, null, null],
    ["Credit left for next month", null, n(f.creditLeft.cgst), n(f.creditLeft.sgst), n(f.creditLeft.igst)],
  ], [2, 3, 4, 5]);
  if (p.cfg.scheme === "COMPOSITION") {
    sheet(book, "CMP-08", `${head} · Composition statement`, ["Item", "Amount"], [
      ["Turnover", n(p.composition.turnover)], ["CGST", n(p.composition.tax.cgst)], ["SGST", n(p.composition.tax.sgst)],
      ["Reverse charge", n(b.rcmCash)], ["Inward from registered suppliers", n(p.composition.inwardFromRegistered)], ["Inward from unregistered suppliers", n(p.composition.inwardFromUnregistered)],
    ], [2]);
  }
  return { buffer: Buffer.from(await book.xlsx.writeBuffer()), fileName: `${brand.fileSlug}-gst-${from}-to-${to}.xlsx` };
}
