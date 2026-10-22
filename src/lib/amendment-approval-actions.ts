
"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { readPrivateDocument } from "@/lib/document-preview";
import {
  checkProposedShareCapacity,
} from "@/lib/effective-share-capacity";
import {
  isValidSqlDate,
  parseShareUnits,
} from "@/lib/effective-profit-participation";

type AmendmentRow = RowDataPacket & {
  amendment_id: number;
  agreement_id: number;
  from_version_id: number;
  to_version_id: number;
  previous_status: string;
  proposed_status: string;
  effective_from: string;
  effective_to: string | null;
  previous_from: string;
  previous_to: string | null;
  previous_terms: string | Record<string, unknown>;
  proposed_terms: string | Record<string, unknown>;
  division_id: number | null;
  branch_id: number | null;
};

type EvidenceRow = RowDataPacket & {
  signed_document_id: number;
  reviewed_document_sha256: string;
  document_sha256: string;
  storage_key: string;
  document_verified: number;
  investor_consent_verified: number;
};

function read(form: FormData, key: string): string {
  const item = form.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function validId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function parseTerms(
  input: string | Record<string, unknown>
): Record<string, unknown> {
  const parsed = typeof input === "string"
    ? JSON.parse(input)
    : input;

  if (!parsed || typeof parsed !== "object" ||
      Array.isArray(parsed)) {
    throw new Error("Invalid agreement terms");
  }

  return parsed as Record<string, unknown>;
}

function indiaDate(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(new Date());

  const get = (key: string) =>
    parts.find((p) => p.type === key)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dateTomorrow(): string {
  const current = indiaDate();
  const date = new Date(`${current}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function auditDetails(value: object): string {
  return JSON.stringify(value);
}

async function changeAmendmentStatus(
  form: FormData,
  decision: "APPROVED" | "REJECTED"
) {
  const user = await requireGroupOwner();

  const agreementText = read(form, "agreement_id");
  const amendmentText = read(form, "amendment_id");
  const notes = read(form, "review_notes");

  if (!validId(agreementText) || !validId(amendmentText)) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(agreementText);
  const amendmentId = Number(amendmentText);
  const businessId = user.legal_business_id;

  const back = `/funding/agreements/${agreementId}`;

  if (notes.length < 10 || notes.length > 2000) {
    redirect(`${back}?approval=invalid-notes`);
  }

  const connection = await db.getConnection();
  let outcome = "failed";

  try {
    await connection.beginTransaction();

    // All funding activations and amendments should
    // take the same business-level mutex first.
    const [businessRows] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id FROM acct_legal_businesses
         WHERE id = ? FOR UPDATE`,
        [businessId]
      );

    const [agreementRows] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id, status, funding_type
         FROM acct_funding_agreements
         WHERE id = ?
           AND legal_business_id = ?
         FOR UPDATE`,
        [agreementId, businessId]
      );

    if (
      businessRows.length !== 1 ||
      agreementRows.length !== 1 ||
      agreementRows[0].status !== "ACTIVE" ||
      agreementRows[0].funding_type !== "PROFIT_LINKED"
    ) {
      outcome = "not-eligible";
    } else {
      const [rows] =
        await connection.execute<AmendmentRow[]>(
          `SELECT
             am.id AS amendment_id,
             am.agreement_id,
             am.from_version_id,
             am.to_version_id,

             oldv.version_status AS previous_status,
             newv.version_status AS proposed_status,

             DATE_FORMAT(
               newv.effective_from, '%Y-%m-%d'
             ) AS effective_from,

             DATE_FORMAT(
               newv.effective_to, '%Y-%m-%d'
             ) AS effective_to,

             DATE_FORMAT(
               oldv.effective_from, '%Y-%m-%d'
             ) AS previous_from,

             DATE_FORMAT(
               oldv.effective_to, '%Y-%m-%d'
             ) AS previous_to,

             oldv.terms_json AS previous_terms,
             newv.terms_json AS proposed_terms,

             a.division_id,
             a.branch_id

           FROM acct_agreement_amendments am

           JOIN acct_funding_agreements a
             ON a.id = am.agreement_id
            AND a.legal_business_id = am.legal_business_id

           JOIN acct_agreement_versions oldv
             ON oldv.id = am.from_version_id
            AND oldv.agreement_id = am.agreement_id
            AND oldv.legal_business_id = am.legal_business_id

           JOIN acct_agreement_versions newv
             ON newv.id = am.to_version_id
            AND newv.agreement_id = am.agreement_id
            AND newv.legal_business_id = am.legal_business_id

           WHERE am.id = ?
             AND am.agreement_id = ?
             AND am.legal_business_id = ?
             AND am.status = 'PENDING'

           FOR UPDATE`,
          [amendmentId, agreementId, businessId]
        );

      const amendment = rows[0];

      if (
        !amendment ||
        amendment.previous_status !== "APPROVED" ||
        amendment.proposed_status !== "DRAFT"
      ) {
        outcome = "stale";
      } else if (decision === "REJECTED") {
        await connection.execute(
          `UPDATE acct_agreement_versions
           SET version_status = 'REJECTED'
           WHERE id = ?
             AND agreement_id = ?
             AND legal_business_id = ?
             AND version_status = 'DRAFT'`,
          [
            amendment.to_version_id,
            agreementId,
            businessId,
          ]
        );

        await connection.execute(
          `UPDATE acct_agreement_amendments
           SET status = 'REJECTED',
               reviewed_by = ?,
               reviewed_at = CURRENT_TIMESTAMP,
               review_notes = ?
           WHERE id = ?
             AND agreement_id = ?
             AND legal_business_id = ?
             AND status = 'PENDING'`,
          [
            user.id,
            notes,
            amendmentId,
            agreementId,
            businessId,
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
            businessId,
            user.id,
            "PROFIT_SHARE_AMENDMENT_REJECTED",
            "FUNDING_AGREEMENT",
            agreementId,
            auditDetails({
              amendment_id: amendmentId,
              rejected_version_id: amendment.to_version_id,
              reason: notes,
            }),
          ]
        );

        await connection.commit();
        outcome = "rejected";
      } else {
        const effectiveFrom = amendment.effective_from;
        const effectiveTo = amendment.effective_to;

        const previousTerms = parseTerms(
          amendment.previous_terms
        );

        const proposedTerms = parseTerms(
          amendment.proposed_terms
        );

        const oldUnits = parseShareUnits(
          previousTerms.profit_share_percentage
        );

        const newUnits = parseShareUnits(
          proposedTerms.profit_share_percentage
        );

        // This first approval workflow supports only
        // forward-effective amendments.
        // It deliberately disallows today's effective
        // date to avoid intraday retrospective effects.
        if (
          !isValidSqlDate(effectiveFrom) ||
          effectiveFrom < dateTomorrow() ||
          effectiveFrom <= amendment.previous_from ||
          (
            amendment.previous_to !== null &&
            (
              effectiveTo !== amendment.previous_to ||
              effectiveFrom > amendment.previous_to
            )
          ) ||
          oldUnits === newUnits ||
          newUnits === 0
        ) {
          outcome = "invalid-effective-date";
        } else {
          // Only percentage may change in this step.
          // Other financial/contractual terms remain
          // part of the original approved contract.
          const strippedOld = { ...previousTerms };
          const strippedNew = { ...proposedTerms };

          delete strippedOld.profit_share_percentage;
          delete strippedNew.profit_share_percentage;
          delete strippedOld.effective_from;
          delete strippedNew.effective_from;
          delete strippedOld.effective_to;
          delete strippedNew.effective_to;

          const sameOtherTerms =
            JSON.stringify(
              Object.entries(strippedOld).sort()
            ) ===
            JSON.stringify(
              Object.entries(strippedNew).sort()
            );

          if (!sameOtherTerms) {
            outcome = "terms-changed";
          } else {
            const [evidenceRows] =
              await connection.execute<EvidenceRow[]>(
                `SELECT
                   r.signed_document_id,
                   r.reviewed_document_sha256,
                   r.document_verified,
                   r.investor_consent_verified,
                   d.document_sha256,
                   d.storage_key

                 FROM acct_amendment_evidence_reviews r

                 JOIN acct_business_documents d
                   ON d.id = r.signed_document_id
                  AND d.legal_business_id =
                      r.legal_business_id
                  AND d.funding_agreement_id =
                      r.agreement_id
                  AND d.agreement_version_id =
                      r.proposed_version_id

                 WHERE r.legal_business_id = ?
                   AND r.agreement_id = ?
                   AND r.amendment_id = ?
                   AND r.proposed_version_id = ?
                   AND r.document_verified = 1
                   AND r.investor_consent_verified = 1
                   AND d.status = 'ACTIVE'
                   AND d.agreement_document_role = 'SIGNED'
                   AND d.mime_type = 'application/pdf'
                 LIMIT 1`,
                [
                  businessId,
                  agreementId,
                  amendmentId,
                  amendment.to_version_id,
                ]
              );

            const evidence = evidenceRows[0];

            if (!evidence) {
              outcome = "evidence-missing";
            } else {
              const file = await readPrivateDocument(
                evidence.storage_key
              );

              const actualHash = createHash("sha256")
                .update(file)
                .digest("hex")
                .toLowerCase();

              if (
                file.subarray(0, 5).toString() !== "%PDF-" ||
                actualHash !==
                  evidence.document_sha256.toLowerCase() ||
                actualHash !==
                  evidence.reviewed_document_sha256.toLowerCase()
              ) {
                outcome = "evidence-mismatch";
              } else {
                const capacity =
                  await checkProposedShareCapacity(
                    connection,
                    {
                      businessId,
                      agreementId,
                      pool: {
                        divisionId:
                          amendment.division_id == null
                            ? null
                            : Number(amendment.division_id),
                        branchId:
                          amendment.branch_id == null
                            ? null
                            : Number(amendment.branch_id),
                      },
                      effectiveFrom,
                      effectiveTo,
                      proposedPercentage: String(
                        proposedTerms.profit_share_percentage
                      ),
                    }
                  );

                if (!capacity.valid) {
                  outcome = "overallocated";
                } else {
                  await connection.execute(
                    `UPDATE acct_agreement_versions
                     SET version_status = 'SUPERSEDED'
                     WHERE id = ?
                       AND agreement_id = ?
                       AND legal_business_id = ?
                       AND version_status = 'APPROVED'`,
                    [
                      amendment.from_version_id,
                      agreementId,
                      businessId,
                    ]
                  );

                  await connection.execute(
                    `UPDATE acct_agreement_versions
                     SET version_status = 'APPROVED',
                         approved_by = ?,
                         approved_at = CURRENT_TIMESTAMP
                     WHERE id = ?
                       AND agreement_id = ?
                       AND legal_business_id = ?
                       AND version_status = 'DRAFT'`,
                    [
                      user.id,
                      amendment.to_version_id,
                      agreementId,
                      businessId,
                    ]
                  );

                  await connection.execute(
                    `UPDATE acct_agreement_amendments
                     SET status = 'APPROVED',
                         reviewed_by = ?,
                         reviewed_at = CURRENT_TIMESTAMP,
                         review_notes = ?
                     WHERE id = ?
                       AND agreement_id = ?
                       AND legal_business_id = ?
                       AND status = 'PENDING'`,
                    [
                      user.id,
                      notes,
                      amendmentId,
                      agreementId,
                      businessId,
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
                      businessId,
                      user.id,
                      "PROFIT_SHARE_AMENDMENT_APPROVED",
                      "FUNDING_AGREEMENT",
                      agreementId,
                      auditDetails({
                        amendment_id: amendmentId,
                        from_version_id:
                          amendment.from_version_id,
                        to_version_id:
                          amendment.to_version_id,
                        effective_from: effectiveFrom,
                        previous_share_units: oldUnits,
                        approved_share_units: newUnits,
                        signed_document_id:
                          evidence.signed_document_id,
                        verified_sha256: actualHash,
                        capacity_checked_dates:
                          capacity.checkedDates,
                      }),
                    ]
                  );

                  await connection.commit();
                  outcome = "approved";
                }
              }
            }
          }
        }
      }
    }

    if (!["approved", "rejected"].includes(outcome)) {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Amendment decision failed:", error);
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "approved" || outcome === "rejected") {
    revalidatePath(back);
    revalidatePath("/funding/agreements");
    revalidatePath("/funding/participation");
  }

  redirect(`${back}?approval=${outcome}`);
}

export async function approveAmendmentAction(form: FormData) {
  return changeAmendmentStatus(form, "APPROVED");
}

export async function rejectAmendmentAction(form: FormData) {
  return changeAmendmentStatus(form, "REJECTED");
}
