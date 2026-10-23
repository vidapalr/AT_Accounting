
"use server";

import { revalidatePath } from "next/cache";
import { parseBasis } from "@/lib/investor-shares/engine";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { db } from "@/lib/db";
import { nextCode } from "@/lib/codes";
import { requireGroupOwner } from "@/lib/auth";

function read(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function validId(v: string) {
  return /^[1-9]\d*$/.test(v) &&
    Number.isSafeInteger(Number(v));
}

function validMoney(v: string) {
  return /^\d{1,16}(\.\d{1,2})?$/.test(v) &&
    BigInt(v.replace(".", "")) > BigInt(0);
}

function validRate(v: string) {
  return /^\d{1,3}(\.\d{1,4})?$/.test(v) &&
    Number(v) >= 0 && Number(v) <= 100;
}

function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === v;
}

export async function createFundingAgreementAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const agreementNo = await nextCode(db, { table: "acct_funding_agreements", column: "agreement_no", prefix: "AGR-", width: 4, where: "legal_business_id = ?", params: [businessId] });
  const partyText = read(form, "party_id");

  const scope = read(form, "funding_scope");
  const divisionText = read(form, "division_id");
  const branchText = read(form, "branch_id");

  const type = read(form, "funding_type");
  const amount = read(form, "committed_amount");
  const profitRate = read(form, "profit_share_percentage");
  const profitBasis = read(form, "profit_basis");
  const interestRate = read(form, "interest_rate_percentage");
  const interestMethod = read(form, "interest_method");

  const from = read(form, "effective_from");
  const to = read(form, "effective_to");
  const frequency = read(form, "payout_frequency");

  const repayment = read(
    form,
    "principal_repayment_terms"
  );
  const loss = read(form, "loss_sharing_terms");
  const notes = read(form, "agreement_notes");

  const frequencies = [
    "MONTHLY",
    "QUARTERLY",
    "HALF_YEARLY",
    "YEARLY",
    "ON_MATURITY",
    "CUSTOM",
  ];

  const scopeValid =
    scope === "GROUP"
      ? divisionText === "" && branchText === ""
      : scope === "DIVISION"
        ? validId(divisionText) && branchText === ""
        : scope === "BRANCH"
          ? validId(divisionText) && validId(branchText)
          : false;

  const isLoan = type === "LOAN";
  const isProfit = type === "PROFIT_LINKED";

  const termsValid = isLoan
    ? (
        profitRate === "" &&
        profitBasis === "" &&
        (interestRate === "" || validRate(interestRate)) &&
        (
          interestRate === "" ||
          Number(interestRate) === 0 ||
          ["SIMPLE", "REDUCING_BALANCE"].includes(
            interestMethod
          )
        ) &&
        loss === ""
      )
    : isProfit
      ? (
          validRate(profitRate) &&
          Number(profitRate) > 0 &&
          parseBasis(profitBasis).recognised &&
          profitBasis.length <= 100 &&
          interestRate === "" &&
          interestMethod === ""
        )
      : false;

  if (
    !/^[A-Z0-9][A-Z0-9/_-]{2,39}$/.test(agreementNo) ||
    !validId(partyText) ||
    !scopeValid ||
    !termsValid ||
    !validMoney(amount) ||
    !validDate(from) ||
    (to !== "" && (!validDate(to) || to < from)) ||
    !frequencies.includes(frequency) ||
    repayment.length > 10000 ||
    loss.length > 10000 ||
    notes.length > 10000
  ) {
    redirect("/funding/agreements?result=invalid");
  }

  const partyId = Number(partyText);
  const divisionId = divisionText
    ? Number(divisionText)
    : null;
  const branchId = branchText
    ? Number(branchText)
    : null;

  const normalizedProfitRate = isProfit
    ? profitRate
    : null;

  const normalizedProfitBasis = isProfit
    ? profitBasis
    : null;

  const normalizedInterestRate = isLoan
    ? interestRate || null
    : null;

  const normalizedInterestMethod =
    isLoan &&
    interestRate !== "" &&
    Number(interestRate) > 0
      ? interestMethod
      : "NONE";

  let outcome = "failed";
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [business] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      throw new Error("Business not found");
    }

    const [parties] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_funding_parties
       WHERE legal_business_id = ?
         AND id = ?
         AND status = 'ACTIVE'`,
      [businessId, partyId]
    );

    if (parties.length !== 1) {
      outcome = "invalid-party";
    }

    if (outcome === "failed" && divisionId !== null) {
      const [divisions] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_divisions
           WHERE legal_business_id = ?
             AND id = ?
             AND status = 'ACTIVE'`,
          [businessId, divisionId]
        );

      if (divisions.length !== 1) {
        outcome = "invalid-division";
      }
    }

    if (outcome === "failed" && branchId !== null) {
      const [branches] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_branches
           WHERE legal_business_id = ?
             AND division_id = ?
             AND id = ?
             AND status = 'ACTIVE'`,
          [businessId, divisionId, branchId]
        );

      if (branches.length !== 1) {
        outcome = "invalid-branch";
      }
    }

    if (outcome === "failed") {
      const [existing] =
        await connection.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_funding_agreements
           WHERE legal_business_id = ?
             AND agreement_no = ?
           LIMIT 1`,
          [businessId, agreementNo]
        );

      if (existing.length > 0) {
        outcome = "duplicate";
      }
    }

    if (outcome === "failed") {
      const [result] =
        await connection.execute<ResultSetHeader>(
          `INSERT INTO acct_funding_agreements
           (
             legal_business_id,
             division_id,
             branch_id,
             party_id,
             agreement_no,
             funding_type,
             committed_amount,
             profit_share_percentage,
             profit_basis,
             interest_rate_percentage,
             interest_method,
             effective_from,
             effective_to,
             payout_frequency,
             principal_repayment_terms,
             loss_sharing_terms,
             agreement_notes,
             status,
             created_by
           )
           VALUES (
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, 'DRAFT', ?
           )`,
          [
            businessId,
            divisionId,
            branchId,
            partyId,
            agreementNo,
            type,
            amount,
            normalizedProfitRate,
            normalizedProfitBasis,
            normalizedInterestRate,
            normalizedInterestMethod,
            from,
            to || null,
            frequency,
            repayment || null,
            isProfit ? loss || null : null,
            notes || null,
            user.id,
          ]
        );

      const agreementId = result.insertId;

      const initialTerms = {
        agreement_no: agreementNo,
        party_id: partyId,
        division_id: divisionId,
        branch_id: branchId,
        funding_scope: scope,
        funding_type: type,
        committed_amount: amount,
        profit_share_percentage: normalizedProfitRate,
        profit_basis: normalizedProfitBasis,
        interest_rate_percentage: normalizedInterestRate,
        interest_method: normalizedInterestMethod,
        effective_from: from,
        effective_to: to || null,
        payout_frequency: frequency,
        principal_repayment_terms: repayment || null,
        loss_sharing_terms: isProfit ? loss || null : null,
        agreement_notes: notes || null,
      };

      await connection.execute(
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
         VALUES (?, ?, 1, 'DRAFT', ?, ?, ?, ?, ?)`,
        [
          businessId,
          agreementId,
          from,
          to || null,
          JSON.stringify(initialTerms),
          "Initial agreement creation",
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
          businessId,
          user.id,
          "FUNDING_AGREEMENT_CREATED",
          "FUNDING_AGREEMENT",
          agreementId,
          JSON.stringify({
            agreement_no: agreementNo,
            party_id: partyId,
            division_id: divisionId,
            branch_id: branchId,
            funding_scope: scope,
            initial_version: 1,
          }),
        ]
      );

      await connection.commit();
      outcome = "created";
    } else {
      await connection.rollback();
    }
  } catch (error) {
    await connection.rollback();
    console.error("Funding agreement creation failed:", error);
  } finally {
    connection.release();
  }

  if (outcome === "created") {
    revalidatePath("/funding/agreements");
    revalidatePath("/funding");
  }

  redirect(`/funding/agreements?result=${outcome}`);
}
