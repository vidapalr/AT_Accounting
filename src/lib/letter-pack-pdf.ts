import "server-only";

import PDFDocument from "pdfkit";

import type { Brand } from "./brand-core.ts";
import type { LetterPack, MoneyRow, PackBlock } from "./letter-pack.ts";
import { logoFile, pdfFonts } from "./pdf-assets.ts";
import { inr } from "./reports/money.ts";

const NAVY = "#142c50";
const INK = "#0f172a";
const GREY = "#64748b";
const LINE = "#cbd5e1";
const SHADE = "#eef2f8";

/**
 * A staff letter (one page, or the four-page offer and joining pack) as an A4 PDF with the company
 * letterhead on every page, reference and page number in the footer, and the employee's initials box
 * on the pages after the first. Draws the same LetterPack the screen shows.
 */
export async function letterPackToPdf(pack: LetterPack, brand: Pick<Brand, "groupName" | "shopName" | "logoPrint" | "shopPhone" | "email" | "websites">, address: string): Promise<Buffer> {
  const [{ regular, bold }, logo] = await Promise.all([pdfFonts(), logoFile(brand.logoPrint)]);
  const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: pack.pages[0]?.title ?? "Letter", Author: pack.employer } });
  doc.registerFont("R", regular);
  doc.registerFont("B", bold);
  // Embedded once, drawn on every page (openImage is missing from the type definitions).
  const logoImage = (doc as unknown as { openImage(src: Buffer): Buffer }).openImage(logo);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;

  const letterhead = () => {
    // A page can be added in the middle of a paragraph: put the paragraph's font back afterwards.
    const state = doc as unknown as { _font: unknown; _fontSize: number; _fillColor: unknown };
    const saved = { font: state._font, size: state._fontSize, fill: state._fillColor };
    const top = 36;
    doc.image(logoImage, left, top, { width: 46 });
    doc.font("B").fontSize(15).fillColor(NAVY).text(brand.groupName.toUpperCase(), left + 58, top + 2, { width: width - 58 });
    let y = top + 21;
    if (brand.shopName && brand.shopName !== brand.groupName) {
      doc.font("B").fontSize(9.5).fillColor(NAVY).text(brand.shopName, left + 58, y, { width: width - 58 });
      y += 13;
    }
    const contact = [address, [brand.shopPhone ? `Phone ${brand.shopPhone}` : "", brand.email, brand.websites].filter(Boolean).join("  ·  ")].filter(Boolean);
    doc.font("R").fontSize(8).fillColor(GREY);
    for (const line of contact) { doc.text(line, left + 58, y, { width: width - 58 }); y = doc.y + 1; }
    const ruleY = Math.max(y, top + 50) + 6;
    doc.moveTo(left, ruleY).lineTo(left + width, ruleY).lineWidth(1.6).strokeColor(NAVY).stroke();
    doc.moveTo(left, ruleY + 3).lineTo(left + width, ruleY + 3).lineWidth(0.5).strokeColor(NAVY).stroke();
    doc.x = left;
    doc.y = ruleY + 18;
    state._font = saved.font;
    state._fontSize = saved.size;
    state._fillColor = saved.fill;
  };
  doc.on("pageAdded", letterhead);

  const ensure = (needed: number) => { if (doc.y + needed > bottom()) doc.addPage(); };
  // The terms page is set smaller, just enough for all its clauses to fit on one page (shrink = points off).
  let compact = false;
  let shrink = 1.4;
  const para = (text: string, opts: { size?: number; color?: string; font?: "R" | "B"; gap?: number; align?: "left" | "justify" | "center" | "right" } = {}) => {
    doc.font(opts.font ?? "R").fontSize((opts.size ?? 10.2) - (compact ? shrink : 0)).fillColor(opts.color ?? INK);
    ensure(doc.heightOfString(text, { width }) + 4);
    doc.text(text, left, doc.y, { width, align: opts.align ?? "justify", lineGap: compact ? 0.9 : 2.2 });
    doc.moveDown(compact ? (opts.gap ?? 0.55) * 0.5 : (opts.gap ?? 0.55));
  };

  const facts = (rows: Array<[string, string]>) => {
    const labelW = width * 0.36;
    for (const [k, v] of rows) {
      doc.font("R").fontSize(9.6);
      const h = Math.max(doc.heightOfString(k, { width: labelW - 14 }), doc.heightOfString(v, { width: width - labelW - 14 })) + 10;
      ensure(h);
      const y = doc.y;
      doc.rect(left, y, labelW, h).fill(SHADE);
      doc.rect(left, y, width, h).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.moveTo(left + labelW, y).lineTo(left + labelW, y + h).strokeColor(LINE).stroke();
      doc.font("B").fontSize(9.4).fillColor(NAVY).text(k, left + 7, y + 5, { width: labelW - 14 });
      doc.font("R").fontSize(9.6).fillColor(INK).text(v, left + labelW + 7, y + 5, { width: width - labelW - 14 });
      doc.y = y + h;
    }
    doc.x = left;
    doc.moveDown(0.8);
  };

  const money = (rows: MoneyRow[]) => {
    const cols = [width * 0.56, width * 0.22, width * 0.22];
    const row = (cells: string[], style: MoneyRow["style"] | "header") => {
      const isHead = style === "head" || style === "header";
      doc.font(style && style !== "head" ? "B" : isHead ? "B" : "R").fontSize(9.4);
      const h = doc.heightOfString(cells[0], { width: cols[0] - 14 }) + 10;
      ensure(h);
      const y = doc.y;
      if (style === "header") doc.rect(left, y, width, h).fill(NAVY);
      else if (style === "grand") doc.rect(left, y, width, h).fill("#dbe4f1");
      else if (style === "head" || style === "total") doc.rect(left, y, width, h).fill(SHADE);
      doc.rect(left, y, width, h).lineWidth(0.5).strokeColor(LINE).stroke();
      doc.fillColor(style === "header" ? "#ffffff" : style === "head" ? NAVY : INK);
      let x = left;
      cells.forEach((c, i) => {
        doc.text(c, x + 7, y + 5, { width: cols[i] - 14, align: i === 0 ? "left" : "right" });
        x += cols[i];
      });
      doc.y = y + h;
    };
    row(["Component", "Monthly", "Annual"], "header");
    for (const r of rows) row([r.label, r.monthly == null ? "" : inr(r.monthly), r.annual == null ? "" : inr(r.annual)], r.style);
    doc.x = left;
    doc.moveDown(0.8);
  };

  const sign = () => {
    ensure(78);
    doc.moveDown(0.6);
    doc.font("R").fontSize(10.2).fillColor(INK).text("Yours sincerely,", left, doc.y);
    doc.font("B").text(`For ${pack.employer}`, left, doc.y + 2);
    doc.moveDown(2.6);
    doc.moveTo(left, doc.y).lineTo(left + 170, doc.y).lineWidth(0.6).strokeColor(INK).stroke();
    doc.font("R").fontSize(9.6).text("Authorised Signatory", left, doc.y + 4);
    doc.moveDown(1);
  };

  const accept = () => {
    const text = `I, ${pack.personName}, have read and understood this letter and all its pages and annexures, and I accept the terms and conditions set out in them.`;
    doc.font("R").fontSize(10);
    const h = doc.heightOfString(text, { width: width - 24 }) + 96;
    ensure(h);
    const y = doc.y + 6;
    doc.rect(left, y, width, h).lineWidth(0.8).strokeColor(NAVY).stroke();
    doc.font("B").fontSize(10.5).fillColor(NAVY).text("ACCEPTANCE BY THE EMPLOYEE", left + 12, y + 10, { width: width - 24 });
    doc.font("R").fontSize(10).fillColor(INK).text(text, left + 12, doc.y + 4, { width: width - 24, align: "justify", lineGap: 2 });
    const lineY = y + h - 26;
    const third = (width - 24) / 3;
    ["Signature", "Date", "Place"].forEach((label, i) => {
      const x = left + 12 + i * third;
      doc.moveTo(x, lineY).lineTo(x + third - 18, lineY).lineWidth(0.6).strokeColor(INK).stroke();
      doc.font("R").fontSize(8.8).fillColor(GREY).text(label, x, lineY + 4, { width: third - 18 });
    });
    doc.x = left;
    doc.y = y + h + 8;
  };

  /** Height the paragraphs, headings and lists of a compact page take at a given shrink. */
  const measure = (blocks: PackBlock[], k: number) => {
    let h = 0;
    for (const b of blocks) {
      if (b.kind !== "p" && b.kind !== "h" && b.kind !== "list") continue;
      const size = (b.kind === "h" ? 10.4 : b.kind === "list" ? 10 : 10.2) - k;
      doc.font(b.kind === "h" ? "B" : "R").fontSize(size);
      const texts = b.kind === "list" ? b.items : [b.text];
      for (const t of texts) h += doc.heightOfString(t, { width, lineGap: 0.9 });
      h += size * 1.2 * ((b.kind === "h" ? 0.25 + 0.05 : 0.55) * 0.5) + 1;
    }
    return h;
  };
  const fitShrink = (blocks: PackBlock[], room: number) => {
    for (let k = 1.4; k <= 3; k += 0.2) if (measure(blocks, k) <= room * 0.96) return k;
    return 3; // very long terms: smallest size, and they carry on to the next page
  };

  const block = (b: PackBlock) => {
    if (b.kind === "p") return para(b.text);
    if (b.kind === "h") { ensure(compact ? 28 : 40); doc.moveDown(compact ? 0.05 : 0.15); return para(b.text, { font: "B", size: 10.4, color: NAVY, gap: 0.25, align: "left" }); }
    if (b.kind === "note") return para(b.text, { size: 8.6, color: GREY, align: "left" });
    if (b.kind === "list") {
      doc.font("R").fontSize(10);
      for (const item of b.items) {
        ensure(doc.heightOfString(item, { width: width - 18 }) + 4);
        const y = doc.y;
        doc.fillColor(NAVY).text("•", left + 4, y);
        doc.fillColor(INK).text(item, left + 18, y, { width: width - 18, lineGap: 2 });
        doc.moveDown(0.2);
      }
      doc.x = left;
      return doc.moveDown(0.4);
    }
    if (b.kind === "facts") return facts(b.rows);
    if (b.kind === "money") return money(b.rows);
    if (b.kind === "sign") return sign();
    return accept();
  };

  pack.pages.forEach((page, i) => {
    compact = false;
    if (i > 0) doc.addPage(); else letterhead();
    if (i === 0) {
      const multi = pack.pages.length > 1;
      if (multi) para("PRIVATE AND CONFIDENTIAL", { font: "B", size: 8.5, color: NAVY, gap: 0.4, align: "left" });
      const y = doc.y;
      doc.font("R").fontSize(9.6).fillColor(INK).text(`Ref: ${pack.ref}`, left, y, { width: width / 2 });
      doc.text(`Date: ${pack.date}`, left + width / 2, y, { width: width / 2, align: "right" });
      doc.x = left;
      doc.moveDown(1);
      if (pack.to.length) {
        doc.font("R").fontSize(10).text("To,", left, doc.y);
        pack.to.forEach((line, j) => doc.font(j === 0 ? "B" : "R").fontSize(10).text(line, left, doc.y, { width: width * 0.7 }));
        doc.moveDown(0.9);
      }
      para(`Subject: ${pack.subject}`, { font: "B", size: 10.4, gap: 0.9, align: "left" });
    } else {
      para(page.title, { font: "B", size: 12.5, color: NAVY, gap: 0.2, align: "center" });
      doc.moveTo(left + width / 2 - 40, doc.y + 2).lineTo(left + width / 2 + 40, doc.y + 2).lineWidth(1).strokeColor(NAVY).stroke();
      doc.moveDown(1);
    }
    compact = page.compact === true;
    if (compact) shrink = fitShrink(page.blocks, bottom() - doc.y);
    for (const b of page.blocks) block(b);
  });

  // Footer on every page: reference, page n of N, the employee's initials after the first page.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 46;
    doc.page.margins.bottom = 0;
    doc.moveTo(left, y - 6).lineTo(left + width, y - 6).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font("R").fontSize(7.8).fillColor(GREY);
    doc.text(`Ref: ${pack.ref}`, left, y, { width: width / 3, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, left + width / 3, y, { width: width / 3, align: "center", lineBreak: false });
    doc.text(pack.pages.length > 1 && i > range.start ? "Employee's initials: ________" : pack.employer, left + (2 * width) / 3, y, { width: width / 3, align: "right", lineBreak: false });
  }
  doc.end();
  return done;
}
