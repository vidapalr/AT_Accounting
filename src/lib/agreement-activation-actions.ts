
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  validateProfitShareCapacity,
} from "@/lib/profit-share-validator";

interface AgreementRow extends RowDataPacket {
  id: number;
  agreement_no: string;
  status: string;
  funding_type: "LOAN" | "PROFIT_LINKED";
  division_id: number | null;
  branch_id: number | null;
}

interface VersionRow extends RowDataPacket {
  id: number;
  version_no: number;
  version_status: string;
  terms_json: string | Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
}

function read(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseTerms(
  raw: string | Record<string, unknown>
): Record<string, unknown> {
  return typeof raw === "string"
    ? JSON.parse(raw)
    : raw;
}

export async function activateFundingAgreementAction(
  form: FormData
) {
  const user = await requireGroupOwner();

  const idText = read(form, "agreement_id");
  const agreementId = Number(idText);

  if (
    !/^[1-9]\d*$/.test(idText) ||
    !Number.isSafeInteger(agreementId)
  ) {
    redirect("/funding/agreements");
  }

  const back = `/funding/agreements/${agreementId}`;

  const evidence = read(form, "evidence_reference");
  const confirmed = form.get("confirmed") === "yes";

  if (
    evidence.length < 5 ||
    evidence.length > 250 ||
    !confirmed
  ) {
    redirect(`${back}?activation=invalid`);
  }

  let result = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // IMPORTANT:
    // Always lock the legal business first.
    // This serializes initial agreement activations
    // across all profit pools in this business.
    const [business] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [user.legal_business_id]
      );

    if (business.length !== 1) {
      result = "not-found";
    } else {
      const [agreements] =
        await connection.execute<AgreementRow[]>(
          `SELECT
             id,
             agreement_no,
             status,
             funding_type,
             division_id,
             branch_id
           FROM acct_funding_agreements
           WHERE id = ?
             AND legal_business_id = ?
           FOR UPDATE`,
          [agreementId, user.legal_business_id]
        );

      const agreement = agreements[0];

      if (!agreement) {
        result = "not-found";
      } else if (agreement.status !== "DRAFT") {
        result = "not-draft";
      } else {
        const [versions] =
          await connection.execute<VersionRow[]>(
            `SELECT
               id,
               version_no,
               version_status,
               terms_json,
               DATE_FORMAT(
                 effective_from,
                 '%Y-%m-%d'
               ) AS effective_from,
               DATE_FORMAT(
                 effective_to,
                 '%Y-%m-%d'
               ) AS effective_to
             FROM acct_agreement_versions
             WHERE agreement_id = ?
               AND legal_business_id = ?
               AND version_no = 1
             FOR UPDATE`,
            [agreementId, user.legal_business_id]
          );

        const initial = versions[0];

        if (
          !initial ||
          initial.version_status !== "DRAFT"
        ) {
          result = "invalid-version";
        } else {
          const [approved] =
            await connection.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_agreement_versions
               WHERE agreement_id = ?
                 AND legal_business_id = ?
                 AND version_no <> 1
                 AND version_status IN (
                   'APPROVED', 'SUPERSEDED'
                 )
               LIMIT 1`,
              [agreementId, user.legal_business_id]
            );

          if (approved.length) {
            result = "invalid-history";
          } else {
            const [policies] =
              await connection.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_agreement_funding_policies
                 WHERE agreement_version_id = ?
                   AND agreement_id = ?
                   AND legal_business_id = ?
                   AND policy_status = 'CONFIRMED'
                 LIMIT 1`,
                [
                  initial.id,
                  agreementId,
                  user.legal_business_id,
                ]
              );

            if (!policies.length) {
              result = "policy-not-confirmed";
            } else {
              const terms = parseTerms(
                initial.terms_json
              );

              // The original version must describe
              // the same contractual scope as the
              // parent agreement.
              const versionDivision =
                terms.division_id ?? null;

              const versionBranch =
                terms.branch_id ?? null;

              if (
                versionDivision !== agreement.division_id ||
                versionBranch !== agreement.branch_id
              ) {
                result = "scope-mismatch";
              } else {
                let permitted = true;

                if (
                  agreement.funding_type ===
                  "PROFIT_LINKED"
                ) {
                  const percentage =
                    terms.profit_share_percentage;

                  if (
                    percentage === null ||
                    percentage === undefined
                  ) {
                    result = "invalid-share";
                    permitted = false;
                  } else {
                    const validation =
                      await validateProfitShareCapacity(
                        connection,
                        {
                          businessId:
                            user.legal_business_id,
                          excludeAgreementId:
                            agreementId,
                          pool: {
                            divisionId:
                              agreement.division_id,
                            branchId:
                              agreement.branch_id,
                          },
                          percentage:
                            String(percentage),
                          effectiveFrom:
                            initial.effective_from,
                          effectiveTo:
                            initial.effective_to,
                        }
                      );

                    if (!validation.valid) {
                      result = "share-exceeded";
                      permitted = false;
                    }
                  }
                }

                if (permitted) {
                  await connection.execute(
                    `UPDATE acct_agreement_versions
                     SET version_status = 'APPROVED',
                         approved_by = ?,
                         approved_at = UTC_TIMESTAMP()
                     WHERE id = ?
                       AND agreement_id = ?
                       AND legal_business_id = ?
                       AND version_status = 'DRAFT'`,
                    [
                      user.id,
                      initial.id,
                      agreementId,
                      user.legal_business_id,
                    ]
                  );

                  await connection.execute(
                    `UPDATE acct_funding_agreements
                     SET status = 'ACTIVE'
                     WHERE id = ?
                       AND legal_business_id = ?
                       AND status = 'DRAFT'`,
                    [
                      agreementId,
                      user.legal_business_id,
                    ]
                  );

                  await connection.execute(
                    `INSERT INTO acct_audit_events
                     (
                       legal_business_id,
                       actor_user_id,
                       action,
                       subject_type,
                       subject_id,
                       details_json
                     )
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                      user.legal_business_id,
                      user.id,
                      "FUNDING_AGREEMENT_ACTIVATED",
                      "FUNDING_AGREEMENT",
                      agreementId,
                      JSON.stringify({
                        approved_version: 1,
                        version_id: initial.id,
                        evidence_reference: evidence,
                        profit_ceiling_checked: true,
                      }),
                    ]
                  );

                  await connection.commit();
                  result = "activated";
                }
              }
            }
          }
        }
      }
    }

    if (result !== "activated") {
      await connection.rollback();
    }
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Preserve the original error.
    }

    console.error(
      "Agreement activation failed:",
      error
    );

    result = "failed";
  } finally {
    connection.release();
  }

  if (result === "activated") {
    revalidatePath(back);
    revalidatePath("/funding/agreements");
    revalidatePath("/funding/participation");
  }

  redirect(`${back}?activation=${result}`);
}
