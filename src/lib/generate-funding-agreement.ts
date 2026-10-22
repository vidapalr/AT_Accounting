
import "server-only";

import path from "node:path";
import { readFile } from "node:fs/promises";
declare const require: (id: string) => any;

const {
  AlignmentType,
  Document,
  Header,
  Footer,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require("docx");

type Terms = Record<string, unknown>;

type Input = {
  agreementNo: string;
  versionNo: number;
  investorName: string;
  scopeName: string;
  fundingType: "LOAN" | "PROFIT_LINKED";
  terms: Terms;
  policy: Record<string, unknown> | null;
  generatedOn: string;
};

function value(v: unknown): string {
  if (v === null || v === undefined || v === "") {
    return "Not specified";
  }
  return String(v);
}

function money(v: unknown): string {
  if (v === null || v === undefined || v === "") {
    return "Not specified";
  }

  const n = Number(v);
  return Number.isFinite(n)
    ? `INR ${n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : value(v);
}

function row(label: string, content: string) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            children: [new TextRun({ text: label, bold: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        children: [new Paragraph(content)],
      }),
    ],
  });
}

function heading(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
  });
}

function paragraph(text: string) {
  return new Paragraph({
    text,
    spacing: { after: 120 },
  });
}

export async function generateFundingAgreementDocx(
  input: Input
): Promise<Buffer> {
  const logoPath = path.join(
    process.cwd(),
    "private_templates",
    "logo.png"
  );

  const logo = await readFile(logoPath);

  const t = input.terms;
  const p = input.policy;

  const details = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      row("Agreement number", input.agreementNo),
      row("Agreement version", `Version ${input.versionNo}`),
      row("Funding party", input.investorName),
      row("Business", "Abhiram Group"),
      row("Funding scope", input.scopeName),
      row("Funding type", input.fundingType),
      row("Committed funding", money(t.committed_amount)),
      row("Profit participation", t.profit_share_percentage == null
        ? "Not applicable"
        : `${value(t.profit_share_percentage)}%`),
      row("Profit calculation basis", value(t.profit_basis)),
      row("Interest rate", t.interest_rate_percentage == null
        ? "Not applicable"
        : `${value(t.interest_rate_percentage)}%`),
      row("Interest method", value(t.interest_method)),
      row("Effective from", value(t.effective_from)),
      row("Effective to", value(t.effective_to)),
      row("Payout frequency", value(t.payout_frequency)),
      row("Repayment terms", value(t.principal_repayment_terms)),
      row("Loss-sharing terms", value(t.loss_sharing_terms)),
      row("Agreement notes", value(t.agreement_notes)),
    ],
  });

  const policyRows = p
    ? [
        row("Funding model", value(p.funding_model)),
        row("Maximum outstanding", money(p.maximum_outstanding)),
        row("Minimum funding", money(p.minimum_funding)),
        row("Additional funding permitted",
          Number(p.additional_funding_allowed) === 1 ? "Yes" : "No"),
        row("Flexible repayment permitted",
          Number(p.flexible_repayment_allowed) === 1 ? "Yes" : "No"),
        row("Profit entitlement model",
          value(p.profit_entitlement_model)),
        row("Profit rights at zero balance",
          p.entitlement_on_zero_balance == null
            ? "Not specified"
            : Number(p.entitlement_on_zero_balance) === 1
              ? "Yes" : "No"),
        row("Loss-sharing model",
          value(p.loss_sharing_model)),
        row("Loss-sharing percentage",
          p.loss_share_percentage == null
            ? "Not specified"
            : `${value(p.loss_share_percentage)}%`),
        row("Maximum loss exposure",
          money(p.maximum_loss_exposure)),
        row("Loss settlement method",
          value(p.loss_settlement_method)),
        row("Profit calculation order",
          value(p.profit_calculation_order)),
        row("Additional policy conditions",
          value(p.policy_notes)),
      ]
    : [];

  const doc = new Document({
    creator: "Abhiram Group Accounting",
    title: `Funding Agreement ${input.agreementNo}`,
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: logo,
                    transformation: {
                      width: 120,
                      height: 55,
                    },
                    type: "png",
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "ABHIRAM GROUP",
                    bold: true,
                    size: 24,
                    color: "17447D",
                  }),
                ],
              }),
            ],
          }),
        },

        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                text: "Abhiram Group | Confidential funding document",
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },

        children: [
          new Paragraph({
            text: "FUNDING & PROFIT PARTICIPATION",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "AGREEMENT DETAILS — DRAFT FOR REVIEW",
            alignment: AlignmentType.CENTER,
            spacing: { after: 250 },
          }),

          paragraph(
            `Generated on ${input.generatedOn}. This document is an ` +
            "unsigned record of the agreement information stored in " +
            "Abhiram Group Accounting. It must be reviewed against " +
            "the full contractual agreement before signing."
          ),

          heading("1. Parties and Funding Terms"),
          details,

          heading("2. Additional Funding and Profit/Loss Policy"),
          ...(policyRows.length
            ? [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: policyRows,
                }),
              ]
            : [
                paragraph(
                  "No confirmed funding policy is attached to this " +
                  "version. Terms must be verified before execution."
                ),
              ]),

          heading("3. Profit Participation and Amendments"),
          paragraph(
            "Profit participation applies only to the contractual " +
            "profit pool, calculation basis, eligibility conditions " +
            "and effective period specified by the executed agreement."
          ),
          paragraph(
            "Any change in profit participation, loss sharing or " +
            "contractual rights requires the approvals or consent " +
            "specified in the agreement. Historical entitlements " +
            "remain governed by the terms effective during each period."
          ),

          heading("4. Full Contractual Terms"),
          paragraph(
            "This generated record is not a substitute for the " +
            "complete Abhiram Group Profit-Linked Funding and " +
            "Participation Agreement. Additional provisions on " +
            "withdrawal, confidentiality, disputes, tax, termination " +
            "and legal status must be reviewed and agreed separately."
          ),

          heading("5. Signatures — Only After Final Review"),
          paragraph("For Abhiram Group: __________________________"),
          paragraph("Funding Party: ______________________________"),
          paragraph("Date: _____________________________________"),
          paragraph("Witness 1: __________________________________"),
          paragraph("Witness 2: __________________________________"),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
