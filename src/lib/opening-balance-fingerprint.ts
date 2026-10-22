
import "server-only";

import { createHash } from "node:crypto";
import type {
  PoolConnection,
  RowDataPacket,
} from "mysql2/promise";

interface WorksheetRow extends RowDataPacket {
  line_no: number;
  account_id: string;
  division_id: string | null;
  branch_id: string | null;
  debit: string;
  credit: string;
  notes: string | null;
  agreement_id: string | null;
  funding_party_id: string | null;
  funding_reference: string | null;
  classification: string | null;
  opening_amount: string | null;
}

interface InvestorBankWorksheetRow extends RowDataPacket {
  bank_account_id: string;
  opening_amount: string;
}

export async function openingWorksheetHash(
  conn: PoolConnection,
  businessId: number,
  batchId: number
): Promise<string> {
  const [batches] = await conn.execute<RowDataPacket[]>(
    `SELECT
       DATE_FORMAT(opening_date, '%Y-%m-%d')
         AS opening_date,
       financial_year_id,
       accounting_period_id,
       description,
       status
     FROM acct_opening_balance_batches
     WHERE legal_business_id = ?
       AND id = ?`,
    [businessId, batchId]
  );

  if (batches.length !== 1) {
    throw new Error("Opening worksheet not found");
  }

  const [lines] = await conn.execute<WorksheetRow[]>(
    `SELECT
       l.line_no,
       CAST(l.account_id AS CHAR) AS account_id,
       CAST(l.division_id AS CHAR) AS division_id,
       CAST(l.branch_id AS CHAR) AS branch_id,
       CAST(l.debit AS CHAR) AS debit,
       CAST(l.credit AS CHAR) AS credit,
       l.notes,
       CAST(f.agreement_id AS CHAR) AS agreement_id,
       CAST(f.funding_party_id AS CHAR)
         AS funding_party_id,
       f.funding_reference,
       f.classification,
       CAST(f.opening_amount AS CHAR)
         AS opening_amount
     FROM acct_opening_balance_lines l
     LEFT JOIN acct_opening_funding_details f
       ON f.legal_business_id = l.legal_business_id
      AND f.opening_line_id = l.id
     WHERE l.legal_business_id = ?
       AND l.batch_id = ?
     ORDER BY l.line_no`,
    [businessId, batchId]
  );

  const [investorBankBalances] =
    await conn.execute<InvestorBankWorksheetRow[]>(
      `SELECT
         CAST(bank_account_id AS CHAR) AS bank_account_id,
         CAST(opening_amount AS CHAR) AS opening_amount
       FROM acct_opening_investor_bank_balances
       WHERE legal_business_id = ?
         AND batch_id = ?
       ORDER BY bank_account_id`,
      [businessId, batchId]
    );

  // Canonical serialization. All selected values are
  // database values, not browser-provided values.
  const payload = {
    batch: {
      date: batches[0].opening_date,
      financialYearId: String(
        batches[0].financial_year_id
      ),
      accountingPeriodId: String(
        batches[0].accounting_period_id
      ),
      description: batches[0].description,
      status: batches[0].status,
    },
    lines: lines.map((line) => ({
      lineNo: String(line.line_no),
      accountId: line.account_id,
      divisionId: line.division_id,
      branchId: line.branch_id,
      debit: line.debit,
      credit: line.credit,
      notes: line.notes,
      agreementId: line.agreement_id,
      fundingPartyId: line.funding_party_id,
      fundingReference: line.funding_reference,
      classification: line.classification,
      openingAmount: line.opening_amount,
    })),
    investorBankBalances: investorBankBalances.map((line) => ({
      bankAccountId: line.bank_account_id,
      openingAmount: line.opening_amount,
    })),
  };

  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
