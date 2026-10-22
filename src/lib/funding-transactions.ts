
import "server-only";

import { db } from "@/lib/db";
import type { RowDataPacket } from "mysql2";

export interface FundingReceipt extends RowDataPacket {
  id: number;
  transaction_no: string;
  agreement_id: number;
  agreement_no: string;
  party_name: string;
  division_name: string | null;
  branch_name: string | null;
  transaction_date: string;
  transaction_type: string;
  amount: string;
  payment_method: string;
  deposit_account: string;
  payment_reference: string | null;
  remarks: string | null;
  status: "DRAFT" | "VERIFIED" | "VOID";
}

export interface ReceiptAgreement extends RowDataPacket {
  id: number;
  agreement_no: string;
  party_name: string;
  division_name: string | null;
  branch_name: string | null;
  funding_model: string;
  committed_amount: string;
  maximum_outstanding: string | null;
  verified_outstanding: string;
  pending_receipts: string;
}

export async function getFundingReceipts(
  businessId: number
): Promise<FundingReceipt[]> {
  const [rows] = await db.execute<FundingReceipt[]>(
    `SELECT
       t.id,
       t.transaction_no,
       t.agreement_id,
       a.agreement_no,
       p.full_name AS party_name,
       d.name AS division_name,
       b.branch_name,
       DATE_FORMAT(t.transaction_date, '%Y-%m-%d')
         AS transaction_date,
       t.transaction_type,
       t.amount,
       t.payment_method,
       COALESCE(
         CONCAT(
           bank.bank_name,
           ' — ',
           bank.account_label,
           ' ••••',
           bank.account_number_last4
         ),
         cash.cash_name,
         'Not assigned'
       ) AS deposit_account,
       t.payment_reference,
       t.remarks,
       t.status
     FROM acct_funding_transactions t
     JOIN acct_funding_agreements a
       ON a.id = t.agreement_id
      AND a.legal_business_id = t.legal_business_id
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
     LEFT JOIN acct_divisions d
       ON d.id = a.division_id
      AND d.legal_business_id = a.legal_business_id
     LEFT JOIN acct_branches b
       ON b.id = a.branch_id
      AND b.legal_business_id = a.legal_business_id
      AND b.division_id = a.division_id
     LEFT JOIN acct_bank_accounts bank
       ON bank.id = t.bank_account_id
      AND bank.legal_business_id = t.legal_business_id
     LEFT JOIN acct_cash_accounts cash
       ON cash.id = t.cash_account_id
      AND cash.legal_business_id = t.legal_business_id
     WHERE t.legal_business_id = ?
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT 200`,
    [businessId]
  );

  return rows;
}

export async function getReceiptAgreements(
  businessId: number
): Promise<ReceiptAgreement[]> {
  const [rows] = await db.execute<ReceiptAgreement[]>(
    `SELECT
       a.id,
       a.agreement_no,
       p.full_name AS party_name,
       d.name AS division_name,
       b.branch_name,
       fp.funding_model,
       a.committed_amount,
       fp.maximum_outstanding,

       COALESCE((
         SELECT SUM(
           CASE
             WHEN t.transaction_type = 'FUNDING_RECEIVED'
               THEN t.amount
             WHEN t.transaction_type = 'PRINCIPAL_REPAID'
               THEN -t.amount
             ELSE 0
           END
         )
         FROM acct_funding_transactions t
         WHERE t.agreement_id = a.id
           AND t.legal_business_id = a.legal_business_id
           AND t.status = 'VERIFIED'
       ), 0) AS verified_outstanding,

       COALESCE((
         SELECT SUM(t.amount)
         FROM acct_funding_transactions t
         WHERE t.agreement_id = a.id
           AND t.legal_business_id = a.legal_business_id
           AND t.status = 'DRAFT'
           AND t.transaction_type = 'FUNDING_RECEIVED'
       ), 0) AS pending_receipts

     FROM acct_funding_agreements a
     JOIN acct_funding_parties p
       ON p.id = a.party_id
      AND p.legal_business_id = a.legal_business_id
      AND p.status = 'ACTIVE'

     JOIN acct_agreement_versions v
       ON v.agreement_id = a.id
      AND v.legal_business_id = a.legal_business_id
      -- Exactly one version per agreement is APPROVED:
      -- approving an amendment supersedes the previous one.
      -- Do not pin version_no = 1, or amended agreements vanish.
      AND v.version_status = 'APPROVED'

     JOIN acct_agreement_funding_policies fp
       ON fp.agreement_version_id = v.id
      AND fp.agreement_id = a.id
      AND fp.legal_business_id = a.legal_business_id
      AND fp.policy_status = 'CONFIRMED'

     LEFT JOIN acct_divisions d
       ON d.id = a.division_id
      AND d.legal_business_id = a.legal_business_id

     LEFT JOIN acct_branches b
       ON b.id = a.branch_id
      AND b.division_id = a.division_id
      AND b.legal_business_id = a.legal_business_id

     WHERE a.legal_business_id = ?
       AND a.status = 'ACTIVE'
       AND (
         a.division_id IS NULL OR d.status = 'ACTIVE'
       )
       AND (
         a.branch_id IS NULL OR b.status = 'ACTIVE'
       )
       AND NOT EXISTS (
         SELECT 1
         FROM acct_agreement_amendments am
         WHERE am.agreement_id = a.id
           AND am.legal_business_id = a.legal_business_id
           AND am.status = 'PENDING'
       )
     ORDER BY a.agreement_no`,
    [businessId]
  );

  return rows;
}
