
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { getActiveDivisionId } from "@/lib/division-context";

const BUSINESS_AGREEMENT_ID = 2;
const OLD_BRANCH_ID = 1;
const RETURN_URL = "/accounting/investor-scope-amendment";

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
  );
}

function go(result: string): never {
  redirect(`${RETURN_URL}?result=${encodeURIComponent(result)}`);
}

export async function createDivisionScopeAmendmentAction(
  form: FormData
): Promise<void> {
  const user = await requireGroupOwner();
  const DIVISION_ID = await getActiveDivisionId(user);
  const businessId = user.legal_business_id;

  const rawDate = form.get("effective_from");
  const effectiveFrom =
    typeof rawDate === "string" ? rawDate.trim() : "";

  const confirmed =
    form.get("confirm") === "REQUEST_SCOPE_AMENDMENT";

  if (!validDate(effectiveFrom) || !confirmed) {
    go("invalid");
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    const [agreements] = await conn.execute<RowDataPacket[]>(
      `SELECT
         id,
         agreement_no,
         party_id,
         division_id,
         branch_id,
         funding_type,
         status,
         DATE_FORMAT(effective_from, '%Y-%m-%d')
           AS effective_from
       FROM acct_funding_agreements
       WHERE legal_business_id = ?
         AND id = ?
       FOR UPDATE`,
      [businessId, BUSINESS_AGREEMENT_ID]
    );

    const agreement = agreements[0];

    if (
      business.length !== 1 ||
      !agreement ||
      agreement.status !== "ACTIVE" ||
      Number(agreement.party_id) !== 2 ||
      Number(agreement.division_id) !== DIVISION_ID ||
      Number(agreement.branch_id) !== OLD_BRANCH_ID ||
      agreement.funding_type !== "PROFIT_LINKED"
    ) {
      outcome = "agreement-invalid";
    } else if (effectiveFrom < agreement.effective_from) {
      outcome = "date-invalid";
    } else {
      const [versions] = await conn.execute<RowDataPacket[]>(
        `SELECT
           id,
           version_no,
           version_status,
           terms_json
         FROM acct_agreement_versions
         WHERE legal_business_id = ?
           AND agreement_id = ?
         ORDER BY version_no DESC
         FOR UPDATE`,
        [businessId, BUSINESS_AGREEMENT_ID]
      );

      const [pending] = await conn.execute<RowDataPacket[]>(
        `SELECT a.id
         FROM acct_agreement_amendments a
         WHERE a.legal_business_id = ?
           AND a.agreement_id = ?
           AND a.status = 'PENDING'
         LIMIT 1`,
        [businessId, BUSINESS_AGREEMENT_ID]
      );

      const current = versions[0];

      if (pending.length > 0) {
        outcome = "amendment-pending";
      } else if (
        !current ||
        current.version_status !== "APPROVED"
      ) {
        outcome = "version-invalid";
      } else {
        let terms: Record<string, unknown> | null = null;

        try {
          const value: unknown = JSON.parse(current.terms_json);

          if (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
          ) {
            terms = value as Record<string, unknown>;
          }
        } catch {
          terms = null;
        }

        const effectiveTo = terms?.effective_to;

        if (
          !terms ||
          terms.agreement_no !== agreement.agreement_no ||
          Number(terms.party_id) !== Number(agreement.party_id) ||
          Number(terms.division_id) !== DIVISION_ID ||
          Number(terms.branch_id) !== OLD_BRANCH_ID ||
          terms.funding_scope !== "BRANCH" ||
          !(effectiveTo === null || typeof effectiveTo === "string")
        ) {
          outcome = "terms-invalid";
        } else {
          const [policies] = await conn.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_agreement_funding_policies
             WHERE legal_business_id = ?
               AND agreement_id = ?
               AND agreement_version_id = ?
               AND policy_status = 'CONFIRMED'
             FOR UPDATE`,
            [
              businessId,
              BUSINESS_AGREEMENT_ID,
              current.id,
            ]
          );

          if (policies.length !== 1) {
            outcome = "policy-invalid";
          } else {
            // Modify only the proposed funding scope.
            // Do not alter monetary or profit-sharing terms.
            const nextTerms = {
              ...terms,
              division_id: DIVISION_ID,
              branch_id: null,
              funding_scope: "DIVISION",
            };

            const nextVersionNo = Number(current.version_no) + 1;

            const [version] =
              await conn.execute<ResultSetHeader>(
                `INSERT INTO acct_agreement_versions (
                   legal_business_id,
                   agreement_id,
                   version_no,
                   version_status,
                   effective_from,
                   effective_to,
                   terms_json,
                   change_reason,
                   created_by
                 )
                 VALUES (
                   ?, ?, ?, 'DRAFT',
                   ?, ?, ?, ?, ?
                 )`,
                [
                  businessId,
                  BUSINESS_AGREEMENT_ID,
                  nextVersionNo,
                  effectiveFrom,
                  effectiveTo,
                  JSON.stringify(nextTerms),
                  "Proposed extension from Kapra Branch " +
                    "to Abhiram Textiles division-wide funding",
                  user.id,
                ]
              );

            // Copy the existing funding policy to the
            // proposed version without changing its terms.
            const [copied] =
              await conn.execute<ResultSetHeader>(
                `INSERT INTO acct_agreement_funding_policies (
                   legal_business_id,
                   agreement_id,
                   agreement_version_id,
                   policy_status,
                   funding_model,
                   maximum_outstanding,
                   minimum_funding,
                   additional_funding_allowed,
                   flexible_repayment_allowed,
                   profit_entitlement_model,
                   entitlement_on_zero_balance,
                   loss_sharing_model,
                   loss_share_percentage,
                   maximum_loss_exposure,
                   loss_settlement_method,
                   profit_calculation_order,
                   policy_notes,
                   created_by
                 )
                 SELECT
                   legal_business_id,
                   agreement_id,
                   ?,
                   'DRAFT',
                   funding_model,
                   maximum_outstanding,
                   minimum_funding,
                   additional_funding_allowed,
                   flexible_repayment_allowed,
                   profit_entitlement_model,
                   entitlement_on_zero_balance,
                   loss_sharing_model,
                   loss_share_percentage,
                   maximum_loss_exposure,
                   loss_settlement_method,
                   profit_calculation_order,
                   policy_notes,
                   ?
                 FROM acct_agreement_funding_policies
                 WHERE legal_business_id = ?
                   AND agreement_id = ?
                   AND agreement_version_id = ?
                   AND policy_status = 'CONFIRMED'`,
                [
                  version.insertId,
                  user.id,
                  businessId,
                  BUSINESS_AGREEMENT_ID,
                  current.id,
                ]
              );

            if (copied.affectedRows !== 1) {
              throw new Error("Funding policy copy failed");
            }

            const [amendment] =
              await conn.execute<ResultSetHeader>(
                `INSERT INTO acct_agreement_amendments (
                   legal_business_id,
                   agreement_id,
                   from_version_id,
                   to_version_id,
                   amendment_reason,
                   status,
                   requested_by
                 )
                 VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
                [
                  businessId,
                  BUSINESS_AGREEMENT_ID,
                  current.id,
                  version.insertId,
                  "Request to extend investor funding scope " +
                    "from Kapra Branch to all Abhiram " +
                    "Textiles branches while preserving " +
                    "existing approved economic terms.",
                  user.id,
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
                "AGREEMENT_SCOPE_AMENDMENT_REQUESTED",
                "AGREEMENT_AMENDMENT",
                amendment.insertId,
                JSON.stringify({
                  agreement_id: BUSINESS_AGREEMENT_ID,
                  from_version_id: current.id,
                  to_version_id: version.insertId,
                  from_scope: {
                    division_id: DIVISION_ID,
                    branch_id: OLD_BRANCH_ID,
                  },
                  proposed_scope: {
                    division_id: DIVISION_ID,
                    branch_id: null,
                  },
                  proposed_effective_from: effectiveFrom,
                  financial_terms_changed: false,
                }),
              ]
            );

            await conn.commit();
            outcome = "created";
          }
        }
      }
    }

    if (outcome !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Agreement amendment request failed:", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(RETURN_URL);
  }

  go(outcome);
}
