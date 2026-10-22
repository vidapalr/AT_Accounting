
import "server-only";

import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

const MAX_PAISE = 999999999999999999n;

export type FundingCheckResult =
  | "ok"
  | "agreement-mismatch"
  | "agreement-version-invalid"
  | "funding-policy-invalid"
  | "funding-principal-mismatch"
  | "missing-opening-funding"
  | "funding-gl-overlap"
  | "funding-transaction-invalid"
  | "profit-linked-requires-review";

export interface OpeningFundingLine {
  account_id: number;
  account_type: string;
  division_id: number | null;
  branch_id: number | null;
  credit: string;
  funding_party_id: number | null;
  agreement_id: number | null;
  classification: string | null;
  opening_amount: string | null;
}

interface AgreementRow extends RowDataPacket {
  id: number;
  party_id: number;
  division_id: number | null;
  branch_id: number | null;
  funding_type: string;
  status: string;
  effective_from: string;
  effective_to: string | null;
}

interface VersionRow extends RowDataPacket {
  id: number;
  version_status: string;
  effective_from: string;
  effective_to: string | null;
  policy_status: string | null;
}

interface TransactionRow extends RowDataPacket {
  transaction_type: string;
  amount: string;
  journal_entry_id: number | null;
  journal_status: string | null;
}

function toPaise(value: unknown): bigint | null {
  const text = String(value ?? "");

  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, fraction = ""] = text.split(".");
  const amount =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  return amount <= MAX_PAISE ? amount : null;
}

function id(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0
    ? n
    : null;
}

function sameScope(
  line: OpeningFundingLine,
  agreement: AgreementRow
): boolean {
  return (
    id(line.division_id) === id(agreement.division_id) &&
    id(line.branch_id) === id(agreement.branch_id)
  );
}

/**
 * Call only inside the existing opening-balance
 * posting transaction, AFTER locking the legal
 * business and BEFORE creating a journal.
 */
export async function validateOpeningFundingForPosting(
  conn: PoolConnection,
  businessId: number,
  openingDate: string,
  openingLines: OpeningFundingLine[]
): Promise<FundingCheckResult> {
  const [agreements] =
    await conn.execute<AgreementRow[]>(
      `SELECT
         id,
         party_id,
         division_id,
         branch_id,
         funding_type,
         status,
         DATE_FORMAT(effective_from, '%Y-%m-%d')
           AS effective_from,
         DATE_FORMAT(effective_to, '%Y-%m-%d')
           AS effective_to
       FROM acct_funding_agreements
       WHERE legal_business_id = ?
         AND effective_from <= ?
       ORDER BY id
       FOR UPDATE`,
      [businessId, openingDate]
    );

  const byAgreement = new Map<
    number,
    OpeningFundingLine
  >();

  // Check every investor funding line in the worksheet.
  for (const line of openingLines) {
    if (line.funding_party_id === null) {
      if (line.agreement_id !== null) {
        return "agreement-mismatch";
      }
      continue;
    }

    const agreementId = id(line.agreement_id);

    if (
      agreementId === null ||
      byAgreement.has(agreementId)
    ) {
      return "agreement-mismatch";
    }

    const credit = toPaise(line.credit);
    const amount = toPaise(line.opening_amount);

    if (
      credit === null ||
      credit <= 0n ||
      amount === null ||
      amount !== credit ||
      line.account_type !== "LIABILITY" ||
      line.classification !== "REPAYABLE_LIABILITY"
    ) {
      return "agreement-mismatch";
    }

    byAgreement.set(agreementId, line);
  }

  const agreementIds = new Set(
    agreements.map((a) => Number(a.id))
  );

  // Every referenced agreement must exist in the
  // same legal business and be applicable by date.
  for (const agreementId of byAgreement.keys()) {
    if (!agreementIds.has(agreementId)) {
      return "agreement-mismatch";
    }
  }

  for (const agreement of agreements) {
    const agreementId = Number(agreement.id);
    const line = byAgreement.get(agreementId);

    const [transactions] =
      await conn.execute<TransactionRow[]>(
        `SELECT
           t.transaction_type,
           CAST(t.amount AS CHAR) AS amount,
           t.journal_entry_id,
           j.status AS journal_status
         FROM acct_funding_transactions t
         LEFT JOIN acct_journal_entries j
           ON j.id = t.journal_entry_id
          AND j.legal_business_id =
              t.legal_business_id
         WHERE t.legal_business_id = ?
           AND t.agreement_id = ?
           AND t.transaction_date <= ?
           AND t.status = 'VERIFIED'
         ORDER BY t.id
         FOR UPDATE`,
        [businessId, agreementId, openingDate]
      );

    let principal = 0n;
    let hasPrincipalMovement = false;

    for (const transaction of transactions) {
      const amount = toPaise(transaction.amount);

      if (amount === null || amount <= 0n) {
        return "funding-transaction-invalid";
      }

      // Existing journal links require a documented
      // cutover review. We never double-post them.
      if (transaction.journal_entry_id !== null) {
        if (transaction.journal_status === "POSTED") {
          return "funding-gl-overlap";
        }

        return "funding-transaction-invalid";
      }

      switch (transaction.transaction_type) {
        case "FUNDING_RECEIVED":
          principal += amount;
          hasPrincipalMovement = true;
          break;

        case "PRINCIPAL_REPAID":
          principal -= amount;
          hasPrincipalMovement = true;
          break;

        case "RETURN_PAID":
          // Return payments do not automatically
          // reduce principal.
          break;

        default:
          return "funding-transaction-invalid";
      }

      if (
        principal < 0n ||
        principal > MAX_PAISE
      ) {
        return "funding-transaction-invalid";
      }
    }

    if (principal === 0n && !line) {
      continue;
    }

    if (!line && principal > 0n) {
      return "missing-opening-funding";
    }

    if (!line) {
      return "funding-principal-mismatch";
    }

    if (
      id(agreement.party_id) !==
        id(line.funding_party_id) ||
      !sameScope(line, agreement) ||
      agreement.status !== "ACTIVE" ||
      agreement.effective_from > openingDate ||
      (
        agreement.effective_to !== null &&
        agreement.effective_to < openingDate
      )
    ) {
      return "agreement-mismatch";
    }

    if (agreement.funding_type !== "LOAN") {
      return "profit-linked-requires-review";
    }

    if (
      !hasPrincipalMovement ||
      principal <= 0n ||
      toPaise(line.opening_amount) !== principal
    ) {
      return "funding-principal-mismatch";
    }

    // Approved historical versions may be marked
    // SUPERSEDED because another version became
    // effective later. The dates must identify
    // exactly one applicable version.
    const [versions] =
      await conn.execute<VersionRow[]>(
        `SELECT
           v.id,
           v.version_status,
           DATE_FORMAT(v.effective_from, '%Y-%m-%d')
             AS effective_from,
           DATE_FORMAT(v.effective_to, '%Y-%m-%d')
             AS effective_to,
           p.policy_status
         FROM acct_agreement_versions v
         LEFT JOIN acct_agreement_funding_policies p
           ON p.agreement_version_id = v.id
          AND p.agreement_id = v.agreement_id
          AND p.legal_business_id =
              v.legal_business_id
         WHERE v.legal_business_id = ?
           AND v.agreement_id = ?
           AND v.version_status IN (
             'APPROVED', 'SUPERSEDED'
           )
           AND v.effective_from <= ?
           AND (
             v.effective_to IS NULL
             OR v.effective_to >= ?
           )
         ORDER BY v.version_no DESC
         FOR UPDATE`,
        [
          businessId,
          agreementId,
          openingDate,
          openingDate,
        ]
      );

    if (versions.length !== 1) {
      return "agreement-version-invalid";
    }

    if (versions[0].policy_status !== "CONFIRMED") {
      return "funding-policy-invalid";
    }
  }

  return "ok";
}
