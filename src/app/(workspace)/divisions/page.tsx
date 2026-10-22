
import { Suspense } from "react";
import { requireGroupOwner } from "@/lib/auth";
import { getDivisions } from "@/lib/business-master";
import {
  createDivisionAction,
  updateDivisionAction,
} from "@/lib/division-actions";
import styles from "../masters.module.css";

type PageProps = {
  searchParams: Promise<{
    status?: string;
    message?: string;
  }>;
};

export default function DivisionsPage({
  searchParams,
}: PageProps) {
  return (
    <Suspense
      fallback={
        <div className={styles.card}>Loading divisions...</div>
      }
    >
      <DivisionsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DivisionsContent({
  searchParams,
}: PageProps) {
  const user = await requireGroupOwner();
  const divisions = await getDivisions(user.legal_business_id);
  const params = await searchParams;

  const activeCount = divisions.filter(
    (division) => division.status === "ACTIVE"
  ).length;

  const messages: Record<string, string> = {
    "Division created successfully.": "Division created successfully.",
    "Division updated successfully.": "Division updated successfully.",
    "Division code already exists.": "Division code already exists.",
    "Invalid division code.": "Invalid division code.",
    "No changes required.": "No changes required.",
    "Unable to create division.": "Unable to create division.",
    "Unable to update division.": "Unable to update division.",
    "Division not found.": "Division not found.",
    "Business not found.": "Business not found.",
    "Invalid division ID.": "Invalid division ID.",
    "Invalid division status.": "Invalid division status.",
    "Division name must contain 3 to 180 characters.":
      "Division name must contain 3 to 180 characters.",
  };

  const message = params.message
    ? messages[params.message]
    : undefined;

  return (
    <div>
      <div className={styles.heading}>
        <h1>Business Divisions</h1>
        <p>
          Create and manage business activities under Abhiram Group.
        </p>
      </div>

      {message && (
        <div
          role="status"
          className={
            params.status === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
        >
          {message}
        </div>
      )}

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span>Total Divisions</span>
          <strong>{divisions.length}</strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Active Divisions</span>
          <strong>{activeCount}</strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Inactive Divisions</span>
          <strong>{divisions.length - activeCount}</strong>
        </div>
      </div>

      <section className={styles.card}>
        <h2>Add New Division</h2>

        <form action={createDivisionAction} className={styles.formGrid}>
          <div className={styles.formField}>
            <label htmlFor="divisionCode">Division Code</label>
            <input
              id="divisionCode"
              type="text"
              name="code"
              placeholder="e.g. AGR"
              pattern="[A-Za-z][A-Za-z0-9_-]{1,31}"
              maxLength={32}
              required
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="divisionName">Division Name</label>
            <input
              id="divisionName"
              type="text"
              name="name"
              placeholder="e.g. Abhiram Agriculture"
              minLength={3}
              maxLength={180}
              required
            />
          </div>

          <div className={styles.formSubmit}>
            <button type="submit" className={styles.primaryButton}>
              Create Division
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Division Register</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Division Name</th>
                <th>Status</th>
                <th>Created On</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {divisions.map((division) => (
                <tr key={division.id}>
                  <td>
                    <strong>{division.code}</strong>
                  </td>

                  <td>{division.name}</td>

                  <td>
                    <span
                      className={
                        division.status === "ACTIVE"
                          ? styles.status
                          : styles.inactiveStatus
                      }
                    >
                      {division.status}
                    </span>
                  </td>

                  <td>{division.created_at}</td>

                  <td>
                    <details className={styles.editDetails}>
                      <summary>Edit</summary>

                      <form
                        action={updateDivisionAction}
                        className={styles.editForm}
                      >
                        <input
                          type="hidden"
                          name="divisionId"
                          value={division.id}
                        />

                        <label htmlFor={`name-${division.id}`}>
                          Division Name
                        </label>

                        <input
                          id={`name-${division.id}`}
                          name="name"
                          defaultValue={division.name}
                          minLength={3}
                          maxLength={180}
                          required
                        />

                        <label htmlFor={`status-${division.id}`}>
                          Status
                        </label>

                        <select
                          id={`status-${division.id}`}
                          name="status"
                          defaultValue={division.status}
                        >
                          <option value="ACTIVE">Active</option>
                          <option value="INACTIVE">Inactive</option>
                        </select>

                        <button
                          type="submit"
                          className={styles.primaryButton}
                        >
                          Save Changes
                        </button>
                      </form>
                    </details>
                  </td>
                </tr>
              ))}

              {divisions.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    No divisions have been created.
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
