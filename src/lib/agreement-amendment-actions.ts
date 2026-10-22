
"use server";

import { revalidatePath } from "next/cache";
import { parseBasis } from "@/lib/investor-shares/engine";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import type { AgreementTerms } from "@/lib/agreement-history";

type VersionRow = RowDataPacket & {
  id: number;
  version_no: number;
  version_status: string;
  terms_json: string | AgreementTerms;
};

type AgreementRow = RowDataPacket & {
  id: number;
  status: string;
};

function read(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function validMoney(v: string) {
  return (
    /^\d{1,16}(\.\d{1,2})?$/.test(v) &&
    /[1-9]/.test(v.replace(".", ""))
  );
}

function validRate(v: string) {
  return (
    /^\d{1,3}(\.\d{1,4})?$/.test(v) &&
    Number(v) >= 0 &&
    Number(v) <= 100
  );
}

function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return (
    !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === v
  );
}

export async function proposeAgreementAmendment(
  form: FormData
) {
  const user = await requireGroupOwner();

  const idText = read(form, "agreement_id");
  const agreementId = Number(idText);

  if (
    !/^[1-9]\d*$/.test(idText) ||
    !Number.isSafeInteger(agreementId)
  ) {
    redirect("/funding/agreements");
  }

  const back = `/funding/agreements/${agreementId}`;
  const reason = read(form, "change_reason");

  const amount = read(form, "committed_amount");
  const percentage = read(form, "return_percentage");
  const basis = read(form, "profit_basis");
  const interestMethod = read(form, "interest_method");
  const startDate = read(form, "effective_from");
  const endDate = read(form, "effective_to");
  const frequency = read(form, "payout_frequency");
  const repayment = read(form, "principal_repayment_terms");
  const loss = read(form, "loss_sharing_terms");
  const notes = read(form, "agreement_notes");

  const frequencies = [
    "MONTHLY", "QUARTERLY", "HALF_YEARLY",
    "YEARLY", "ON_MATURITY", "CUSTOM",
  ];

  if (
    reason.length < 10 ||
    reason.length > 1000 ||
    !validMoney(amount) ||
    !validRate(percentage) ||
    !validDate(startDate) ||
    (endDate !== "" &&
      (!validDate(endDate) || endDate < startDate)) ||
    !frequencies.includes(frequency) ||
    repayment.length > 10000 ||
    loss.length > 10000 ||
    notes.length > 10000
  ) {
    redirect(`${back}?result=invalid`);
  }

  let outcome = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Parent-row lock serializes changes to this agreement.
    const [agreements] =
      await connection.execute<AgreementRow[]>(
        `SELECT id, status
         FROM acct_funding_agreements
         WHERE id = ? AND legal_business_id = ?
         FOR UPDATE`,
        [agreementId, user.legal_business_id]
      );

    if (!agreements.length) {
      outcome = "not-found";
    } else if (agreements[0].status !== "DRAFT") {
      outcome = "not-draft";
    } else {
      const [pending] =
        await connection.execute<RowDataPacket[]>(
          `SELECT m.id
           FROM acct_agreement_amendments m
           WHERE m.agreement_id = ?
             AND m.legal_business_id = ?
             AND m.status = 'PENDING'
           LIMIT 1`,
          [agreementId, user.legal_business_id]
        );

      if (pending.length) {
        outcome = "pending";
      } else {
        const [versions] =
          await connection.execute<VersionRow[]>(
            `SELECT id, version_no, version_status,
                    terms_json
             FROM acct_agreement_versions
             WHERE agreement_id = ?
               AND legal_business_id = ?
             ORDER BY version_no DESC`,
            [agreementId, user.legal_business_id]
          );

        const latest = versions[0];

        if (!latest) {
          outcome = "no-version";
        } else {
          const previous = (
            typeof latest.terms_json === "string"
              ? JSON.parse(latest.terms_json)
              : latest.terms_json
          ) as AgreementTerms;

          const isLoan = previous.funding_type === "LOAN";

          if (
            (isLoan &&
              !["NONE", "SIMPLE", "REDUCING_BALANCE"]
                .includes(interestMethod)) ||
            (!isLoan &&
              (Number(percentage) <= 0 ||
               !parseBasis(basis).recognised ||
               basis.length > 100))
          ) {
            outcome = "invalid";
          } else {
            const nextTerms: AgreementTerms = {
              ...previous,
              committed_amount: amount,
              profit_share_percentage:
                isLoan ? null : percentage,
              profit_basis:
                isLoan ? null : basis,
              interest_rate_percentage:
                isLoan ? percentage : null,
              interest_method:
                isLoan && Number(percentage) > 0
                  ? interestMethod === "NONE"
                    ? "SIMPLE"
                    : interestMethod
                  : "NONE",
              effective_from: startDate,
              effective_to: endDate || null,
              payout_frequency: frequency,
              principal_repayment_terms:
                repayment || null,
              loss_sharing_terms:
                isLoan ? null : loss || null,
              agreement_notes: notes || null,
            };

            if (
              JSON.stringify(nextTerms) ===
              JSON.stringify(previous)
            ) {
              outcome = "no-change";
            } else {
              const [versionResult] =
                await connection.execute<ResultSetHeader>(
                  `INSERT INTO acct_agreement_versions
                   (legal_business_id, agreement_id,
                    version_no, version_status,
                    effective_from, effective_to,
                    terms_json, change_reason, created_by)
                   VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`,
                  [
                    user.legal_business_id,
                    agreementId,
                    latest.version_no + 1,
                    startDate,
                    endDate || null,
                    JSON.stringify(nextTerms),
                    reason,
                    user.id,
                  ]
                );

              await connection.execute(
                `INSERT INTO acct_agreement_amendments
                 (legal_business_id, agreement_id,
                  from_version_id, to_version_id,
                  amendment_reason, status, requested_by)
                 VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
                [
                  user.legal_business_id,
                  agreementId,
                  latest.id,
                  versionResult.insertId,
                  reason,
                  user.id,
                ]
              );

              await connection.execute(
                `INSERT INTO acct_audit_events
                 (legal_business_id, actor_user_id,
                  action, subject_type, subject_id,
                  details_json)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  user.legal_business_id,
                  user.id,
                  "AGREEMENT_AMENDMENT_PROPOSED",
                  "FUNDING_AGREEMENT",
                  agreementId,
                  JSON.stringify({
                    from_version: latest.version_no,
                    to_version: latest.version_no + 1,
                    version_id: versionResult.insertId,
                  }),
                ]
              );

              await connection.commit();
              outcome = "created";
            }
          }
        }
      }
    }

    if (outcome !== "created") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Amendment creation failed:", error);
    outcome = "failed";
  } finally {
    connection.release();
  }

  if (outcome === "created") {
    revalidatePath(back);
  }

  redirect(`${back}?result=${outcome}`);
}
