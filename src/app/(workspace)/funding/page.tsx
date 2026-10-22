import Link from "next/link";
import { Suspense } from "react";
import { requireGroupOwner } from "@/lib/auth";
import { getFundingParties } from "@/lib/funding-parties";
import {
  createFundingPartyAction,
  updateFundingPartyAction,
} from "@/lib/funding-party-actions";
import styles from "./funding.module.css";

type PageProps = {
  searchParams: Promise<{ result?: string }>;
};

const messages: Record<string, string> = {
  created: "Funding party created successfully.",
  updated: "Funding party updated successfully.",
  duplicate: "This party code already exists.",
  invalid: "Please check the information entered.",
  "not-found": "Funding party not found.",
  "active-agreement":
    "This party has an active agreement and cannot be deactivated.",
  failed: "Unable to save. Please try again.",
  "party-code": "Invalid party code. Use 2–32 letters, numbers, underscores or hyphens.",
  "party-type": "Select a valid funding party type.",
  "party-name": "Party name must contain 3–180 characters.",
  "phone": "Invalid phone number. Enter 10–15 digits, optionally starting with +.",
  "email": "Please enter a valid email address.",
  "pan": "Invalid PAN reference. Enter the last three digits followed by one letter.",
  "notes": "Notes cannot exceed 2,000 characters.",
};

export default function FundingPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <div className={styles.page}>Loading funding data...</div>
      }
    >
      <FundingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function FundingContent({
  searchParams,
}: PageProps) {
  const user = await requireGroupOwner();

  const parties = await getFundingParties(
    user.legal_business_id
  );

  const params = await searchParams;
  const result = params.result;
  const message = result ? messages[result] : undefined;
  const success = result === "created" || result === "updated";

  const active = parties.filter(
    (party) => party.status === "ACTIVE"
  ).length;

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>Investors & Lenders</h1>
          <p>
            Maintain funding parties for Abhiram Group
            and its business divisions.
          </p>
        </div>
      </header>

      <div className={styles.linkRow}>
        <Link
          href="/funding/agreements"
          className={styles.primaryLink}
        >
          Manage Funding Agreements →
        </Link>
        <Link
          href="/funding/transactions"
          className={styles.primaryLink}
        >
          Funding Transactions →
        </Link>
        <Link
          href="/funding/participation"
          className={styles.primaryLink}
        >
          Profit Participation →
        </Link>
        <Link
          href="/funding/reconciliation"
          className={styles.primaryLink}
        >
          Profit Participation Reconciliation
        </Link>
      </div>

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
        <Metric label="Total Parties" value={parties.length} />
        <Metric label="Active Parties" value={active} />
        <Metric
          label="Inactive Parties"
          value={parties.length - active}
        />
      </section>

      <section className={styles.card}>
        <h2>Add Funding Party</h2>

        <form
          action={createFundingPartyAction}
          className={styles.formGrid}
        >
          <Field label="Party Code">
            <input
              name="party_code"
              placeholder="INV001"
              pattern="[A-Za-z][A-Za-z0-9_-]{1,31}"
              maxLength={32}
              required
            />
          </Field>

          <Field label="Party Type">
            <select name="party_type" required>
              <option value="INDIVIDUAL">Individual</option>
              <option value="BUSINESS">Business</option>
              <option value="FINANCIAL_INSTITUTION">
                Financial Institution
              </option>
            </select>
          </Field>

          <Field label="Person / Organization Name">
            <input
              name="full_name"
              placeholder="Enter name"
              maxLength={180}
              required
            />
          </Field>

          <Field label="Mobile Number">
            <input
              name="phone"
              type="tel"
              placeholder="+919876543210"
            />
          </Field>

          <Field label="Email">
            <input
              name="email"
              type="email"
              maxLength={190}
              placeholder="Optional"
            />
          </Field>

          <Field label="PAN Last 4 Characters">
            <input
              name="pan_last4"
              placeholder="A123"
              maxLength={4}
            />
          </Field>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              maxLength={2000}
              placeholder="Optional internal remarks"
            />
          </Field>

          <div className={styles.formActions}>
            <button type="submit" className={styles.primary}>
              Add Funding Party
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Funding Party Register</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Party Code</th>
                <th>Name</th>
                <th>Type</th>
                <th>Agreements</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {parties.map((party) => (
                <tr key={party.id}>
                  <td>
                    <strong>{party.party_code}</strong>
                  </td>

                  <td>
                    <div>{party.full_name}</div>
                    <small>{party.email || party.phone || "—"}</small>
                  </td>

                  <td>
                    {party.party_type.replaceAll("_", " ")}
                  </td>

                  <td>{party.agreement_count}</td>

                  <td>
                    <span
                      className={
                        party.status === "ACTIVE"
                          ? styles.active
                          : styles.inactive
                      }
                    >
                      {party.status}
                    </span>
                  </td>

                  <td>
                    <details className={styles.editDetails}>
                      <summary>Edit</summary>

                      <form
                        action={updateFundingPartyAction}
                        className={styles.editForm}
                      >
                        <input
                          type="hidden"
                          name="party_id"
                          value={party.id}
                        />

                        <input
                          type="hidden"
                          name="party_code"
                          value={party.party_code}
                        />

                        <Field label="Name">
                          <input
                            name="full_name"
                            defaultValue={party.full_name}
                            maxLength={180}
                            required
                          />
                        </Field>

                        <Field label="Type">
                          <select
                            name="party_type"
                            defaultValue={party.party_type}
                          >
                            <option value="INDIVIDUAL">
                              Individual
                            </option>
                            <option value="BUSINESS">
                              Business
                            </option>
                            <option value="FINANCIAL_INSTITUTION">
                              Financial Institution
                            </option>
                          </select>
                        </Field>

                        <Field label="Phone">
                          <input
                            name="phone"
                            defaultValue={party.phone || ""}
                          />
                        </Field>

                        <Field label="Email">
                          <input
                            name="email"
                            type="email"
                            maxLength={190}
                            defaultValue={party.email || ""}
                          />
                        </Field>

                        <Field label="PAN Last 4">
                          <input
                            name="pan_last4"
                            maxLength={4}
                            defaultValue={party.pan_last4 || ""}
                          />
                        </Field>

                        <Field label="Notes">
                          <textarea
                            name="notes"
                            maxLength={2000}
                            rows={2}
                            defaultValue={party.notes || ""}
                          />
                        </Field>

                        <Field label="Status">
                          <select
                            name="status"
                            defaultValue={party.status}
                          >
                            <option value="ACTIVE">Active</option>
                            <option value="INACTIVE">Inactive</option>
                          </select>
                        </Field>

                        <button
                          className={styles.primary}
                          type="submit"
                        >
                          Save Changes
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}

              {parties.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    No funding parties registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className={styles.note}>
        Funding parties are master records only.
        Investments, loans and profit-sharing agreements
        will be managed separately.
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
