
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/investor-scope-amendment";

type AgreementRow = RowDataPacket & {
  id: number;
  party_id: number;
  division_id: number | null;
  branch_id: number | null;
  status: string;
  agreement_no: string;
  funding_type: string;
};

type AmendmentRow = RowDataPacket & {
  id: number;
  from_version_id: number | null;
  to_version_id: number;
  status: string;
  requested_by: number;
};

type VersionRow = RowDataPacket & {
  id: number;
  version_no: number;
  version_status: string;
  effective_from: string;
  terms_json: string;
};

function finish(result: string): never {
  redirect(`${PAGE}?result=${encodeURIComponent(result)}`);
}

export async function approveDivisionScopeAmendmentAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  if (form.get("confirm") !== "APPROVE_AMENDMENT_1") {
    finish("approval-invalid");
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ? FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      outcome = "business-not-found";
    } else {
      const [agreements] =
        await conn.execute<AgreementRow[]>(
          `SELECT
             id,
             agreement_no,
             party_id,
             division_id,
             branch_id,
             funding_type,
             status
           FROM acct_funding_agreements
           WHERE legal_business_id = ?
             AND id = 2
           FOR UPDATE`,
          [businessId]
        );

      const agreement = agreements[0];

      const [amendments] =
        await conn.execute<AmendmentRow[]>(
          `SELECT
             id,
             from_version_id,
             to_version_id,
             status,
             requested_by
           FROM acct_agreement_amendments
           WHERE legal_business_id = ?
             AND agreement_id = 2
             AND id = 1
           FOR UPDATE`,
          [businessId]
        );

      const amendment = amendments[0];

      if (
        !agreement ||
        !amendment ||
        agreement.status !== "ACTIVE" ||
        agreement.agreement_no !== "ATX_DNL_01" ||
        Number(agreement.party_id) !== 2 ||
        Number(agreement.division_id) !== 1 ||
        Number(agreement.branch_id) !== 1 ||
        agreement.funding_type !== "PROFIT_LINKED" ||
        amendment.status !== "PENDING" ||
        Number(amendment.from_version_id) !== 2 ||
        Number(amendment.to_version_id) !== 3
      ) {
        outcome = "state-invalid";
      } else {
        const [versions] =
          await conn.execute<VersionRow[]>(
            `SELECT
               id,
               version_no,
               version_status,
               DATE_FORMAT(effective_from, '%Y-%m-%d')
                 AS effective_from,
               terms_json
             FROM acct_agreement_versions
             WHERE legal_business_id = ?
               AND agreement_id = 2
               AND id IN (2, 3)
             ORDER BY id
             FOR UPDATE`,
            [businessId]
          );

        const oldVersion = versions.find(
          v => Number(v.id) === 2
        );

        const nextVersion = versions.find(
          v => Number(v.id) === 3
        );

        let oldTerms: Record<string, unknown> | null = null;
        let nextTerms: Record<string, unknown> | null = null;

        try {
          if (oldVersion) {
            oldTerms = JSON.parse(oldVersion.terms_json);
          }
          if (nextVersion) {
            nextTerms = JSON.parse(nextVersion.terms_json);
          }
        } catch {
          outcome = "terms-invalid";
        }

        if (
          !oldVersion ||
          !nextVersion ||
          oldVersion.version_status !== "APPROVED" ||
          nextVersion.version_status !== "DRAFT" ||
          Number(oldVersion.version_no) !== 1 ||
          Number(nextVersion.version_no) !== 2 ||
          nextVersion.effective_from !== "2026-10-17" ||
          !oldTerms ||
          !nextTerms ||
          oldTerms.funding_scope !== "BRANCH" ||
          Number(oldTerms.branch_id) !== 1 ||
          nextTerms.funding_scope !== "DIVISION" ||
          nextTerms.branch_id !== null ||
          Number(nextTerms.division_id) !== 1
        ) {
          outcome = "terms-invalid";
        } else {
          const expectedTerms = {
            ...oldTerms,
            division_id: 1,
            branch_id: null,
            funding_scope: "DIVISION",
          };

          // Only the three intended scope fields
          // may differ from the old approved terms.
          const canonical = (value: unknown): string =>
            JSON.stringify(
              Object.entries(
                value as Record<string, unknown>
              ).sort(([a], [b]) => a.localeCompare(b))
            );

          if (
            canonical(nextTerms) !== canonical(expectedTerms)
          ) {
            outcome = "financial-terms-changed";
          } else {
            const [policies] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id, policy_status
                 FROM acct_agreement_funding_policies
                 WHERE legal_business_id = ?
                   AND agreement_id = 2
                   AND agreement_version_id = 3
                 FOR UPDATE`,
                [businessId]
              );

            if (
              policies.length !== 1 ||
              policies[0].policy_status !== "DRAFT"
            ) {
              outcome = "policy-invalid";
            } else {
              const [updatedAgreement] =
                await conn.execute<ResultSetHeader>(
                  `UPDATE acct_funding_agreements
                   SET division_id = 1,
                       branch_id = NULL
                   WHERE id = 2
                     AND legal_business_id = ?
                     AND division_id = 1
                     AND branch_id = 1
                     AND status = 'ACTIVE'`,
                  [businessId]
                );

              if (updatedAgreement.affectedRows !== 1) {
                throw new Error("Agreement update conflict");
              }

              await conn.execute(
                `UPDATE acct_agreement_versions
                 SET version_status = 'SUPERSEDED'
                 WHERE id = 2
                   AND legal_business_id = ?
                   AND version_status = 'APPROVED'`,
                [businessId]
              );

              await conn.execute(
                `UPDATE acct_agreement_versions
                 SET version_status = 'APPROVED',
                     approved_by = ?,
                     approved_at = CURRENT_TIMESTAMP
                 WHERE id = 3
                   AND legal_business_id = ?
                   AND version_status = 'DRAFT'`,
                [user.id, businessId]
              );

              await conn.execute(
                `UPDATE acct_agreement_funding_policies
                 SET policy_status = 'CONFIRMED'
                 WHERE legal_business_id = ?
                   AND agreement_id = 2
                   AND agreement_version_id = 3
                   AND policy_status = 'DRAFT'`,
                [businessId]
              );

              await conn.execute(
                `UPDATE acct_agreement_amendments
                 SET status = 'APPROVED',
                     reviewed_by = ?,
                     reviewed_at = CURRENT_TIMESTAMP,
                     review_notes = ?
                 WHERE id = 1
                   AND legal_business_id = ?
                   AND agreement_id = 2
                   AND status = 'PENDING'`,
                [
                  user.id,
                  "Approved division-wide funding scope. " +
                    "Existing financial terms retained.",
                  businessId,
                ]
              );

              await conn.execute(
                `INSERT INTO acct_audit_events (
                   legal_business_id,
                   actor_user_id,
                   action,
                   subject_type,
                   subject_id,
                   details_json
                 ) VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  businessId,
                  user.id,
                  "AGREEMENT_SCOPE_AMENDMENT_APPROVED",
                  "AGREEMENT_AMENDMENT",
                  1,
                  JSON.stringify({
                    agreement_id: 2,
                    from_version_id: 2,
                    to_version_id: 3,
                    effective_from: "2026-10-17",
                    previous_branch_id: 1,
                    new_branch_id: null,
                    division_id: 1,
                    financial_terms_changed: false,
                  }),
                ]
              );

              await conn.commit();
              outcome = "approved";
            }
          }
        }
      }
    }

    if (outcome !== "approved") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Investor scope approval failed", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "approved") {
    revalidatePath(PAGE);
    revalidatePath("/accounting/purchase-management");
  }

  finish(outcome);
}
