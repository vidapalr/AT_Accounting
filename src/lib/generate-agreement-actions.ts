
"use server";

import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import {
  generateFullAgreementDocx,
} from "@/lib/full-agreement-generator";

import {
  convertAgreementToPdf,
} from "@/lib/agreement-pdf-converter";

interface SourceRow extends RowDataPacket {
  agreement_no: string;
  funding_type: "LOAN" | "PROFIT_LINKED";
  investor_name: string;
  scope_name: string;
  division_id: number | null;
  version_no: number;
  terms_json: string | Record<string, unknown>;
}

interface PolicyRow extends RowDataPacket {
  funding_model: string;
  maximum_outstanding: string | null;
  minimum_funding: string | null;
  additional_funding_allowed: number;
  flexible_repayment_allowed: number;
  profit_entitlement_model: string;
  entitlement_on_zero_balance: number | null;
  loss_sharing_model: string;
  loss_share_percentage: string | null;
  maximum_loss_exposure: string | null;
  loss_settlement_method: string;
  profit_calculation_order: string;
  policy_notes: string | null;
  policy_status: string;
}

export async function generateAgreementAction(form: FormData) {
  const user = await requireGroupOwner();

  const idText = String(form.get("agreement_id") ?? "");
  const versionText = String(
    form.get("agreement_version_id") ?? ""
  );

  if (
    !/^[1-9]\d*$/.test(idText) ||
    !/^[1-9]\d*$/.test(versionText) ||
    !Number.isSafeInteger(Number(idText)) ||
    !Number.isSafeInteger(Number(versionText))
  ) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(idText);
  const versionId = Number(versionText);
  const businessId = user.legal_business_id;
  const back = `/funding/agreements/${agreementId}`;

  const connection = await db.getConnection();

  const directory = path.join(
    process.cwd(),
    "private_uploads",
    "agreement_documents"
  );

  const filename = `generated-${randomUUID()}.docx`;
  const storageKey = `agreement_documents/${filename}`;
  const fullPath = path.join(directory, filename);
  const pdfFilename =
    filename.replace(/\.docx$/, ".pdf");
  const pdfStorageKey =
    `agreement_documents/${pdfFilename}`;
  const pdfFullPath = path.join(
    directory,
    pdfFilename
  );

  let outcome = "failed";
  let savedFile = false;
  let savedPdf = false;

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute<SourceRow[]>(
      `SELECT
         a.agreement_no,
         a.funding_type,
         a.division_id,
         p.full_name AS investor_name,
         CASE
           WHEN b.id IS NOT NULL THEN
             CONCAT(d.name, ' / ', b.branch_name)
           WHEN d.id IS NOT NULL THEN d.name
           ELSE 'Abhiram Group'
         END AS scope_name,
         v.version_no,
         v.terms_json
       FROM acct_funding_agreements a
       JOIN acct_funding_parties p
         ON p.id = a.party_id
        AND p.legal_business_id = a.legal_business_id
       JOIN acct_agreement_versions v
         ON v.agreement_id = a.id
        AND v.legal_business_id = a.legal_business_id
       LEFT JOIN acct_divisions d
         ON d.id = a.division_id
        AND d.legal_business_id = a.legal_business_id
       LEFT JOIN acct_branches b
         ON b.id = a.branch_id
        AND b.division_id = a.division_id
        AND b.legal_business_id = a.legal_business_id
       WHERE a.id = ?
         AND a.legal_business_id = ?
         AND v.id = ?
       FOR UPDATE`,
      [agreementId, businessId, versionId]
    );

    const source = rows[0];

    if (!source) {
      outcome = "not-found";
    } else {
      const [policies] = await connection.execute<PolicyRow[]>(
        `SELECT
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
           policy_status
         FROM acct_agreement_funding_policies
         WHERE legal_business_id = ?
           AND agreement_id = ?
           AND agreement_version_id = ?
         LIMIT 1`,
        [businessId, agreementId, versionId]
      );

      const terms =
        typeof source.terms_json === "string"
          ? JSON.parse(source.terms_json)
          : source.terms_json;

      // Do not describe an unconfirmed policy
      // as an agreed contractual condition.
      const policy =
        policies[0]?.policy_status === "CONFIRMED"
          ? policies[0]
          : null;

      const document = await generateFullAgreementDocx({
        agreementNo: source.agreement_no,
        investorName: source.investor_name,
        fundingScope: source.scope_name,
        fundingType: source.funding_type,
        terms,
        policy,
      });

      const pdfDocument = await convertAgreementToPdf(
        document
      );


      const sha256 = createHash("sha256")
        .update(document)
        .digest("hex");

      await mkdir(directory, { recursive: true });

      await writeFile(fullPath, document, {
        flag: "wx",
        mode: 0o600,
      });

      savedFile = true;

      await writeFile(pdfFullPath, pdfDocument, {
        flag: "wx",
        mode: 0o600,
      });

      savedPdf = true;

      const pdfSha256 = createHash("sha256")
        .update(pdfDocument)
        .digest("hex");

      const [inserted] =
        await connection.execute<ResultSetHeader>(
          `INSERT INTO acct_business_documents
           (
             legal_business_id,
             division_id,
             document_type,
             document_name,
             storage_key,
             mime_type,
             file_size,
             uploaded_by,
             funding_agreement_id,
             agreement_version_id,
             agreement_document_role,
             document_sha256,
             status
           )
           VALUES (
             ?, ?, 'AGREEMENT', ?, ?, ?, ?, ?,
             ?, ?, 'DRAFT', ?, 'ACTIVE'
           )`,
          [
            businessId,
            source.division_id,
            `Generated_${source.agreement_no}_V${source.version_no}.docx`,
            storageKey,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            document.length,
            user.id,
            agreementId,
            versionId,
            sha256,
          ]
        );

      const [pdfInserted] =
        await connection.execute<ResultSetHeader>(
          `INSERT INTO acct_business_documents
           (
             legal_business_id,
             division_id,
             document_type,
             document_name,
             storage_key,
             mime_type,
             file_size,
             uploaded_by,
             funding_agreement_id,
             agreement_version_id,
             agreement_document_role,
             document_sha256,
             status
           )
           VALUES (
             ?, ?, 'AGREEMENT', ?, ?, 'application/pdf',
             ?, ?, ?, ?, 'DRAFT', ?, 'ACTIVE'
           )`,
          [
            businessId,
            source.division_id,
            `Generated_${source.agreement_no}_V${source.version_no}.pdf`,
            pdfStorageKey,
            pdfDocument.length,
            user.id,
            agreementId,
            versionId,
            pdfSha256,
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
          "AGREEMENT_DOCUMENT_GENERATED",
          "FUNDING_AGREEMENT",
          agreementId,
          JSON.stringify({
            word_document_id: inserted.insertId,
            pdf_document_id: pdfInserted.insertId,
            agreement_version_id: versionId,
            word_sha256: sha256,
            pdf_sha256: pdfSha256,
            document_role: "DRAFT",
          }),
        ]
      );

      await connection.commit();
      outcome = "generated";
    }

    if (outcome !== "generated") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error("Agreement generation failed:", error);
  } finally {
    connection.release();
  }

  if (outcome !== "generated" && savedFile) {
    await unlink(fullPath).catch(() => {});
  }

  if (outcome !== "generated" && savedPdf) {
    await unlink(pdfFullPath).catch(() => {});
  }

  if (outcome === "generated") {
    revalidatePath(back);
  }

  redirect(`${back}?document=${outcome}`);
}
