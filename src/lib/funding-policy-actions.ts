
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

type AgreementRow = RowDataPacket & {
  id: number;
  status: string;
  funding_type: "LOAN" | "PROFIT_LINKED";
};

type VersionRow = RowDataPacket & {
  id: number;
  version_no: number;
  version_status: string;
  terms_json: string | Record<string, unknown>;
};

type PolicyRow = RowDataPacket & {
  id: number;
  policy_status: "DRAFT" | "CONFIRMED";
};

function read(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function validId(value: string) {
  return /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value));
}

function validMoney(value: string, allowZero = false) {
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) {
    return false;
  }
  const [whole, decimal = ""] = value.split(".");
  const cents = BigInt(whole) * BigInt(100) +
    BigInt(decimal.padEnd(2, "0"));
  return allowZero
    ? cents >= BigInt(0)
    : cents > BigInt(0);
}

function validPercentage(value: string) {
  return /^\d{1,3}(\.\d{1,4})?$/.test(value) &&
    Number(value) >= 0 &&
    Number(value) <= 100;
}

const fundingModels = [
  "FIXED",
  "FLEXIBLE_ADVANCE",
  "REVOLVING",
  "TERM_LOAN",
  "NO_INITIAL_FUNDING",
] as const;

const entitlementModels = [
  "NOT_APPLICABLE",
  "FIXED_CONTRACTUAL",
  "OUTSTANDING_DEPENDENT",
  "TIME_WEIGHTED",
  "MINIMUM_FUNDING",
] as const;

const lossModels = [
  "UNSPECIFIED",
  "NONE",
  "SAME_AS_PROFIT",
  "CUSTOM_PERCENTAGE",
  "CAPPED",
] as const;

const settlementModels = [
  "UNSPECIFIED",
  "NOT_APPLICABLE",
  "CARRY_FORWARD",
  "DEDUCT_FROM_RISK_BALANCE",
  "ADDITIONAL_CONTRIBUTION",
] as const;

const calculationOrders = [
  "UNSPECIFIED",
  "BEFORE_OTHER_ALLOCATIONS",
  "AFTER_BRANCH_ALLOCATIONS",
  "CONTRACT_DEFINED",
] as const;

export async function saveFundingPolicyAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const idText = read(form, "agreement_id");

  if (!validId(idText)) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(idText);
  const back = `/funding/agreements/${agreementId}`;

  const model = read(form, "funding_model");
  const maximum = read(form, "maximum_outstanding");
  const minimum = read(form, "minimum_funding");
  const additional = form.get("additional_funding_allowed") === "yes";
  const flexible = form.get("flexible_repayment_allowed") === "yes";

  const entitlement = read(form, "profit_entitlement_model");
  const zeroBalance = read(form, "entitlement_on_zero_balance");

  const lossModel = read(form, "loss_sharing_model");
  const lossRate = read(form, "loss_share_percentage");
  const lossCap = read(form, "maximum_loss_exposure");
  const settlement = read(form, "loss_settlement_method");
  const order = read(form, "profit_calculation_order");
  const notes = read(form, "policy_notes");

  const basicValid =
    fundingModels.includes(model as typeof fundingModels[number]) &&
    entitlementModels.includes(
      entitlement as typeof entitlementModels[number]
    ) &&
    lossModels.includes(lossModel as typeof lossModels[number]) &&
    settlementModels.includes(
      settlement as typeof settlementModels[number]
    ) &&
    calculationOrders.includes(
      order as typeof calculationOrders[number]
    ) &&
    ["YES", "NO", "NOT_APPLICABLE"].includes(zeroBalance) &&
    (maximum === "" || validMoney(maximum)) &&
    (minimum === "" || validMoney(minimum, true)) &&
    (lossRate === "" || validPercentage(lossRate)) &&
    (lossCap === "" || validMoney(lossCap, true)) &&
    notes.length <= 5000;

  if (!basicValid) {
    redirect(`${back}?policy=invalid`);
  }

  const needsMaximum = model === "REVOLVING";
  const needsMinimum = entitlement === "MINIMUM_FUNDING";
  const hasProfit = entitlement !== "NOT_APPLICABLE";
  const usesLossRate =
    lossModel === "CUSTOM_PERCENTAGE" ||
    lossModel === "CAPPED";

  if (
    (needsMaximum && !maximum) ||
    (needsMinimum && !minimum) ||
    (model === "NO_INITIAL_FUNDING" &&
      minimum !== "" && Number(minimum) > 0) ||
    (maximum && minimum && Number(minimum) > Number(maximum)) ||
    (model === "FIXED" && additional) ||
    (model === "TERM_LOAN" && flexible) ||
    (model === "REVOLVING" && (!additional || !flexible)) ||
    (model === "NO_INITIAL_FUNDING" && additional) ||
    (hasProfit && zeroBalance === "NOT_APPLICABLE") ||
    (!hasProfit && zeroBalance !== "NOT_APPLICABLE") ||
    (!usesLossRate && lossRate !== "") ||
    (usesLossRate && lossRate === "") ||
    (lossModel !== "CAPPED" && lossCap !== "") ||
    (lossModel === "CAPPED" && !lossCap) ||
    (lossModel === "NONE" && settlement !== "NOT_APPLICABLE") ||
    (lossModel === "UNSPECIFIED" &&
      settlement !== "UNSPECIFIED") ||
    (!["NONE", "UNSPECIFIED"].includes(lossModel) &&
      ["NOT_APPLICABLE", "UNSPECIFIED"].includes(settlement))
  ) {
    redirect(`${back}?policy=invalid`);
  }

  let result = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [agreements] =
      await connection.execute<AgreementRow[]>(
        `SELECT id, status, funding_type
         FROM acct_funding_agreements
         WHERE id = ? AND legal_business_id = ?
         FOR UPDATE`,
        [agreementId, user.legal_business_id]
      );

    const agreement = agreements[0];

    if (!agreement) {
      result = "not-found";
    } else if (agreement.status !== "DRAFT") {
      result = "not-draft";
    } else {
      const [versions] =
        await connection.execute<VersionRow[]>(
          `SELECT id, version_no, version_status, terms_json
           FROM acct_agreement_versions
           WHERE agreement_id = ?
             AND legal_business_id = ?
             AND version_no = 1
           FOR UPDATE`,
          [agreementId, user.legal_business_id]
        );

      const version = versions[0];

      const [amendments] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_agreement_amendments
           WHERE agreement_id = ?
             AND legal_business_id = ?
             AND status = 'PENDING'
           LIMIT 1`,
          [agreementId, user.legal_business_id]
        );

      if (!version || version.version_status !== "DRAFT") {
        result = "version-locked";
      } else if (amendments.length) {
        result = "pending-amendment";
      } else {
        const terms = (
          typeof version.terms_json === "string"
            ? JSON.parse(version.terms_json)
            : version.terms_json
        ) as Record<string, unknown>;

        const isLoan = agreement.funding_type === "LOAN";
        const expectedProfit = !isLoan;

        if (
          (isLoan && hasProfit) ||
          (expectedProfit && !hasProfit) ||
          (isLoan && lossModel !== "NONE" &&
            lossModel !== "UNSPECIFIED") ||
          (lossModel === "SAME_AS_PROFIT" &&
            Number(terms.profit_share_percentage ?? 0) <= 0)
        ) {
          result = "terms-conflict";
        } else {
          const [existing] =
            await connection.execute<PolicyRow[]>(
              `SELECT id, policy_status
               FROM acct_agreement_funding_policies
               WHERE agreement_version_id = ?
                 AND agreement_id = ?
                 AND legal_business_id = ?
               FOR UPDATE`,
              [version.id, agreementId, user.legal_business_id]
            );

          if (existing[0]?.policy_status === "CONFIRMED") {
            result = "confirmed";
          } else {
            const values = [
              model,
              maximum || null,
              minimum || null,
              additional ? 1 : 0,
              flexible ? 1 : 0,
              entitlement,
              zeroBalance === "NOT_APPLICABLE"
                ? null
                : zeroBalance === "YES" ? 1 : 0,
              lossModel,
              lossRate || null,
              lossCap || null,
              settlement,
              order,
              notes || null,
            ];

            if (existing.length) {
              await connection.execute(
                `UPDATE acct_agreement_funding_policies
                 SET funding_model = ?,
                     maximum_outstanding = ?,
                     minimum_funding = ?,
                     additional_funding_allowed = ?,
                     flexible_repayment_allowed = ?,
                     profit_entitlement_model = ?,
                     entitlement_on_zero_balance = ?,
                     loss_sharing_model = ?,
                     loss_share_percentage = ?,
                     maximum_loss_exposure = ?,
                     loss_settlement_method = ?,
                     profit_calculation_order = ?,
                     policy_notes = ?
                 WHERE id = ?
                   AND legal_business_id = ?
                   AND policy_status = 'DRAFT'`,
                [...values, existing[0].id, user.legal_business_id]
              );
            } else {
              await connection.execute<ResultSetHeader>(
                `INSERT INTO acct_agreement_funding_policies
                 (
                   legal_business_id,
                   agreement_id,
                   agreement_version_id,
                   policy_status,
                   funding_model,
                   maximum_outstanding,
                   minimum_funding,
                   additional_funding_allowed,
                   flexible_repayment_allowed,
                   profit_entitlement_model,
                   entitlement_on_zero_balance,
                   loss_sharing_model,
                   loss_share_percentage,
                   maximum_loss_exposure,
                   loss_settlement_method,
                   profit_calculation_order,
                   policy_notes,
                   created_by
                 )
                 VALUES (
                   ?, ?, ?, 'DRAFT',
                   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                 )`,
                [
                  user.legal_business_id,
                  agreementId,
                  version.id,
                  ...values,
                  user.id,
                ]
              );
            }

            await connection.execute(
              `INSERT INTO acct_audit_events
               (legal_business_id, actor_user_id,
                action, subject_type, subject_id, details_json)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [
                user.legal_business_id,
                user.id,
                existing.length
                  ? "FUNDING_POLICY_DRAFT_UPDATED"
                  : "FUNDING_POLICY_DRAFT_CREATED",
                "FUNDING_AGREEMENT",
                agreementId,
                JSON.stringify({
                  version_id: version.id,
                  policy_status: "DRAFT",
                  funding_model: model,
                }),
              ]
            );

            await connection.commit();
            result = "saved";
          }
        }
      }
    }

    if (result !== "saved") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Funding policy save failed:", error);
  } finally {
    connection.release();
  }

  if (result === "saved") {
    revalidatePath(back);
  }

  redirect(`${back}?policy=${result}`);
}

export async function confirmFundingPolicyAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const idText = read(form, "agreement_id");

  if (!validId(idText)) {
    redirect("/funding/agreements");
  }

  const agreementId = Number(idText);
  const back = `/funding/agreements/${agreementId}`;
  const evidence = read(form, "evidence_reference");

  if (
    evidence.length < 5 ||
    evidence.length > 250 ||
    form.get("confirmed") !== "yes"
  ) {
    redirect(`${back}?policy=confirm-invalid`);
  }

  let result = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [agreements] =
      await connection.execute<AgreementRow[]>(
        `SELECT id, status, funding_type
         FROM acct_funding_agreements
         WHERE id = ? AND legal_business_id = ?
         FOR UPDATE`,
        [agreementId, user.legal_business_id]
      );

    if (!agreements.length ||
        agreements[0].status !== "DRAFT") {
      result = "not-draft";
    } else {
      const [versions] =
        await connection.execute<VersionRow[]>(
          `SELECT id, version_no, version_status, terms_json
           FROM acct_agreement_versions
           WHERE agreement_id = ?
             AND legal_business_id = ?
             AND version_no = 1
           FOR UPDATE`,
          [agreementId, user.legal_business_id]
        );

      const version = versions[0];

      const [pending] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id FROM acct_agreement_amendments
           WHERE agreement_id = ?
             AND legal_business_id = ?
             AND status = 'PENDING'
           LIMIT 1`,
          [agreementId, user.legal_business_id]
        );

      if (!version || version.version_status !== "DRAFT") {
        result = "version-locked";
      } else if (pending.length) {
        result = "pending-amendment";
      } else {
        const [policies] =
          await connection.execute<PolicyRow[]>(
            `SELECT id, policy_status
             FROM acct_agreement_funding_policies
             WHERE agreement_version_id = ?
               AND agreement_id = ?
               AND legal_business_id = ?
             FOR UPDATE`,
            [version.id, agreementId, user.legal_business_id]
          );

        const policy = policies[0];

        if (!policy) {
          result = "missing";
        } else if (policy.policy_status !== "DRAFT") {
          result = "confirmed";
        } else {
          await connection.execute(
            `UPDATE acct_agreement_funding_policies
             SET policy_status = 'CONFIRMED'
             WHERE id = ?
               AND legal_business_id = ?
               AND policy_status = 'DRAFT'`,
            [policy.id, user.legal_business_id]
          );

          await connection.execute(
            `INSERT INTO acct_audit_events
             (legal_business_id, actor_user_id,
              action, subject_type, subject_id, details_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              user.legal_business_id,
              user.id,
              "FUNDING_POLICY_CONFIRMED",
              "FUNDING_AGREEMENT",
              agreementId,
              JSON.stringify({
                version_id: version.id,
                policy_id: policy.id,
                evidence_reference: evidence,
                confirmed_by: user.id,
              }),
            ]
          );

          await connection.commit();
          result = "confirmed-success";
        }
      }
    }

    if (result !== "confirmed-success") {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Funding policy confirmation failed:", error);
  } finally {
    connection.release();
  }

  if (result === "confirmed-success") {
    revalidatePath(back);
  }

  redirect(`${back}?policy=${result}`);
}
