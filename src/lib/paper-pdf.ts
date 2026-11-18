import "server-only";

import PDFDocument from "pdfkit";

/**
 * Makes a plain A4 PDF of a letter or pay slip, so it can be kept in a person's folder.
 * Built-in fonts only (nothing to install on the server), so the rupee sign is written as "Rs."
 */
export type PaperPdf = {
  /** Printed small at the top: the company name and address. */
  letterhead: string[];
  title: string;
  /** Paragraphs; a line starting with "- " is shown as a bullet, a line of "---" draws a rule. */
  body: string[];
  /** Printed at the bottom left and right, e.g. the place and date, or a signature line. */
  footer?: string[];
};

const rupees = (text: string) => text.replace(/₹\s?/g, "Rs. ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

export async function paperToPdf(paper: PaperPdf): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: paper.title } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(13).text(rupees(paper.letterhead[0] ?? ""), { align: "center" });
  doc.font("Helvetica").fontSize(9);
  for (const line of paper.letterhead.slice(1)) doc.text(rupees(line), { align: "center" });
  doc.moveDown(0.6);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#888888").stroke();
  doc.moveDown(1);

  doc.font("Helvetica-Bold").fontSize(12).text(rupees(paper.title), { align: "center" });
  doc.moveDown(0.8);

  doc.font("Helvetica").fontSize(10.5);
  for (const raw of paper.body) {
    const line = rupees(raw);
    if (line.trim() === "---") {
      doc.moveDown(0.3);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#cccccc").stroke();
      doc.moveDown(0.5);
      continue;
    }
    if (line.startsWith("- ")) {
      doc.text(`• ${line.slice(2)}`, { indent: 12, align: "left", lineGap: 2 });
      continue;
    }
    doc.text(line, { align: "left", lineGap: 2 });
    doc.moveDown(0.5);
  }

  if (paper.footer?.length) {
    doc.moveDown(1.5);
    doc.fontSize(10);
    for (const line of paper.footer) doc.text(rupees(line), { align: "left" });
  }

  doc.end();
  return done;
}
