
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

export async function verifyAmendmentEvidenceAction(
  form: FormData
) {
  const user = await requireGroupOwner();

  const agreementText = field(form, "agreement_id");
  const amendmentText = field(form, "amendment_id");
  const documentText = field(form, "signed_document_id");

  if (
    !validId(agreementText) ||
    !validId(amendmentText) ||
    !validId(documentText)
  ) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(agreementText);
  const amendmentId = Number(amendmentText);
  const documentId = Number(documentText);
  const businessId = user.legal_business_id;
  const back = `/funding/agreements/${agreementId}`;

  const documentVerified =
    field(form, "document_verified") === "yes";

  const investorConsent =
    field(form, "investor_consent_verified") === "yes";

  const notes = field(form, "review_notes");

  if (
    !documentVerified ||
    !investorConsent ||
    notes.length < 10 ||
    notes.length > 2000
  ) {
    redirect(`${back}?evidence=invalid`);
  }

  const connection = await db.getConnection();
  let outcome = "failed";

  try {
    await connection.beginTransaction();

    // Consistent lock order: business -> agreement.
    const [business] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    const [agreements] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id, status
         FROM acct_funding_agreements
         WHERE id = ?
           AND legal_business_id = ?
         FOR UPDATE`,
        [agreementId, businessId]
      );

    if (
      business.length !== 1 ||
      agreements.length !== 1 ||
      agreements[0].status !== "ACTIVE"
    ) {
      outcome = "not-eligible";
    } else {
      const [amendments] =
        await connection.execute<RowDataPacket[]>(
          `SELECT
             am.id,
             am.to_version_id
           FROM acct_agreement_amendments am
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
             AND oldv.version_status = 'APPROVED'
             AND newv.version_status = 'DRAFT'
           LIMIT 1`,
          [amendmentId, agreementId, businessId]
        );

      const amendment = amendments[0];

      if (!amendment) {
        outcome = "not-eligible";
      } else {
        const [documents] =
          await connection.execute<RowDataPacket[]>(
            `SELECT
               id,
               document_sha256
             FROM acct_business_documents
             WHERE id = ?
               AND legal_business_id = ?
               AND funding_agreement_id = ?
               AND agreement_version_id = ?
               AND agreement_document_role = 'SIGNED'
               AND status = 'ACTIVE'
               AND mime_type = 'application/pdf'
               AND document_sha256 REGEXP '^[0-9a-fA-F]{64}$'
             LIMIT 1`,
            [
              documentId,
              businessId,
              agreementId,
              amendment.to_version_id,
            ]
          );

        const document = documents[0];

        if (!document) {
          outcome = "document-invalid";
        } else {
          await connection.execute(
            `INSERT INTO acct_amendment_evidence_reviews
             (
               legal_business_id,
               agreement_id,
               amendment_id,
               proposed_version_id,
               signed_document_id,
               reviewed_document_sha256,
               investor_consent_verified,
               document_verified,
               review_notes,
               reviewed_by
             )
             VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
             ON DUPLICATE KEY UPDATE
               signed_document_id =
                 VALUES(signed_document_id),
               reviewed_document_sha256 =
                 VALUES(reviewed_document_sha256),
               investor_consent_verified = 1,
               document_verified = 1,
               review_notes = VALUES(review_notes),
               reviewed_by = VALUES(reviewed_by),
               reviewed_at = CURRENT_TIMESTAMP`,
            [
              businessId,
              agreementId,
              amendmentId,
              amendment.to_version_id,
              documentId,
              document.document_sha256,
              notes,
              user.id,
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
              "AMENDMENT_SIGNED_EVIDENCE_VERIFIED",
              "FUNDING_AGREEMENT",
              agreementId,
              JSON.stringify({
                amendment_id: amendmentId,
                version_id: amendment.to_version_id,
                document_id: documentId,
                sha256: document.document_sha256,
                consent_verified: true,
                notes,
              }),
            ]
          );

          await connection.commit();
          outcome = "verified";
        }
      }
    }

    if (outcome !== "verified") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(
      "Amendment evidence review failed:",
      error
    );
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "verified") {
    revalidatePath(back);
  }

  redirect(`${back}?evidence=${outcome}`);
}
