
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  ResultSetHeader,
  RowDataPacket,
} from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";

const PAGE = "/accounting/investor-bank-scopes";

const PURPOSES = new Set([
  "FUNDING_RECEIPT",
  "REPAYMENT",
  "PROFIT_PAYOUT",
  "ALL",
]);

function field(form: FormData, name: string): string {
  const value = form.get(name);

  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed)
    ? parsed
    : null;
}

function optionalId(
  value: string
): number | null | undefined {
  if (value === "") return null;

  const parsed = parseId(value);

  return parsed === null ? undefined : parsed;
}

export async function createInvestorBankScopeAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const investorId = parseId(
    field(form, "funding_party_id")
  );

  const bankId = parseId(
    field(form, "bank_account_id")
  );

  const divisionId = optionalId(
    field(form, "division_id")
  );

  const branchId = optionalId(
    field(form, "branch_id")
  );

  const purpose = field(form, "purpose");

  if (
    investorId === null ||
    bankId === null ||
    divisionId === undefined ||
    branchId === undefined ||
    (branchId !== null && divisionId === null) ||
    !PURPOSES.has(purpose)
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    // Consistent lock order for business-level
    // configuration and accounting actions.
    const [business] =
      await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_legal_businesses
         WHERE id = ?
         FOR UPDATE`,
        [businessId]
      );

    if (business.length !== 1) {
      outcome = "business-not-found";
    } else {
      const [investors] =
        await conn.execute<RowDataPacket[]>(
          `SELECT id
           FROM acct_funding_parties
           WHERE id = ?
             AND legal_business_id = ?
           LIMIT 1`,
          [investorId, businessId]
        );

      if (investors.length !== 1) {
        outcome = "invalid-investor";
      } else {
        const [banks] =
          await conn.execute<RowDataPacket[]>(
            `SELECT
               id,
               ownership_type,
               funding_party_id,
               status
             FROM acct_bank_accounts
             WHERE id = ?
               AND legal_business_id = ?
             LIMIT 1`,
            [bankId, businessId]
          );

        const bank = banks[0];

        if (
          !bank ||
          bank.ownership_type !== "INVESTOR" ||
          Number(bank.funding_party_id) !== investorId ||
          bank.status !== "ACTIVE"
        ) {
          outcome = "invalid-bank";
        } else {
          let dimensionsValid = true;

          if (divisionId !== null) {
            const [divisions] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_divisions
                 WHERE id = ?
                   AND legal_business_id = ?
                 LIMIT 1`,
                [divisionId, businessId]
              );

            if (divisions.length !== 1) {
              dimensionsValid = false;
            }
          }

          if (
            dimensionsValid &&
            branchId !== null
          ) {
            const [branches] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_branches
                 WHERE id = ?
                   AND division_id = ?
                   AND legal_business_id = ?
                   AND status = 'ACTIVE'
                 LIMIT 1`,
                [branchId, divisionId, businessId]
              );

            if (branches.length !== 1) {
              dimensionsValid = false;
            }
          }

          if (!dimensionsValid) {
            outcome = "invalid-dimension";
          } else {
            // NULL-safe comparison is essential:
            // MariaDB UNIQUE indexes allow multiple
            // NULL values in Group/Division mappings.
            //
            // The business lock above serializes
            // mapping creation through this action.
            const [existing] =
              await conn.execute<RowDataPacket[]>(
                `SELECT id
                 FROM acct_investor_bank_scopes
                 WHERE legal_business_id = ?
                   AND funding_party_id = ?
                   AND bank_account_id = ?
                   AND division_id <=> ?
                   AND branch_id <=> ?
                 LIMIT 1
                 FOR UPDATE`,
                [
                  businessId,
                  investorId,
                  bankId,
                  divisionId,
                  branchId,
                ]
              );

            if (existing.length > 0) {
              outcome = "duplicate";
            } else {
              const [created] =
                await conn.execute<ResultSetHeader>(
                  `INSERT INTO acct_investor_bank_scopes
                   (
                     legal_business_id,
                     funding_party_id,
                     bank_account_id,
                     division_id,
                     branch_id,
                     purpose,
                     status,
                     created_by
                   )
                   VALUES (?, ?, ?, ?, ?, ?,
                           'ACTIVE', ?)`,
                  [
                    businessId,
                    investorId,
                    bankId,
                    divisionId,
                    branchId,
                    purpose,
                    user.id,
                  ]
                );

              await conn.execute(
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
                  "INVESTOR_BANK_SCOPE_CREATED",
                  "INVESTOR_BANK_SCOPE",
                  created.insertId,
                  JSON.stringify({
                    funding_party_id: investorId,
                    bank_account_id: bankId,
                    division_id: divisionId,
                    branch_id: branchId,
                    purpose,
                  }),
                ]
              );

              await conn.commit();
              outcome = "created";
            }
          }
        }
      }
    }

    if (outcome !== "created") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error(
      "Investor bank scope creation failed",
      error
    );
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "created") {
    revalidatePath(PAGE);
  }

  redirect(`${PAGE}?result=${outcome}`);
}
