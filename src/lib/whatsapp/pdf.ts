import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
// @ts-ignore pdfkit may be installed without TypeScript declarations.
import PDFDocument from "pdfkit";

import type { ReportContent } from "./core";

const NAVY = "#142c50";
const GREY = "#64748b";

async function asset(...parts: string[]): Promise<Buffer> {
  return readFile(join(/* turbopackIgnore: true */ process.cwd(), ...parts));
}

/** A4 PDF with the Abhiram Group letterhead, one table per section. */
export async function renderPdf(content: ReportContent, printedOn: string): Promise<Buffer> {
  const [regular, bold, logo] = await Promise.all([
    asset("assets", "fonts", "DejaVuSans.ttf"),
    asset("assets", "fonts", "DejaVuSans-Bold.ttf"),
    asset("public", "brand", "abhiram-logo-print.png"),
  ]);

  const wide = content.sections.some((s) => s.columns.length > 5);
  const doc = new PDFDocument({ size: "A4", layout: wide ? "landscape" : "portrait", margin: 36, info: { Title: content.title, Author: "Abhiram Group" } });
  doc.registerFont("R", regular);
  doc.registerFont("B", bold);
  doc.font("R");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.image(logo, left, 36, { width: 52 });
  doc.font("B").fontSize(18).fillColor(NAVY).text("ABHIRAM GROUP", left + 64, 40);
  doc.font("R").fontSize(12).fillColor("#334155").text(content.title, left + 64, 62);
  doc.fontSize(9).fillColor(GREY).text(content.subtitle, left + 64, 78, { width: width - 64 });
  doc.fontSize(8).fillColor(GREY).text(`Printed ${printedOn}`, left, 40, { width, align: "right" });
  doc.moveTo(left, 98).lineTo(left + width, 98).lineWidth(1.5).strokeColor(NAVY).stroke();
  doc.y = 110;

  const ensure = (needed: number) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 24) doc.addPage();
  };

  for (const section of content.sections) {
    ensure(60);
    doc.font("B").fontSize(11).fillColor(NAVY).text(section.heading, left, doc.y);
    doc.moveDown(0.3);

    const n = section.columns.length;
    const weights = section.columns.map((c, i) => (i === 0 ? 1.6 : /amount|total|qty|share|your part|profit then/i.test(c) ? 1 : 1.2));
    const sum = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / sum) * width);
    const numeric = section.columns.map((c) => /amount|total|qty|your part|profit then|balance|units|share/i.test(c));

    const drawRow = (cells: string[], header: boolean, shade: boolean) => {
      doc.font(header ? "B" : "R").fontSize(8.5);
      const heights = cells.map((cell, i) => doc.heightOfString(cell || " ", { width: widths[i] - 8 }));
      const h = Math.max(...heights) + 8;
      ensure(h);
      const y = doc.y;
      if (header) doc.rect(left, y, width, h).fill("#e8eef7");
      else if (shade) doc.rect(left, y, width, h).fill("#f8fafc");
      doc.fillColor(header ? NAVY : "#0f172a");
      let x = left;
      cells.forEach((cell, i) => {
        doc.text(cell, x + 4, y + 4, { width: widths[i] - 8, align: numeric[i] && !header ? "right" : header && numeric[i] ? "right" : "left" });
        x += widths[i];
      });
      doc.y = y + h;
    };

    drawRow(section.columns, true, false);
    section.rows.forEach((row, i) => drawRow(row.slice(0, n), false, i % 2 === 1));
    doc.moveDown(0.9);
  }

  if (content.footnote) {
    ensure(40);
    doc.font("R").fontSize(8).fillColor(GREY).text(content.footnote, left, doc.y, { width });
  }

  doc.end();
  return done;
}
