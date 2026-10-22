import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { mapBankToGLAction } from "@/lib/bank-gl-actions";
import {
  uploadBankEvidenceAction,
  verifyBankAccountAction,
} from "@/lib/bank-verification-actions";

type Props = {
  businessId: number;
  returnTo: string;
  mapping?: string;
  evidence?: string;
  verification?: string;
};

interface BankRow extends RowDataPacket {
  id: number;
  ownership_type: string;
  account_label: string;
  account_holder_name: string;
  bank_name: string;
  ifsc_code: string;
  account_number_last4: string;
  verification_status: string;
  status: string;
  gl_account_id: number | null;
  gl_account_code: string | null;
  gl_account_name: string | null;
}

interface GLAccountRow extends RowDataPacket {
  id: number;
  account_code: string;
  account_name: string;
}

interface BankEvidenceRow extends RowDataPacket {
  id: number;
  bank_account_id: number;
  original_filename: string;
  uploaded_at: string;
}

const mappingMessages: Record<string, string> = {
  mapped: "Bank GL mapping saved successfully.",
  invalid: "Select a valid bank and GL account.",
  "not-found": "Business or bank account not found.",
  "not-eligible":
    "Only active business-controlled bank accounts can be mapped.",
  "already-mapped":
    "This bank account already has a GL mapping.",
  "invalid-gl": "Select an active Bank Asset posting account.",
  "gl-in-use": "This GL account is already linked to another bank.",
  stale: "The account changed. Refresh and try again.",
  failed: "GL mapping failed. Check server logs.",
};

const verificationMessages: Record<string, string> = {
  invalid: "Check the submitted information.",
  "not-found": "Bank account not found.",
  "no-evidence": "Select valid supporting evidence.",
  "gl-required": "Map the business bank to a GL account first.",
  "already-verified": "This account has already been verified.",
  "integrity-failed": "The evidence file failed its integrity check.",
  failed: "Operation failed. Check server logs.",
};

export default async function BankAccountSections({
  businessId,
  returnTo,
  mapping,
  evidence,
  verification,
}: Props) {
  const [bankRows, glResult, evidenceResult] = await Promise.all([
    db.execute<BankRow[]>(
      `SELECT
         b.id,
         b.ownership_type,
         b.account_label,
         b.account_holder_name,
         b.bank_name,
         b.ifsc_code,
         b.account_number_last4,
         b.verification_status,
         b.status,
         b.gl_account_id,
         gl.account_code AS gl_account_code,
         gl.account_name AS gl_account_name
       FROM acct_bank_accounts b
       LEFT JOIN acct_chart_of_accounts gl
         ON gl.id = b.gl_account_id
        AND gl.legal_business_id = b.legal_business_id
       WHERE b.legal_business_id = ?
       ORDER BY b.ownership_type, b.bank_name, b.id DESC`,
      [businessId]
    ),
    db.execute<GLAccountRow[]>(
      `SELECT
         c.id,
         c.account_code,
         c.account_name
       FROM acct_chart_of_accounts c
       WHERE c.legal_business_id = ?
         AND c.account_type = 'ASSET'
         AND c.account_subtype = 'BANK'
         AND c.normal_balance = 'DEBIT'
         AND c.is_posting_account = 1
         AND c.status = 'ACTIVE'
         AND NOT EXISTS (
           SELECT 1
           FROM acct_bank_accounts b
           WHERE b.legal_business_id = c.legal_business_id
             AND b.gl_account_id = c.id
         )
       ORDER BY c.account_code`,
      [businessId]
    ),
    db.execute<BankEvidenceRow[]>(
      `SELECT
         e.id,
         e.bank_account_id,
         e.original_filename,
         DATE_FORMAT(e.uploaded_at, '%Y-%m-%d %H:%i') AS uploaded_at
       FROM acct_bank_evidence e
       JOIN acct_bank_accounts b
         ON b.id = e.bank_account_id
        AND b.legal_business_id = e.legal_business_id
       WHERE e.legal_business_id = ?
         AND e.status = 'ACTIVE'
       ORDER BY e.id DESC`,
      [businessId]
    ),
  ]);

  const banks = bankRows[0];
  const glRows = glResult[0];
  const evidenceByBank = new Map<number, BankEvidenceRow[]>();

  for (const document of evidenceResult[0]) {
    const documents = evidenceByBank.get(document.bank_account_id) ?? [];
    documents.push(document);
    evidenceByBank.set(document.bank_account_id, documents);
  }

  const evidenceResultCode = evidence ?? verification;
  const evidenceMessage = evidence === "uploaded"
    ? "Evidence uploaded successfully. Verification is still required."
    : verification === "verified"
      ? "Bank account verification recorded."
      : verification === "rejected"
        ? "Evidence review rejected. Account remains unverified."
        : evidenceResultCode
          ? verificationMessages[evidenceResultCode] ??
            "Unable to process request."
          : undefined;

  return (
    <>
      <section
        style={{
          padding: 20,
          marginTop: 24,
          border: "1px solid #cbd5e1",
          borderRadius: 10,
        }}
      >
        <h2>Business Bank GL Mapping</h2>

        <p>
          Link each Abhiram-controlled bank account
          to one dedicated Bank Asset ledger account.
          Investor-owned bank accounts are excluded.
        </p>

        {mapping && (
          <p role="status">
            {mappingMessages[mapping] ?? "Unable to process mapping."}
          </p>
        )}

        {banks
          .filter((bank) => bank.ownership_type === "BUSINESS")
          .map((bank) => (
            <div
              key={bank.id}
              style={{
                padding: 14,
                marginBottom: 12,
                border: "1px solid #e2e8f0",
                borderRadius: 8,
              }}
            >
              <h3>
                {bank.account_label} — {bank.bank_name}
              </h3>

              <p>
                Account: ••••{bank.account_number_last4}
                {" | "}
                Verification: {bank.verification_status}
              </p>

              {bank.gl_account_id !== null ? (
                <p>
                  <strong>Mapped GL:</strong>{" "}
                  {bank.gl_account_code}
                  {" — "}
                  {bank.gl_account_name}
                </p>
              ) : bank.status === "ACTIVE" ? (
                <form
                  action={mapBankToGLAction}
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="hidden"
                    name="bank_account_id"
                    value={bank.id}
                  />
                  <input
                    type="hidden"
                    name="return_to"
                    value={returnTo}
                  />
                  <label>
                    General Ledger Account{" "}
                    <select
                      name="gl_account_id"
                      required
                      defaultValue=""
                      style={{ padding: 10, minWidth: 260 }}
                    >
                      <option value="" disabled>
                        Select Bank GL Account
                      </option>
                      {glRows.map((gl) => (
                        <option key={gl.id} value={gl.id}>
                          {gl.account_code} — {gl.account_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={glRows.length === 0}
                  >
                    Link GL Account
                  </button>
                </form>
              ) : (
                <p>Activate this bank account before mapping.</p>
              )}
            </div>
          ))}
      </section>

      <section style={{
        marginTop: 28,
        padding: 20,
        border: "1px solid #cbd5e1",
        borderRadius: 10,
      }}>
        <h2>Bank Account Verification</h2>

        <p>
          Upload evidence, view it securely and record
          the account verification decision. Investor
          accounts do not require a GL mapping.
        </p>

        {evidenceMessage && (
          <p role="status">{evidenceMessage}</p>
        )}

        {banks.map((bank) => {
          const evidence = evidenceByBank.get(bank.id) ?? [];

          return (
            <div
              key={bank.id}
              style={{
                border: "1px solid #e2e8f0",
                padding: 18,
                borderRadius: 8,
                marginTop: 16,
              }}
            >
              <h3>
                {bank.account_label} — {bank.bank_name}
              </h3>

              <p>
                Holder: {bank.account_holder_name}
                {" | "}Account: ••••{bank.account_number_last4}
                {" | "}IFSC: {bank.ifsc_code}
              </p>

              <p>
                Ownership: {bank.ownership_type}
                {" | "}Verification: {bank.verification_status}
              </p>

              {bank.status === "ACTIVE" && (
                <form
                  action={uploadBankEvidenceAction}
                  style={{
                    display: "flex",
                    alignItems: "end",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <input
                    type="hidden"
                    name="bank_account_id"
                    value={bank.id}
                  />
                  <input
                    type="hidden"
                    name="return_to"
                    value={returnTo}
                  />
                  <label>
                    Upload Bank Evidence
                    <input
                      type="file"
                      name="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp"
                      required
                    />
                  </label>
                  <button type="submit">Upload Evidence</button>
                </form>
              )}

              <h4>Supporting Documents</h4>

              {evidence.length === 0 ? (
                <p>No evidence uploaded.</p>
              ) : (
                <table style={{
                  width: "100%",
                  marginBottom: 16,
                }}>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Uploaded</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evidence.map((document) => (
                      <tr key={document.id}>
                        <td>{document.original_filename}</td>
                        <td>{document.uploaded_at}</td>
                        <td>
                          <a
                            href={`/api/bank-evidence/${document.id}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View Document
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {bank.status === "ACTIVE" &&
                bank.verification_status !== "VERIFIED" &&
                evidence.length > 0 && (
                  <form
                    action={verifyBankAccountAction}
                    style={{
                      display: "grid",
                      gap: 12,
                      maxWidth: 650,
                    }}
                  >
                    <input
                      type="hidden"
                      name="bank_account_id"
                      value={bank.id}
                    />
                    <input
                      type="hidden"
                      name="return_to"
                      value={returnTo}
                    />
                    <label>
                      Evidence to Verify
                      <select
                        name="evidence_id"
                        required
                        defaultValue=""
                      >
                        <option value="" disabled>
                          Select reviewed document
                        </option>
                        {evidence.map((document) => (
                          <option
                            key={document.id}
                            value={document.id}
                          >
                            {document.original_filename}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Verification Notes
                      <textarea
                        name="verification_notes"
                        minLength={10}
                        maxLength={2000}
                        rows={3}
                        required
                        placeholder={
                          "Confirm holder name, full account number, " +
                          "IFSC and supporting evidence."
                        }
                      />
                    </label>
                    <label>
                      Decision
                      <select
                        name="decision"
                        defaultValue=""
                        required
                      >
                        <option value="" disabled>
                          Select decision
                        </option>
                        <option value="VERIFIED">
                          Verified — Details Match
                        </option>
                        <option value="REJECTED">
                          Reject Evidence
                        </option>
                      </select>
                    </label>
                    <button type="submit">
                      Record Verification
                    </button>
                  </form>
                )}
            </div>
          );
        })}
      </section>
    </>
  );
}
