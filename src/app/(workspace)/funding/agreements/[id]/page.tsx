
import Link from "next/link";
import { BASIS_OPTIONS } from "@/lib/investor-shares/engine";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireGroupOwner } from "@/lib/auth";
import { getAgreementHistory } from "@/lib/agreement-history";
import { proposeAgreementAmendment } from
  "@/lib/agreement-amendment-actions";
import styles from "./details.module.css";
import { activateFundingAgreementAction } from
  "@/lib/agreement-activation-actions";

import {
  getAgreementDocuments,
} from "@/lib/agreement-documents";

import {
  approveAmendmentAction,
  rejectAmendmentAction,
} from "@/lib/amendment-approval-actions";

import {
  uploadAgreementDocumentAction,
} from "@/lib/agreement-document-actions";  
import {
  generateAgreementAction,
} from "@/lib/generate-agreement-actions";

import FundingPolicyForm from "./FundingPolicyForm";

import {
  proposeProfitShareAmendmentAction,
} from "@/lib/profit-share-amendment-actions";

import { getPendingAmendment } from "@/lib/amendment-evidence";
import {
  verifyAmendmentEvidenceAction,
} from "@/lib/amendment-review-actions";

import { getFundingPolicies } from
  "@/lib/funding-policies";
import BankAccountSections from
  "../../../accounting/bank-accounts/BankAccountSections";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    result?: string;
    activation?: string;
    policy?: string;
    document?: string;
    shareAmendment?: string;
    evidence?: string;
    bankEvidence?: string;
    mapping?: string;
    verification?: string;
    approval?: string;
  }>;
};

const messages: Record<string, string> = {
  created: "Amendment proposal saved successfully.",
  invalid: "Please check the revised terms and reason.",
  pending: "An amendment is already awaiting review.",
  "not-found": "Agreement not found.",
  "not-draft": "Only Draft agreements are editable in this step.",
  "no-version": "Initial agreement version is missing.",
  "no-change": "No changes were detected.",
  failed: "Unable to save the amendment.",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return String(value);
}

const fields = [
  ["Committed Amount", "committed_amount"],
  ["Profit Share (%)", "profit_share_percentage"],
  ["Profit Basis", "profit_basis"],
  ["Interest Rate (%)", "interest_rate_percentage"],
  ["Interest Method", "interest_method"],
  ["Effective From", "effective_from"],
  ["Effective To", "effective_to"],
  ["Payout Frequency", "payout_frequency"],
  ["Principal Repayment Terms", "principal_repayment_terms"],
  ["Loss Sharing Terms", "loss_sharing_terms"],
  ["Agreement Notes", "agreement_notes"],
  ["Funding Scope", "funding_scope"],
  ["Division ID", "division_id"],
  ["Branch ID", "branch_id"],
] as const;

export default function AgreementDetailsPage({
  params,
  searchParams,
}: Props) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>Loading agreement details...</div>
      }
    >
      <AgreementDetailsContent
        params={params}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function AgreementDetailsContent({
  params,
  searchParams,
}: Props) {
  const user = await requireGroupOwner();
  const { id } = await params;
  const query = await searchParams;

  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    notFound();
  }

  const data = await getAgreementHistory(
    user.legal_business_id,
    Number(id)
  );

  const policies = await getFundingPolicies(
    user.legal_business_id,
    Number(id)
  );
  const latestPolicy = policies.find((policy) => policy.version_no === 1) ?? null;

  if (!data || !data.versions.length) notFound();

  const { agreement, versions } = data;
  const pendingReview = await getPendingAmendment(
    user.legal_business_id,
    agreement.id
  );
  const latest = versions[0];
  const original = versions[versions.length - 1];
  const pending = versions.some(
    (v) => v.amendment_status === "PENDING"
  );

  const documents = await getAgreementDocuments(
    user.legal_business_id,
    agreement.id
  );

  const editable =
    agreement.status === "DRAFT" && !pending;

  // Use initial terms until an amendment is approved.
  // Later, we'll select the most recent approved version.
  const current = [...versions].reverse().find(
    (v) => v.version_status === "APPROVED"
  ) ?? original;

  const terms = current.terms;
  const isLoan = terms.funding_type === "LOAN";

  return (
    <div className={styles.page}>
      <Link href="/funding/agreements" className={styles.back}>
        ← Funding Agreements
      </Link>

      <header className={styles.heading}>
        <div>
          <h1>{agreement.agreement_no}</h1>
          <p>
            {agreement.party_name} ·{" "}
            {agreement.division_name ?? "Abhiram Group"}
          </p>
        </div>
        <span className={styles.status}>{agreement.status}</span>
      </header>

      {query.result && messages[query.result] && (
        <p className={
          query.result === "created"
            ? styles.success
            : styles.error
        }>
          {messages[query.result]}
        </p>
      )}

      <section className={styles.card}>
        <h2>Original Agreement Terms — V{original.version_no}</h2>

        <div className={styles.details}>
          {fields.map(([label, key]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>{show(original.terms[key])}</strong>
            </div>
          ))}
        </div>
      </section>

      {query.activation === "activated" && (
        <p className={styles.success} role="status">
          Original agreement activated successfully.
          Version 1 is now approved.
        </p>
      )}

      {query.activation &&
        query.activation !== "activated" && (
          <p className={styles.error} role="alert">
            {({
              invalid:
                "Enter the supporting reference and confirm the agreement.",
              "not-found":
                "Funding agreement was not found.",
              "not-draft":
                "Only Draft agreements can be activated.",
              "invalid-version":
                "The original Version 1 is missing or locked.",
              "invalid-history":
                "The agreement has conflicting approved version history.",
              "policy-not-confirmed":
                "Confirm the Version 1 funding policy before activation.",
              "scope-mismatch":
                "Agreement scope differs from the original contract version. A scope correction is required.",
              "invalid-share":
                "The original profit-sharing percentage is missing.",
              "share-exceeded":
                "Activation rejected. Profit shares on the same profit basis would pass 100% for this place, or group-level investors would pass the limit that keeps the owner at 51%. See Accounting → Investor Profit Shares.",
              failed:
                "Agreement activation failed. Review the server logs.",
            } as Record<string, string>)[query.activation] ??
              "Agreement activation could not be completed."}
          </p>
        )}

      {agreement.status === "DRAFT" &&
        original.version_no === 1 &&
        original.version_status === "DRAFT" && (
          <section className={styles.card}>
            <h2>Review &amp; Activate Original Agreement</h2>

            <p className={styles.notice}>
              Activation approves Version 1 only.
              Any pending amendment remains pending.
              No funding receipt or accounting entry is created.
            </p>

            <form
              action={activateFundingAgreementAction}
              className={styles.form}
            >
              <input
                type="hidden"
                name="agreement_id"
                value={agreement.id}
              />

              <label className={styles.fullWidth}>
                Supporting Agreement / Approval Reference
                <input
                  name="evidence_reference"
                  placeholder="e.g. Signed agreement dated 18-10-2026"
                  minLength={5}
                  maxLength={250}
                  required
                />
              </label>

              <label className={styles.fullWidth}>
                <span className={styles.confirmRow}>
                  <input
                    type="checkbox"
                    name="confirmed"
                    value="yes"
                    required
                  />
                  <span>
                    I confirm that I have reviewed the original
                    terms and have authorization to activate
                    this agreement.
                  </span>
                </span>
              </label>

              <div className={styles.fullWidth}>
                <button type="submit">
                  Approve V1 &amp; Activate Agreement
                </button>
              </div>
            </form>
          </section>
        )}

      <section className={styles.card}>
        <h2>Funding &amp; Profit/Loss Policy</h2>

        {query.policy && (
          <p
            role="status"
            className={
              ["saved", "confirmed-success"].includes(query.policy)
                ? styles.success
                : styles.error
            }
          >
            {({
              saved: "Draft funding policy saved successfully.",
              "confirmed-success":
                "Funding policy confirmed and locked.",
              invalid: "Check the funding policy fields and limits.",
              "not-draft":
                "Only initial Draft agreements can be configured here.",
              "version-locked":
                "The agreement version is locked.",
              "pending-amendment":
                "Review the pending amendment before configuring the policy.",
              "terms-conflict":
                "Policy conflicts with the agreement's funding type or terms.",
              confirmed:
                "This policy is already confirmed.",
              missing:
                "Save a draft policy before confirming it.",
              "confirm-invalid":
                "Evidence reference and confirmation are required.",
              failed:
                "Unable to save the funding policy.",
            } as Record<string, string>)[query.policy] ??
              "Unable to process the funding policy."}
          </p>
        )}

        {latestPolicy && (
          <div className={styles.details}>
            <div>
              <span>Agreement Version</span>
              <strong>
                V{latestPolicy.version_no}
              </strong>
            </div>
            <div>
              <span>Policy Status</span>
              <strong>{latestPolicy.policy_status}</strong>
            </div>
            <div>
              <span>Funding Model</span>
              <strong>
                {latestPolicy.funding_model.replaceAll("_", " ")}
              </strong>
            </div>
            <div>
              <span>Profit Entitlement</span>
              <strong>
                {latestPolicy.profit_entitlement_model.replaceAll("_", " ")}
              </strong>
            </div>
          </div>
        )}

        <FundingPolicyForm
          agreementId={agreement.id}
          fundingType={terms.funding_type}
          existing={latestPolicy}
          canEdit={
            agreement.status === "DRAFT" &&
            original.version_no === 1 &&
            original.version_status === "DRAFT" &&
            !pending &&
            latestPolicy?.policy_status !== "CONFIRMED"
          }
        />
      </section>

      <section className={styles.card}>
        <h2>Revise Investor Profit Share</h2>

        <p className={styles.notice}>
          Propose a new profit-sharing percentage for
          an existing active agreement. The original
          percentage remains in force until the
          amendment is approved and effective.
        </p>

        {query.shareAmendment && (
          <p
            role="status"
            className={
              query.shareAmendment === "proposed"
                ? styles.success
                : styles.error
            }
          >
            {({
              proposed:
                "Amendment proposed successfully. The original agreement remains active.",
              invalid:
                "Check the revised percentage, effective date and reason.",
              "not-found":
                "The agreement could not be found.",
              "not-eligible":
                "Only Active profit-linked agreements are eligible.",
              pending:
                "An amendment is already pending. Review it first.",
              "history-review":
                "This agreement has later version history requiring review.",
              "invalid-change":
                "The revised percentage must differ and fall within the original contractual period.",
              failed:
                "Could not propose the amendment. Check server logs.",
            } as Record<string, string>)[query.shareAmendment] ??
              "Unable to process amendment."}
          </p>
        )}

        {agreement.status === "ACTIVE" &&
          terms.funding_type === "PROFIT_LINKED" &&
          original.version_status === "APPROVED" &&
          !pending && (
            <form
              action={proposeProfitShareAmendmentAction}
              className={styles.form}
            >
              <input
                type="hidden"
                name="agreement_id"
                value={agreement.id}
              />

              <label>
                Current Approved Profit Share
                <input
                  value={
                    `${original.terms.profit_share_percentage}%`
                  }
                  disabled
                  readOnly
                />
              </label>

              <label>
                Proposed Profit Share (%)
                <input
                  name="profit_share_percentage"
                  type="number"
                  min="0.0001"
                  max="100"
                  step="0.0001"
                  required
                />
              </label>

              <label>
                Effective From
                <input
                  name="effective_from"
                  type="date"
                  required
                />
              </label>

              <label className={styles.fullWidth}>
                Amendment Reason
                <textarea
                  name="amendment_reason"
                  rows={3}
                  minLength={10}
                  maxLength={1000}
                  required
                  placeholder={
                    "Example: Existing investor agrees to reduce " +
                    "participation to admit an additional investor."
                  }
                />
              </label>

              <label className={styles.fullWidth}>
                Supporting Reference (Optional at Proposal)
                <input
                  name="evidence_reference"
                  maxLength={250}
                  placeholder="Draft amendment / discussion reference"
                />
              </label>

              <div className={styles.fullWidth}>
                <button type="submit">
                  Propose Profit Share Amendment
                </button>
              </div>
            </form>
          )}

        {pending && (
          <p className={styles.notice}>
            An amendment is currently pending.
            Upload the proposed amendment document
            against its version. Approval will be
            handled in the next step.
          </p>
        )}
      </section>

      <section className={styles.card}>
        <h2>Agreement Documents</h2>

        <p className={styles.notice}>
          Store funding agreements, signed copies,
          supporting documents and amendments.
          Every document is linked to a specific agreement
          version and preserved in the document register.
        </p>

        {query.document && (
          <p
            role="status"
            className={
              ["uploaded", "generated"].includes(query.document)
                ? styles.success
                : styles.error
            }
          >
            {({
              generated: "Agreement draft generated successfully.",
              uploaded: "Document uploaded successfully.",
              invalid: "Select a valid document role.",
              "missing-file": "Please choose a document.",
              "invalid-file":
                "Unsupported or invalid file. Maximum size is 10 MB.",
              "invalid-version":
                "The selected agreement version is invalid.",
              "not-found":
                "Funding agreement was not found.",
              failed:
                "Document upload failed. Check server logs.",
            } as Record<string, string>)[query.document] ??
              "Unable to process document."}
          </p>
        )}

        <div className={styles.policyConfirm}>
          <h3>Generate Agreement Document</h3>

          <p>
            Generate an unsigned Word draft using the
            selected agreement version, investor details,
            funding terms and confirmed policy.
          </p>

          <form
            action={generateAgreementAction}
            className={styles.form}
          >
            <input
              type="hidden"
              name="agreement_id"
              value={agreement.id}
            />

            <label>
              Agreement Version
              <select
                name="agreement_version_id"
                required
              >
                {versions.map((version) => (
                  <option
                    key={version.id}
                    value={version.id}
                  >
                    Version {version.version_no}
                    {" — "}
                    {version.version_status}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.fullWidth}>
              <button type="submit">
                Generate Agreement Draft
              </button>
            </div>
          </form>
        </div>

        <h3>Upload Agreement Document</h3>

        <form
          action={uploadAgreementDocumentAction}
          className={styles.form}
        >
          <input
            type="hidden"
            name="agreement_id"
            value={agreement.id}
          />

          <label>
            Agreement Version
            <select
              name="agreement_version_id"
              required
            >
              {versions.map((version) => (
                <option
                  key={version.id}
                  value={version.id}
                >
                  Version {version.version_no}
                  {" — "}
                  {version.version_status}
                </option>
              ))}
            </select>
          </label>

          <label>
            Document Role
            <select
              name="agreement_document_role"
              defaultValue="SIGNED"
              required
            >
              <option value="DRAFT">
                Agreement Draft
              </option>
              <option value="SIGNED">
                Signed Agreement
              </option>
              <option value="SUPPORTING">
                Supporting Document
              </option>
              <option value="AMENDMENT">
                Amendment Document
              </option>
            </select>
          </label>

          <label className={styles.fullWidth}>
            Select Document
            <input
              type="file"
              name="document"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
              required
            />
          </label>

          <div className={styles.fullWidth}>
            <button type="submit">
              Upload Document
            </button>
          </div>
        </form>

        <h3>Registered Documents</h3>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Version</th>
                <th>Role</th>
                <th>Format</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <strong>
                      {document.document_name}
                    </strong>
                    <small>
                      {(Number(document.file_size) /
                        1024).toFixed(1)} KB
                    </small>
                  </td>

                  <td>V{document.version_no}</td>

                  <td>
                    {document.agreement_document_role}
                  </td>

                  <td>
                    {document.mime_type === "application/pdf"
                      ? "PDF"
                      : document.mime_type ===
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        ? "Word"
                        : document.mime_type.startsWith("image/")
                          ? "Image"
                          : "Other"}
                  </td>

                  <td>{document.status}</td>

                  <td>{document.created_at}</td>

                  <td>
                    {document.status === "ACTIVE" ? (
                      <div>
                        <a
                          href={
                            `/api/documents/${document.id}/preview`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {document.mime_type === "application/pdf"
                            ? "View PDF"
                            : document.mime_type.includes("wordprocessingml")
                              ? "View Word"
                              : "View"}
                        </a>

                        <a
                          href={
                            `/api/documents/${document.id}/download`
                          }
                        >
                          Download
                        </a>
                      </div>
                    ) : (
                      <span>Archived</span>
                    )}
                  </td>
                </tr>
              ))}

              {documents.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    No documents uploaded for this agreement.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {pendingReview && (
        <section className={styles.card}>
          <h2>Signed Amendment Review</h2>

          <p className={styles.notice}>
            Review the proposed profit-share revision and
            verify the signed supporting agreement before
            final financial approval.
          </p>

          <table className={styles.table}>
            <tbody>
              <tr>
                <th>Original version</th>
                <td>V{pendingReview.previous_version_no}</td>
              </tr>
              <tr>
                <th>Proposed version</th>
                <td>V{pendingReview.proposed_version_no}</td>
              </tr>
              <tr>
                <th>Existing share</th>
                <td>{pendingReview.previous_share}%</td>
              </tr>
              <tr>
                <th>Proposed share</th>
                <td>{pendingReview.proposed_share}%</td>
              </tr>
              <tr>
                <th>Effective from</th>
                <td>{pendingReview.effective_from}</td>
              </tr>
              <tr>
                <th>Reason</th>
                <td>{pendingReview.amendment_reason}</td>
              </tr>
            </tbody>
          </table>

          {query.evidence && (
            <p
              role="status"
              className={
                query.evidence === "verified"
                  ? styles.success
                  : styles.error
              }
            >
              {({
                verified:
                  "Signed amendment evidence recorded successfully.",
                invalid:
                  "Confirm both checks and enter review notes.",
                "not-eligible":
                  "The amendment is no longer eligible for review.",
                "document-invalid":
                  "Select an active signed PDF linked to the proposed version.",
                failed:
                  "Could not save evidence review.",
              } as Record<string, string>)[query.evidence] ??
                "Evidence review could not be completed."}
            </p>
          )}

          {pendingReview.signed_document_id ? (
            <>
              <h3>Signed Document</h3>

              <p>
                {pendingReview.signed_document_name}
              </p>

              <a
                href={
                  `/api/documents/${pendingReview.signed_document_id}/preview`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                View Signed PDF
              </a>

              <form
                action={verifyAmendmentEvidenceAction}
                className={styles.form}
              >
                <input
                  type="hidden"
                  name="agreement_id"
                  value={agreement.id}
                />

                <input
                  type="hidden"
                  name="amendment_id"
                  value={pendingReview.amendment_id}
                />

                <input
                  type="hidden"
                  name="signed_document_id"
                  value={pendingReview.signed_document_id}
                />

                <label className={styles.fullWidth}>
                  <input
                    type="checkbox"
                    name="document_verified"
                    value="yes"
                    required
                  />
                  I have reviewed the signed document and
                  confirmed it refers to this amendment,
                  investor, percentage and effective date.
                </label>

                <label className={styles.fullWidth}>
                  <input
                    type="checkbox"
                    name="investor_consent_verified"
                    value="yes"
                    required
                  />
                  I have verified the investor&apos;s consent
                  to the proposed contractual change.
                </label>

                <label className={styles.fullWidth}>
                  Review Notes
                  <textarea
                    name="review_notes"
                    rows={3}
                    minLength={10}
                    maxLength={2000}
                    required
                    placeholder="Describe how the signatures and consent were verified."
                  />
                </label>

                <div className={styles.fullWidth}>
                  <button type="submit">
                    Record Evidence Verification
                  </button>
                </div>
              </form>

              {Number(pendingReview.document_verified) === 1 &&
                Number(pendingReview.investor_consent_verified) === 1 && (
                  <p className={styles.success}>
                    Evidence review recorded on{" "}
                    {pendingReview.reviewed_at}.
                    Financial approval is still pending.
                  </p>
                )}
            </>
          ) : (
            <p className={styles.notice}>
              No signed PDF is attached to the proposed
              agreement version. Upload it under Agreement
              Documents using the Signed Agreement role.
            </p>
          )}
        </section>
      )}

      {query.approval && (
        <section className={styles.card}>
          <p
            role="status"
            className={
              query.approval === "approved" ||
              query.approval === "rejected"
                ? styles.success
                : styles.error
            }
          >
            {({
              approved:
                "Amendment approved. The revised share will apply from its effective date.",
              rejected:
                "Amendment rejected. The existing approved agreement remains applicable.",
              "invalid-notes":
                "Enter a review reason of at least 10 characters.",
              "not-eligible":
                "The agreement is not eligible for this decision.",
              stale:
                "The amendment or its source version has changed. Refresh and review again.",
              "invalid-effective-date":
                "The amendment must take effect from tomorrow or later and remain within the existing contractual period.",
              "terms-changed":
                "The proposal changes other terms. Only percentage revisions are supported by this approval workflow.",
              "evidence-missing":
                "Verified signed amendment evidence is required.",
              "evidence-mismatch":
                "The signed document no longer matches its verified SHA-256 fingerprint.",
              overallocated:
                "Approval rejected. Profit shares on the same profit basis would pass 100% for this place, or group-level investors would pass the limit that keeps the owner at 51%. See Accounting → Investor Profit Shares.",
              failed:
                "Approval could not be completed. Check the server logs.",
            } as Record<string, string>)[query.approval] ??
              "Unable to process the amendment decision."}
          </p>
        </section>
      )}

      {pendingReview && (
        <section className={styles.card}>
          <h2>Amendment Decision</h2>

          <p className={styles.notice}>
            Approval will preserve the previous version
            for historical dates and apply the revised
            percentage only from the proposed effective date.
          </p>

          <p>
            <strong>Current share:</strong>{" "}
            {pendingReview.previous_share}%
            {" → "}
            <strong>Proposed share:</strong>{" "}
            {pendingReview.proposed_share}%
          </p>

          <p>
            <strong>Effective from:</strong>{" "}
            {pendingReview.effective_from}
          </p>

          <p>
            <strong>Evidence status:</strong>{" "}
            {Number(pendingReview.document_verified) === 1 &&
              Number(pendingReview.investor_consent_verified) === 1
              ? "Reviewed"
              : "Pending verification"}
          </p>

          {Number(pendingReview.document_verified) === 1 &&
            Number(pendingReview.investor_consent_verified) === 1 &&
            pendingReview.reviewed_document_id ===
              pendingReview.signed_document_id && (
              <form
                action={approveAmendmentAction}
                className={styles.form}
              >
                <input
                  type="hidden"
                  name="agreement_id"
                  value={agreement.id}
                />
                <input
                  type="hidden"
                  name="amendment_id"
                  value={pendingReview.amendment_id}
                />

                <label className={styles.fullWidth}>
                  Final Approval Notes
                  <textarea
                    name="review_notes"
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    required
                    placeholder="Record the signed consent and financial approval basis."
                  />
                </label>

                <div className={styles.fullWidth}>
                  <button type="submit">
                    Approve Amendment
                  </button>
                </div>
              </form>
            )}

          <form
            action={rejectAmendmentAction}
            className={styles.form}
          >
            <input
              type="hidden"
              name="agreement_id"
              value={agreement.id}
            />
            <input
              type="hidden"
              name="amendment_id"
              value={pendingReview.amendment_id}
            />

            <label className={styles.fullWidth}>
              Rejection Reason
              <textarea
                name="review_notes"
                minLength={10}
                maxLength={2000}
                rows={2}
                required
              />
            </label>

            <div className={styles.fullWidth}>
              <button type="submit">
                Reject Amendment
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={styles.card}>
        <h2>Version History</h2>

        {versions.map((version) => (
          <details key={version.id} className={styles.version}>
            <summary>
              <strong>Version {version.version_no}</strong>
              <span>
                {version.amendment_status ??
                  version.version_status}
              </span>
              <small>{version.created_at}</small>
            </summary>

            <p className={styles.reason}>
              Reason: {version.change_reason}
            </p>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Original Terms</th>
                    <th>Version {version.version_no}</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(([label, key]) => {
                    const oldValue = show(original.terms[key]);
                    const newValue = show(version.terms[key]);
                    return (
                      <tr key={key}>
                        <td>{label}</td>
                        <td>{oldValue}</td>
                        <td className={
                          oldValue !== newValue
                            ? styles.changed
                            : ""
                        }>
                          {newValue}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </section>

      <section className={styles.card}>
        <h2>Propose Agreement Amendment</h2>

        {!editable ? (
          <p className={styles.notice}>
            {pending
              ? "A pending amendment must be reviewed before another revision."
              : "Amendments for active agreements will be enabled after the approval workflow is implemented."}
          </p>
        ) : (
          <form
            action={proposeAgreementAmendment}
            className={styles.form}
          >
            <input type="hidden" name="agreement_id" value={id} />

            <label>
              Committed Amount (₹)
              <input
                name="committed_amount"
                defaultValue={terms.committed_amount}
                inputMode="decimal"
                required
              />
            </label>

            <label>
              {isLoan
                ? "Annual Interest Rate (%)"
                : "Profit Share (%)"}
              <input
                name="return_percentage"
                defaultValue={
                  isLoan
                    ? terms.interest_rate_percentage ?? "0"
                    : terms.profit_share_percentage ?? ""
                }
                inputMode="decimal"
                required
              />
            </label>

            {!isLoan && (
              <label>
                Profit Calculation Basis
                <select
                  name="profit_basis"
                  defaultValue={terms.profit_basis ?? "Net Profit"}
                  required
                >
                  {[
                    ...BASIS_OPTIONS,
                    ...(terms.profit_basis &&
                    !(BASIS_OPTIONS as readonly string[]).includes(terms.profit_basis)
                      ? [terms.profit_basis]
                      : []),
                  ].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {isLoan && (
              <label>
                Interest Method
                <select
                  name="interest_method"
                  defaultValue={terms.interest_method}
                >
                  <option value="NONE">None</option>
                  <option value="SIMPLE">Simple</option>
                  <option value="REDUCING_BALANCE">
                    Reducing Balance
                  </option>
                </select>
              </label>
            )}

            <label>
              Effective From
              <input
                type="date"
                name="effective_from"
                defaultValue={terms.effective_from}
                required
              />
            </label>

            <label>
              Effective To
              <input
                type="date"
                name="effective_to"
                defaultValue={terms.effective_to ?? ""}
              />
            </label>

            <label>
              Payout Frequency
              <select
                name="payout_frequency"
                defaultValue={terms.payout_frequency}
              >
                {[
                  "MONTHLY",
                  "QUARTERLY",
                  "HALF_YEARLY",
                  "YEARLY",
                  "ON_MATURITY",
                  "CUSTOM",
                ].map((f) => (
                  <option key={f} value={f}>
                    {f.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Principal Repayment Terms
              <textarea
                name="principal_repayment_terms"
                defaultValue={
                  terms.principal_repayment_terms ?? ""
                }
                rows={3}
              />
            </label>

            {!isLoan && (
              <label>
                Loss Sharing Terms
                <textarea
                  name="loss_sharing_terms"
                  defaultValue={terms.loss_sharing_terms ?? ""}
                  rows={3}
                />
              </label>
            )}

            <label>
              Agreement Notes
              <textarea
                name="agreement_notes"
                defaultValue={terms.agreement_notes ?? ""}
                rows={3}
              />
            </label>

            <label className={styles.fullWidth}>
              Reason for Amendment
              <textarea
                name="change_reason"
                minLength={10}
                maxLength={1000}
                rows={3}
                required
                placeholder="Explain what changed and why"
              />
            </label>

            <div className={styles.fullWidth}>
              <button type="submit">
                Save Proposed Amendment
              </button>
            </div>
          </form>
        )}
      </section>

      <BankAccountSections
        businessId={user.legal_business_id}
        returnTo={`/funding/agreements/${agreement.id}`}
        mapping={query.mapping}
        evidence={query.bankEvidence}
        verification={query.verification}
      />
    </div>
  );
}
