
import "server-only";

import path from "node:path";
import { readFile } from "node:fs/promises";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export type AgreementMergeData = {
  agreementNo: string;
  investorName: string;
  fundingScope: string;
  fundingType: "LOAN" | "PROFIT_LINKED";
  terms: Record<string, unknown>;
  policy: Record<string, unknown> | null;
};

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "TO BE AGREED";
  }

  return String(value);
}

function rupees(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "TO BE AGREED";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return display(value);
  }

  return `INR ${number.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function yesNo(value: unknown): string {
  if (value === null || value === undefined) {
    return "TO BE AGREED";
  }

  return Number(value) === 1 ? "Yes" : "No";
}

export async function generateFullAgreementDocx(
  input: AgreementMergeData
): Promise<Buffer> {
  const templatePath = path.join(
    process.cwd(),
    "private_templates",
    "Abhiram_Group_Profit_Participation_Agreement.docx"
  );

  const template = await readFile(templatePath);

  const t = input.terms;
  const p = input.policy;

  const profitShare =
    input.fundingType === "LOAN"
      ? "Not applicable — loan arrangement"
      : t.profit_share_percentage == null
        ? "TO BE AGREED"
        : `${display(t.profit_share_percentage)}%`;

  const lossRules = p
    ? [
        `Model: ${display(p.loss_sharing_model)}`,
        `Loss percentage: ${
          p.loss_share_percentage == null
            ? "According to confirmed terms"
            : `${display(p.loss_share_percentage)}%`
        }`,
        `Maximum loss exposure: ${rupees(
          p.maximum_loss_exposure
        )}`,
        `Settlement: ${display(
          p.loss_settlement_method
        )}`,
      ].join("; ")
    : "Funding and loss policy not confirmed.";

  const fundingRules = p
    ? [
        `Funding model: ${display(p.funding_model)}`,
        `Maximum outstanding: ${rupees(
          p.maximum_outstanding
        )}`,
        `Additional funding: ${yesNo(
          p.additional_funding_allowed
        )}`,
        `Flexible repayment: ${yesNo(
          p.flexible_repayment_allowed
        )}`,
        `Principal repayment: ${display(
          t.principal_repayment_terms
        )}`,
      ].join("; ")
    : display(t.principal_repayment_terms);

  const zeroBalanceRule = p
    ? yesNo(p.entitlement_on_zero_balance)
    : "TO BE AGREED";

  const ownerResidual =
    input.fundingType === "PROFIT_LINKED" &&
    t.profit_share_percentage != null
      ? (
          100 - Number(t.profit_share_percentage)
        ).toFixed(4)
      : null;

  // The residual below is not a complete pool allocation
  // if other investors participate in the same pool.
  // Therefore it must not be presented as final.
  const participationSchedule =
    input.fundingType === "PROFIT_LINKED"
      ? (
          `Participant: ${input.investorName}; ` +
          `individual contractual participation: ${profitShare}. ` +
          "Group residual and all other participant shares " +
          "must be confirmed against the complete approved " +
          "profit-pool register before execution."
        )
      : "Not applicable to this loan agreement.";

  const values: Record<string, string> = {
    agreement_no: input.agreementNo,
    execution_details:
      "TO BE COMPLETED AT EXECUTION",
    business_party:
      "Ravi Shanker Vidapalapati, proprietor, " +
      "carrying on business as Abhiram Group",
    investor_name: input.investorName,
    funding_scope: input.fundingScope,
    profit_share: profitShare,
    funding_commitment: rupees(t.committed_amount),
    effective_from: display(t.effective_from),
    participation_schedule: participationSchedule,
    loss_rules: lossRules,
    funding_rules: fundingRules,
    zero_balance_rule: zeroBalanceRule,
    payment_rules:
      `Payout frequency: ${display(t.payout_frequency)}; ` +
      `Other conditions: ${display(t.agreement_notes)}`,
  };

  // Avoid making unsupported claims about the owner's
  // residual. The calculation belongs to the pool register.
  void ownerResidual;

  const zip = new PizZip(template);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "TO BE AGREED",
  });

  doc.render(values);

  return doc.toBuffer();
}
