import AgreementForm from "./AgreementForm";
import Link from "next/link";
import { Suspense } from "react";
import { requireGroupOwner } from "@/lib/auth";
import { getFundingParties } from "@/lib/funding-parties";
import { getDivisions } from "@/lib/business-master";
import { getFundingAgreements } from "@/lib/funding-agreements";
import styles from "../funding.module.css";
import { getBranches } from "@/lib/branch-master";

type PageProps = {
  searchParams: Promise<{ result?: string }>;
};

const messages: Record<string, string> = {
  created: "Draft agreement created successfully.",
  invalid: "Check the agreement information and conditions.",
  "invalid-party": "Select an active funding party.",
  "invalid-division": "Select an active business division.",
  "invalid-branch": "The selected branch is inactive or does not belong to the selected division.",
  duplicate: "This agreement number already exists.",
  failed: "Unable to create the agreement.",
};

function money(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AgreementsPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>Loading funding agreements...</div>
      }
    >
      <AgreementsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AgreementsContent({
  searchParams,
}: PageProps) {
  const user = await requireGroupOwner();

  
  const [parties, divisions, branches, agreements] =
    await Promise.all([
      getFundingParties(user.legal_business_id),
      getDivisions(user.legal_business_id),
      getBranches(user.legal_business_id),
      getFundingAgreements(user.legal_business_id),
    ]);


  const params = await searchParams;
  const message = params.result
    ? messages[params.result]
    : undefined;

  const activeParties = parties.filter(
    (party) => party.status === "ACTIVE"
  );

  const activeDivisions = divisions.filter(
    (division) => division.status === "ACTIVE"
  );

  const activeBranches = branches.filter(
  (branch) => branch.status === "ACTIVE"
 );


  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>Funding Agreements</h1>
        <p>
          Create group, division, or branch-specific agreements.
          New agreements remain in Draft status.
        </p>
      </header>

      <p className={styles.note}>
        <Link href="/funding">← Back to Funding Parties</Link>
      </p>

      {message && (
        <div
          role="status"
          className={
            params.result === "created"
              ? styles.success
              : styles.error
          }
        >
          {message}
        </div>
      )}

      <section className={styles.metrics}>
        <Metric label="Total Agreements" value={agreements.length} />
        <Metric
          label="Draft"
          value={agreements.filter(
            (a) => a.status === "DRAFT"
          ).length}
        />
        <Metric
          label="Active"
          value={agreements.filter(
            (a) => a.status === "ACTIVE"
          ).length}
        />
      </section>

      <section className={styles.card}>
        <h2>Create Funding Agreement</h2>

        {activeParties.length === 0 ? (
          <p className={styles.note}>
            Register an active funding party before
            creating an agreement.
          </p>
        ) : (
          <AgreementForm
            parties={activeParties.map((party) => ({
              id: party.id,
              code: party.party_code,
              name: party.full_name,
            }))}
            divisions={activeDivisions.map((division) => ({
              id: division.id,
              code: division.code,
              name: division.name,
            }))}
            branches={activeBranches.map((branch) => ({
              id: branch.id,
              division_id: branch.division_id,
              code: branch.branch_code,
              name: branch.branch_name,
            }))}
          />
        )}

        <p className={styles.note}>
          For profit-linked funding, enter a positive
          profit-share percentage and its calculation basis.
          Leave interest fields blank.
          For loans, leave profit-share fields blank and enter
          the applicable interest terms, if any.
        </p>
      </section>

      <section className={styles.card}>
        <h2>Agreement Register</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Agreement</th>
                <th>Funding Party</th>
                <th>Division</th>
                <th>Branch</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Return Terms</th>
                <th>Effective From</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {agreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td>
                    <Link
                        href={`/funding/agreements/${agreement.id}`}
                        className={styles.agreementLink}
                    >
                        {agreement.agreement_no}
                    </Link>
                    </td>
                  <td>
                    {agreement.party_name}
                    <small>{agreement.party_code}</small>
                  </td>
                  <td>{agreement.division_name ?? "Abhiram Group"}</td>
                  <td>
                    {agreement.branch_id !== null
                      ? agreement.branch_name ??
                        "Branch reference unavailable"
                      : agreement.division_id !== null
                        ? "All branches / Division"
                        : "Group-wide"}
                  </td>
                  <td>{agreement.funding_type.replaceAll("_", " ")}</td>
                  <td>{money(agreement.committed_amount)}</td>
                  <td>
                    {agreement.funding_type === "PROFIT_LINKED"
                      ? `${agreement.profit_share_percentage}% profit share`
                      : agreement.interest_rate_percentage
                        ? `${agreement.interest_rate_percentage}% interest`
                        : "No interest specified"}
                  </td>
                  <td>{agreement.effective_from}</td>
                  <td>
                    <span className={styles.inactive}>
                      {agreement.status}
                    </span>
                  </td>
                </tr>
              ))}

              {agreements.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    No funding agreements have been created.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
