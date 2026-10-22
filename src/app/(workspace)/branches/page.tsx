
import { Suspense } from "react";
import { requireGroupOwner } from "@/lib/auth";
import { getDivisions } from "@/lib/business-master";
import { getBranches } from "@/lib/branch-master";
import {
  createBranchAction,
  updateBranchAction,
} from "@/lib/branch-actions";

import styles from "../funding/funding.module.css";

type PageProps = {
  searchParams: Promise<{ result?: string }>;
};

const messages: Record<string, string> = {
  created: "Branch created successfully.",
  updated: "Branch updated successfully.",
  duplicate: "This branch code already exists in the selected division.",
  invalid: "Please check the branch details.",
  "invalid-division": "Select an active business division.",
  "inactive-division":
    "The branch cannot be activated because its division is inactive.",
  "open-agreements":
    "This branch has open funding agreements and cannot be deactivated.",
  "not-found": "Branch record not found.",
  failed: "Unable to save the branch.",
};

export default function BranchesPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>Loading branches...</div>
      }
    >
      <BranchesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BranchesContent({
  searchParams,
}: PageProps) {
  const user = await requireGroupOwner();

  const [branches, divisions] = await Promise.all([
    getBranches(user.legal_business_id),
    getDivisions(user.legal_business_id),
  ]);

  const params = await searchParams;

  const message = params.result
    ? messages[params.result]
    : undefined;

  const success =
    params.result === "created" ||
    params.result === "updated";

  const activeDivisions = divisions.filter(
    (division) => division.status === "ACTIVE"
  );

  const activeBranches = branches.filter(
    (branch) => branch.status === "ACTIVE"
  );

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <h1>Branch Management</h1>
        <p>
          Create and maintain branches across
          Abhiram Group's business divisions.
        </p>
      </header>

      {message && (
        <div
          role="status"
          className={
            success ? styles.success : styles.error
          }
        >
          {message}
        </div>
      )}

      <section className={styles.metrics}>
        <Metric
          label="Total Branches"
          value={branches.length}
        />
        <Metric
          label="Active Branches"
          value={activeBranches.length}
        />
        <Metric
          label="Inactive Branches"
          value={branches.length - activeBranches.length}
        />
      </section>

      <section className={styles.card}>
        <h2>Create Branch</h2>

        {activeDivisions.length === 0 ? (
          <p className={styles.note}>
            You must create an active business division
            before adding a branch.
          </p>
        ) : (
          <form
            action={createBranchAction}
            className={styles.formGrid}
          >
            <Field label="Business Division">
              <select
                name="division_id"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Select Division
                </option>
                {activeDivisions.map((division) => (
                  <option
                    key={division.id}
                    value={division.id}
                  >
                    {division.code} — {division.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Branch Code">
              <input
                name="branch_code"
                placeholder="ATX-BR02"
                maxLength={32}
                pattern="[A-Za-z][A-Za-z0-9_-]{1,31}"
                required
              />
            </Field>

            <Field label="Branch Name">
              <input
                name="branch_name"
                placeholder="Example: Second Textiles Branch"
                maxLength={180}
                required
              />
            </Field>

            <Field label="Opening Date">
              <input name="opened_on" type="date" />
            </Field>

            <Field label="Address Line 1">
              <input name="address_line1" maxLength={255} />
            </Field>

            <Field label="Address Line 2">
              <input name="address_line2" maxLength={255} />
            </Field>

            <Field label="City">
              <input
                name="city"
                defaultValue="Hyderabad"
                maxLength={100}
              />
            </Field>

            <Field label="State">
              <input
                name="state"
                defaultValue="Telangana"
                maxLength={100}
              />
            </Field>

            <Field label="Postal Code">
              <input name="postal_code" maxLength={12} />
            </Field>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primary}
              >
                Create Branch
              </button>
            </div>
          </form>
        )}
      </section>

      <section className={styles.card}>
        <h2>Branch Register</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Branch Code</th>
                <th>Branch</th>
                <th>Division</th>
                <th>Location</th>
                <th>Funding Agreements</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id}>
                  <td>
                    <strong>{branch.branch_code}</strong>
                  </td>

                  <td>
                    <strong>{branch.branch_name}</strong>
                    <small>
                      Opened: {branch.opened_on ?? "Not specified"}
                    </small>
                  </td>

                  <td>
                    {branch.division_name}
                    <small>{branch.division_code}</small>
                  </td>

                  <td>
                    {[branch.city, branch.state]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </td>

                  <td>
                    {branch.agreement_count}
                    <small>
                      {branch.open_agreement_count} open
                    </small>
                  </td>

                  <td>
                    <span
                      className={
                        branch.status === "ACTIVE"
                          ? styles.active
                          : styles.inactive
                      }
                    >
                      {branch.status}
                    </span>
                  </td>

                  <td>
                    <details className={styles.editDetails}>
                      <summary>Edit</summary>

                      <form
                        action={updateBranchAction}
                        className={styles.editForm}
                      >
                        <input
                          type="hidden"
                          name="branch_id"
                          value={branch.id}
                        />

                        <Field label="Branch Name">
                          <input
                            name="branch_name"
                            defaultValue={branch.branch_name}
                            maxLength={180}
                            required
                          />
                        </Field>

                        <Field label="Opening Date">
                          <input
                            name="opened_on"
                            type="date"
                            defaultValue={branch.opened_on ?? ""}
                          />
                        </Field>

                        <Field label="Address Line 1">
                          <input
                            name="address_line1"
                            defaultValue={branch.address_line1 ?? ""}
                            maxLength={255}
                          />
                        </Field>

                        <Field label="Address Line 2">
                          <input
                            name="address_line2"
                            defaultValue={branch.address_line2 ?? ""}
                            maxLength={255}
                          />
                        </Field>

                        <Field label="City">
                          <input
                            name="city"
                            defaultValue={branch.city ?? ""}
                            maxLength={100}
                          />
                        </Field>

                        <Field label="State">
                          <input
                            name="state"
                            defaultValue={branch.state ?? ""}
                            maxLength={100}
                          />
                        </Field>

                        <Field label="Postal Code">
                          <input
                            name="postal_code"
                            defaultValue={branch.postal_code ?? ""}
                            maxLength={12}
                          />
                        </Field>

                        <Field label="Status">
                          <select
                            name="status"
                            defaultValue={branch.status}
                          >
                            <option value="ACTIVE">
                              Active
                            </option>
                            <option value="INACTIVE">
                              Inactive
                            </option>
                          </select>
                        </Field>

                        <button
                          type="submit"
                          className={styles.primary}
                        >
                          Save Changes
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}

              {branches.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    No branches registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className={styles.note}>
        Branches are operational units under existing
        business divisions. Creating a branch does not
        automatically create a separate legal business,
        bank account or GST registration.
      </p>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}
