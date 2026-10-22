
import { Suspense } from "react";
import Link from "next/link";

import { requireGroupOwner } from "@/lib/auth";
import {
  createDivisionScopeAmendmentAction,
} from "@/lib/investor-scope-amendment-actions";

import {
  approveDivisionScopeAmendmentAction,
} from "@/lib/investor-scope-approval-actions";

type Props = {
  searchParams: Promise<{ result?: string }>;
};

const messages: Record<string, string> = {
  created: "Draft Version 2 and pending amendment created.",
  invalid: "Confirm the amendment and enter a valid date.",
  "agreement-invalid": "The agreement no longer matches the expected scope.",
  "date-invalid": "The effective date precedes the original agreement.",
  "amendment-pending": "An amendment is already pending.",
  "version-invalid": "The latest agreement version is not approved.",
  "terms-invalid": "The approved agreement terms need review.",
  "policy-invalid": "A confirmed policy was not found.",
  failed: "Unable to create the amendment. Check server logs.",
  approved: "Agreement amendment approved. Version 2 is now active.",
  "approval-invalid": "Confirm the amendment before approval.",
  "business-not-found": "Legal business was not found.",
  "state-invalid":
    "The amendment is not pending or the agreement scope has changed.",
  "financial-terms-changed":
    "The proposed version contains changes outside the approved scope.",
};

async function AmendmentContent({ searchParams }: Props) {
  await requireGroupOwner();
  const { result } = await searchParams;

  return (
    <main style={{
      maxWidth: 850,
      margin: "0 auto",
      padding: 24,
    }}>
      <Link href="/accounting/purchase-management">
        ← Purchase Management
      </Link>

      <h1>Investor Agreement Scope Amendment</h1>

      <p>
        Agreement: <strong>ATX_DNL_01</strong>
      </p>

      <p>
        Existing scope: Kapra Branch.
        Proposed scope: Abhiram Textiles Division.
      </p>

      {result && (
        <p role="status">
          {messages[result] ?? "Request processed."}
        </p>
      )}

      <form
        action={createDivisionScopeAmendmentAction}
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 20,
          display: "grid",
          gap: 16,
        }}
      >
        <label>
          Proposed Amendment Effective Date
          <input
            type="date"
            name="effective_from"
            min="2026-10-01"
            defaultValue="2026-10-17"
            required
            style={{
              display: "block",
              marginTop: 8,
              padding: 10,
            }}
          />
        </label>

        <p>
          The proposed effective date is 17 October
          2026 to cover the existing investor-funded
          purchase. Any retrospective change requires
          appropriate review and approval.
        </p>

        <label>
          <input
            type="checkbox"
            name="confirm"
            value="REQUEST_SCOPE_AMENDMENT"
            required
          />
          {" "}
          I confirm this is a request to change scope
          only. All existing economic terms will be
          preserved for review.
        </label>

        <button type="submit" style={{ padding: 12 }}>
          Create Draft Amendment
        </button>
      </form>

      <section
        style={{
          border: "1px solid #cbd5e1",
          borderRadius: 10,
          padding: 20,
          marginTop: 24,
        }}
      >
        <h2>Approve Pending Amendment</h2>

        <p>
          Agreement: <strong>ATX_DNL_01</strong>
        </p>

        <p>
          Amendment ID: <strong>1</strong>
        </p>

        <p>
          Version 1: Kapra Branch
          {" → "}
          Version 2: Abhiram Textiles Division
        </p>

        <p>
          Effective Date: <strong>17 October 2026</strong>
        </p>

        <form action={approveDivisionScopeAmendmentAction}>
          <label>
            <input
              type="checkbox"
              name="confirm"
              value="APPROVE_AMENDMENT_1"
              required
            />
            {" "}
            I have reviewed the proposed scope change
            and confirm that the approved financial terms
            must remain unchanged.
          </label>

          <div style={{ marginTop: 18 }}>
            <button
              type="submit"
              style={{ padding: "12px 20px" }}
            >
              Approve Scope Amendment
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function AmendmentPage(props: Props) {
  return (
    <Suspense fallback={<main>Loading amendment…</main>}>
      <AmendmentContent {...props} />
    </Suspense>
  );
}
