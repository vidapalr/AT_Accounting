
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

interface AgreementRow extends RowDataPacket {
  id: number;
  status: string;
  funding_type: string;
}

interface VersionRow extends RowDataPacket {
  id: number;
  version_no: number;
  version_status: string;
  terms_json: string | Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validId(value: string): boolean {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function percentageUnits(value: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) return null;

  const units =
    Number(match[1]) * 10000 +
    Number((match[2] ?? "").padEnd(4, "0"));

  return units > 0 && units <= 1_000_000
    ? units
    : null;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function indiaDate(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function proposeProfitShareAmendmentAction(
  form: FormData
) {
  const user = await requireGroupOwner();

  const idText = field(form, "agreement_id");

  if (!validId(idText)) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(idText);
  const back = `/funding/agreements/${agreementId}`;

  const newPercentage = field(
    form,
    "profit_share_percentage"
  );

  const effectiveFrom = field(form, "effective_from");
  const reason = field(form, "amendment_reason");
  const evidenceReference = field(
    form,
    "evidence_reference"
  );

  const requestedUnits = percentageUnits(newPercentage);

  if (
    requestedUnits === null ||
    !validDate(effectiveFrom) ||
    effectiveFrom < indiaDate() ||
    reason.length < 10 ||
    reason.length > 1000 ||
    evidenceReference.length > 250
  ) {
    redirect(`${back}?shareAmendment=invalid`);
  }

  let outcome = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the legal business first so future
    // approval workflows can use a consistent
    // lock ordering.
    const [businesses] =
      await connection.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [user.legal_business_id]
      );

    if (businesses.length !== 1) {
      outcome = "not-found";
    } else {
      const [agreements] =
        await connection.execute<AgreementRow[]>(
          `SELECT id, status, funding_type
           FROM acct_funding_agreements
           WHERE id = ?
             AND legal_business_id = ?
           FOR UPDATE`,
          [agreementId, user.legal_business_id]
        );

      const agreement = agreements[0];

      if (!agreement) {
        outcome = "not-found";
      } else if (
        agreement.status !== "ACTIVE" ||
        agreement.funding_type !== "PROFIT_LINKED"
      ) {
        outcome = "not-eligible";
      } else {
        const [pending] =
          await connection.execute<RowDataPacket[]>(
            `SELECT id
             FROM acct_agreement_amendments
             WHERE legal_business_id = ?
               AND agreement_id = ?
               AND status = 'PENDING'
             LIMIT 1`,
            [user.legal_business_id, agreementId]
          );

        if (pending.length) {
          outcome = "pending";
        } else {
          // Restrict this first workflow to contracts
          // having only V1 as an approved version.
          // Superseded or later approved versions
          // will be handled by the date-effective
          // amendment engine in the next stage.
          const [approved] =
            await connection.execute<VersionRow[]>(
              `SELECT
                 id,
                 version_no,
                 version_status,
                 terms_json,
                 DATE_FORMAT(effective_from, '%Y-%m-%d')
                   AS effective_from,
                 DATE_FORMAT(effective_to, '%Y-%m-%d')
                   AS effective_to
               FROM acct_agreement_versions
               WHERE legal_business_id = ?
                 AND agreement_id = ?
                 AND version_status IN (
                   'APPROVED', 'SUPERSEDED'
                 )
               ORDER BY version_no DESC
               FOR UPDATE`,
              [user.legal_business_id, agreementId]
            );

          const current = approved[0];

          if (
            !current ||
            current.version_no !== 1 ||
            current.version_status !== "APPROVED"
          ) {
            outcome = "history-review";
          } else {
            const oldTerms = (
              typeof current.terms_json === "string"
                ? JSON.parse(current.terms_json)
                : current.terms_json
            ) as Record<string, unknown>;

            const oldShare = percentageUnits(
              String(oldTerms.profit_share_percentage ?? "")
            );

            if (
              oldShare === null ||
              oldShare === requestedUnits ||
              effectiveFrom <= current.effective_from ||
              (
                current.effective_to !== null &&
                effectiveFrom > current.effective_to
              )
            ) {
              outcome = "invalid-change";
            } else {
              const [latestRows] =
                await connection.execute<RowDataPacket[]>(
                  `SELECT COALESCE(MAX(version_no), 0)
                     AS latest_version
                   FROM acct_agreement_versions
                   WHERE legal_business_id = ?
                     AND agreement_id = ?`,
                  [user.legal_business_id, agreementId]
                );

              const nextVersion =
                Number(latestRows[0].latest_version) + 1;

              const newTerms = {
                ...oldTerms,
                profit_share_percentage: newPercentage,
                effective_from: effectiveFrom,
                effective_to: current.effective_to,
              };

              const [versionResult] =
                await connection.execute<ResultSetHeader>(
                  `INSERT INTO acct_agreement_versions
                   (
                     legal_business_id,
                     agreement_id,
                     version_no,
                     version_status,
                     effective_from,
                     effective_to,
                     terms_json,
                     change_reason,
                     created_by
                   )
                   VALUES (
                     ?, ?, ?, 'DRAFT',
                     ?, ?, ?, ?, ?
                   )`,
                  [
                    user.legal_business_id,
                    agreementId,
                    nextVersion,
                    effectiveFrom,
                    current.effective_to,
                    JSON.stringify(newTerms),
                    reason,
                    user.id,
                  ]
                );

              await connection.execute(
                `INSERT INTO acct_agreement_amendments
                 (
                   legal_business_id,
                   agreement_id,
                   from_version_id,
                   to_version_id,
                   amendment_reason,
                   status,
                   requested_by
                 )
                 VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
                [
                  user.legal_business_id,
                  agreementId,
                  current.id,
                  versionResult.insertId,
                  reason,
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
                  user.legal_business_id,
                  user.id,
                  "PROFIT_SHARE_AMENDMENT_PROPOSED",
                  "FUNDING_AGREEMENT",
                  agreementId,
                  JSON.stringify({
                    from_version_id: current.id,
                    to_version_id: versionResult.insertId,
                    previous_share_units: oldShare,
                    requested_share_units: requestedUnits,
                    effective_from: effectiveFrom,
                    evidence_reference:
                      evidenceReference || null,
                    amendment_reason: reason,
                    status: "PENDING",
                  }),
                ]
              );

              await connection.commit();
              outcome = "proposed";
            }
          }
        }
      }
    }

    if (outcome !== "proposed") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error(
      "Profit share amendment proposal failed:",
      error
    );
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "proposed") {
    revalidatePath(back);
    revalidatePath("/funding/agreements");
  }

  redirect(`${back}?shareAmendment=${outcome}`);
}
