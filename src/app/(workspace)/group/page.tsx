import { updateGroupAction } from "@/lib/group-actions";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireGroupOwner } from "@/lib/auth";
import {
  getBusiness,
  getFinancialYears,
} from "@/lib/business-master";

import {
  getBusinessPeople,
  createBusinessPersonAction,
} from "@/lib/business-people";
import { getDivisions } from "@/lib/business-master";

import styles from "../masters.module.css";

import { updateBusinessPersonAction } from
  "@/lib/person-update-actions";

import { archiveDocumentAction } from
  "@/lib/document-actions";

import { getArchivedBusinessDocuments } from
  "@/lib/business-documents";

import Link from "next/link";
import {
  getBusinessDocuments,
  DOCUMENT_TYPES,
} from "@/lib/business-documents";

type GroupMasterPageProps = {
  searchParams: Promise<{
    updated?: string;
    error?: string;
    document?: string;
    person?: string;
  }>;
};

export default function GroupMasterPage({
  searchParams,
}: GroupMasterPageProps) {
  return (
    <Suspense fallback={<div className={styles.card}>Loading group details...</div>}>
      <GroupMasterContent searchParams={searchParams} />
    </Suspense>
  );
}

async function GroupMasterContent({
  searchParams,
}: GroupMasterPageProps) {
  const params = await searchParams;
  const user = await requireGroupOwner();
  const documents = await getBusinessDocuments(
    user.legal_business_id
  );
  const [people, divisions] = await Promise.all([
    getBusinessPeople(user.legal_business_id),
    getDivisions(user.legal_business_id),
  ]);
  const archivedDocuments =
  await getArchivedBusinessDocuments(
    user.legal_business_id
  );
  const business = await getBusiness(user.legal_business_id);
  const years = await getFinancialYears(
    user.legal_business_id
  );

  if (!business) {
    notFound();
  }

  return (
    <div>
      <div className={styles.heading}>
        <div>
          <h1>Group Master</h1>
          <p>Registered business details and financial years</p>
        </div>
      </div>

      {params.updated === "1" && (
        <p role="status" className={styles.successNotice}>
          Business details updated successfully.
        </p>
      )}

      {params.error && (
        <p role="alert" className={styles.errorNotice}>
          {params.error}
        </p>
      )}

      <section className={styles.card}>
        <h2>Business Information</h2>

        <div className={styles.details}>
          <Field
            label="Legal Name"
            value={business.legal_name}
          />
          <Field
            label="Trading Name"
            value={business.trading_name}
          />
          <Field
            label="Legal Form"
            value={business.legal_form}
          />
          <Field
            label="Currency"
            value={business.currency_code}
          />
          <Field
            label="PAN (Last 4)"
            value={business.pan_last4}
          />
          <Field
            label="GSTIN"
            value={business.gstin}
          />
        </div>
      </section>

      <section className={styles.card}>
        <h2>Update Business Registration</h2>

        <form action={updateGroupAction} className={styles.editGrid}>
          <label>
            Legal Name
            <input
              name="legal_name"
              defaultValue={business.legal_name}
              maxLength={180}
              required
            />
          </label>

          <label>
            Trading Name
            <input
              name="trading_name"
              defaultValue={business.trading_name ?? ""}
              maxLength={180}
            />
          </label>

          <label>
            GSTIN
            <input
              name="gstin"
              defaultValue={business.gstin ?? ""}
              maxLength={15}
              placeholder="GSTIN, if registered"
            />
          </label>

          <label>
            PAN — Last 4 Characters
            <input
              name="pan_last4"
              defaultValue={business.pan_last4 ?? ""}
              maxLength={4}
              placeholder="e.g. 234F or A123"
            />
          </label>

          <label>
            Udyam Registration Number
            <input
              name="udyam_registration_no"
              defaultValue={business.udyam_registration_no ?? ""}
              maxLength={25}
              placeholder="UDYAM-TS-00-0000000"
            />
          </label>

          <label>
            Registration Year
            <input
              type="number"
              name="registration_year"
              min={1900}
              max={new Date().getFullYear()}
              defaultValue={business.registration_year ?? ""}
              placeholder="e.g. 2026"
            />
          </label>

          <div className={styles.formActions}>
            <button type="submit">Save Business Details</button>
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Owners &amp; Authorized Persons</h2>

        {params.person === "updated" && (
          <p role="status" className={styles.successNotice}>
            Person details updated successfully.
          </p>
        )}

        {params.person &&
          params.person !== "updated" && (
            <p role="alert" className={styles.errorNotice}>
              Unable to update the person. Check the
              details and assigned division.
            </p>
          )}

        <p className={styles.sectionDescription}>
          Assign authorized persons or division managers.
          Legal ownership and investor agreements are managed
          separately.
        </p>

        <form
          action={createBusinessPersonAction}
          className={styles.editGrid}
        >
          <label>
            Full Name
            <input name="full_name" maxLength={180} required />
          </label>

          <label>
            Email
            <input name="email" type="email" maxLength={190} />
          </label>

          <label>
            Mobile Number
            <input
              name="phone"
              type="tel"
              placeholder="+919876543210"
            />
          </label>

          <label>
            Role
            <select name="role" required defaultValue="AUTHORIZED_REPRESENTATIVE">
              <option value="AUTHORIZED_REPRESENTATIVE">
                Authorized Representative
              </option>
              <option value="DIVISION_MANAGER">
                Division Manager
              </option>
            </select>
          </label>

          <label>
            Business Assignment
            <select name="division_id" defaultValue="">
              <option value="">Abhiram Group</option>
              {divisions
                .filter((division) => division.status === "ACTIVE")
                .map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
            </select>
          </label>

          <div className={styles.formActions}>
            <button type="submit">Add Person</button>
          </div>
        </form>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Assignment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.full_name}</td>
                  <td>{person.role.replaceAll("_", " ")}</td>
                  <td>{person.division_name ?? "Abhiram Group"}</td>
                  <td>{person.status}</td>
                  <td>
                    {person.role === "LEGAL_PROPRIETOR" ? (
                      <span>Restricted</span>
                    ) : (
                      <details className={styles.editDetails}>
                        <summary>Edit</summary>

                        <form
                          action={updateBusinessPersonAction}
                          className={styles.editForm}
                        >
                          <input
                            type="hidden"
                            name="person_id"
                            value={person.id}
                          />

                          <label>Full Name</label>
                          <input
                            name="full_name"
                            defaultValue={person.full_name}
                            required
                            maxLength={180}
                          />

                          <label>Email</label>
                          <input
                            type="email"
                            name="email"
                            defaultValue={person.email ?? ""}
                            maxLength={190}
                          />

                          <label>Phone</label>
                          <input
                            name="phone"
                            defaultValue={person.phone ?? ""}
                            placeholder="+919876543210"
                          />

                          <label>Role</label>
                          <select
                            name="role"
                            defaultValue={person.role}
                          >
                            <option value="AUTHORIZED_REPRESENTATIVE">
                              Authorized Representative
                            </option>
                            <option value="DIVISION_MANAGER">
                              Division Manager
                            </option>
                          </select>

                          <label>Business Assignment</label>
                          <select
                            name="division_id"
                            defaultValue={person.division_id ?? ""}
                          >
                            <option value="">Abhiram Group</option>
                            {divisions
                              .filter(
                                (division) =>
                                  division.status === "ACTIVE" ||
                                  division.id === person.division_id
                              )
                              .map((division) => (
                                <option
                                  key={division.id}
                                  value={division.id}
                                >
                                  {division.name}
                                </option>
                              ))}
                          </select>

                          <label>Status</label>
                          <select
                            name="status"
                            defaultValue={person.status}
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
                    )}
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={5}>No persons registered.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Business Documents</h2>

        <p className={styles.sectionDescription}>
          Upload and maintain business registration documents.
          Documents are restricted to authorized users.
        </p>

        {params.document === "uploaded" && (
          <p className={styles.successNotice}>
            Document uploaded successfully.
          </p>
        )}

        {params.document &&
          params.document !== "uploaded" &&
          params.document !== "archived" &&
          params.document !== "already-archived" &&
          !params.document.startsWith("archive-") && (
            <p className={styles.errorNotice}>
              {params.document === "too-large"
                ? "Document exceeds the 5 MB limit."
                : params.document === "invalid-type"
                  ? "Only valid PDF, JPG and PNG files are allowed."
                  : "Document upload failed. Check the file and try again."}
            </p>
          )}

        {params.document === "archived" && (
          <p role="status" className={styles.successNotice}>
            Document archived successfully.
          </p>
        )}

        {params.document?.startsWith("archive-") && (
          <p role="alert" className={styles.errorNotice}>
            Unable to archive the selected document.
          </p>
        )}

        <form
          action="/api/documents"
          method="POST"
          encType="multipart/form-data"
          className={styles.editGrid}
        >
          <label>
            Business / Division
            <select name="division_id" defaultValue="">
              <option value="">Abhiram Group</option>
              {divisions
                .filter((division) => division.status === "ACTIVE")
                .map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Document Type
            <select name="document_type" required>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>

          <label>
            Select Document
            <input
              type="file"
              name="document"
              accept=".pdf,.jpg,.jpeg,.png"
              required
            />
          </label>

          <div className={styles.formActions}>
            <button type="submit">Upload Document</button>
          </div>
        </form>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Business / Division</th>
                <th>Uploaded</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td>{document.document_name}</td>
                  <td>
                    {document.document_type.replaceAll("_", " ")}
                  </td>
                  <td>{document.division_name ?? "Abhiram Group"}</td>
                  <td>{document.uploaded_at}</td>
                  <td>
                    <div className={styles.documentActions}>
                      <a
                        href={`/api/documents/${document.id}/preview`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.documentLink}
                      >
                        View PDF
                      </a>

                      <Link
                        href={`/api/documents/${document.id}`}
                        className={styles.documentLink}
                      >
                        Download
                      </Link>

                      <details className={styles.editDetails}>
                        <summary>Archive</summary>

                        <form
                          action={archiveDocumentAction}
                          className={styles.editForm}
                        >
                          <input
                            type="hidden"
                            name="document_id"
                            value={document.id}
                          />

                          <label>Reason for archival</label>

                          <textarea
                            name="archive_reason"
                            rows={3}
                            minLength={5}
                            maxLength={500}
                            required
                            placeholder="e.g. Replaced by updated GST certificate"
                          />

                          <button
                            type="submit"
                            className={styles.archiveButton}
                          >
                            Confirm Archive
                          </button>
                        </form>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={5}>No documents uploaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Archived Documents</h2>

        <p className={styles.sectionDescription}>
          Historical business documents retained for audit
          and reference purposes.
        </p>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Division</th>
                <th>Archived On</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {archivedDocuments.map((document) => (
                <tr key={document.id}>
                  <td>{document.document_name}</td>
                  <td>
                    {document.document_type.replaceAll("_", " ")}
                  </td>
                  <td>{document.division_name ?? "Abhiram Group"}</td>
                  <td>{document.archived_at ?? "—"}</td>
                  <td>{document.archive_reason ?? "—"}</td>
                  <td>
                    <Link
                      href={`/api/documents/${document.id}`}
                      className={styles.documentLink}
                    >
                      Download
                    </Link>
                  </td>
                </tr>
              ))}

              {archivedDocuments.length === 0 && (
                <tr>
                  <td colSpan={6}>No archived documents.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card}>
        <h2>Financial Years</h2>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Financial Year</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {years.map((year) => (
                <tr key={year.id}>
                  <td>{year.label}</td>
                  <td>{year.starts_on}</td>
                  <td>{year.ends_on}</td>
                  <td>
                    <span className={styles.status}>
                      {year.status}
                    </span>
                  </td>
                </tr>
              ))}

              {years.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    No financial years configured.
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

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <strong>{value || "Not configured"}</strong>
    </div>
  );
}
