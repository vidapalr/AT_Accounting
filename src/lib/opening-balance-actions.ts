
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireGroupOwner } from "@/lib/auth";
import { OPENING_ROW_COUNT } from "@/lib/opening-balance-constants";

const PAGE = "/accounting/opening-balances";

const MAX_PAISE = 999999999999999999n;

type FundingClass =
  | "REPAYABLE_LIABILITY"
  | "OTHER_EQUITY"
  | "OTHER_OBLIGATION";

type FundingDetail = {
  partyId: number;
  agreementId: number;
  reference: string;
  classification: FundingClass;
};

type OpeningLine = {
  accountId: number;
  divisionId: number | null;
  branchId: number | null;
  debit: bigint;
  credit: bigint;
  notes: string | null;
  funding: FundingDetail | null;
};

type InvestorBankOpening = {
  bankAccountId: number;
  amount: bigint;
};

interface AccountRow extends RowDataPacket {
  id: number;
  account_type: string;
  account_subtype: string;
  is_posting_account: number;
  requires_division: number;
  requires_branch: number;
  status: string;
}

function get(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseId(s: string): number | null {
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

function optionalId(s: string): number | null | undefined {
  if (s === "") return null;
  const n = parseId(s);
  return n === null ? undefined : n;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;

  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));

  return (
    x.getUTCFullYear() === y &&
    x.getUTCMonth() + 1 === m &&
    x.getUTCDate() === d
  );
}

function parseMoney(s: string): bigint | null {
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(s)) return null;

  const [whole, fraction = ""] = s.split(".");
  const n =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  return n <= MAX_PAISE ? n : null;
}

function parseSignedMoney(s: string): bigint | null {
  const negative = s.startsWith("-");
  const absolute = negative ? s.slice(1) : s;
  const amount = parseMoney(absolute);
  return amount === null
    ? null
    : negative ? -amount : amount;
}

function money(n: bigint): string {
  return (
    `${n / 100n}.` +
    String(n % 100n).padStart(2, "0")
  );
}

function signedMoney(n: bigint): string {
  const negative = n < 0n;
  const amount = negative ? -n : n;
  return `${negative ? "-" : ""}${amount / 100n}.` +
    String(amount % 100n).padStart(2, "0");
}

function parseInvestorBankBalances(
  form: FormData
): InvestorBankOpening[] | null {
  const rows: InvestorBankOpening[] = [];

  for (const [key, value] of form.entries()) {
    if (!key.startsWith("investor_bank_")) continue;

    const bankAccountId = parseId(
      key.slice("investor_bank_".length)
    );
    const rawAmount =
      typeof value === "string" ? value.trim() : "";
    const amount = parseSignedMoney(rawAmount);

    if (
      bankAccountId === null ||
      amount === null ||
      amount > MAX_PAISE ||
      amount < -MAX_PAISE
    ) {
      return null;
    }

    rows.push({ bankAccountId, amount });
  }

  return rows;
}

function parseLines(form: FormData): OpeningLine[] | null {
  const rows: OpeningLine[] = [];

  for (let i = 0; i < OPENING_ROW_COUNT; i++) {
    const p = `line_${i}_`;

    const account = get(form, p + "account");
    const division = get(form, p + "division");
    const branch = get(form, p + "branch");
    const debit = get(form, p + "debit");
    const credit = get(form, p + "credit");
    const notes = get(form, p + "notes");

    const party = get(form, p + "funding_party");
    const agreement = get(form, p + "funding_agreement");
    const reference = get(form, p + "funding_reference");
    const classification = get(
      form,
      p + "funding_classification"
    );

    const hasAmount = debit !== "" || credit !== "";

    if (
      !hasAmount &&
      !notes &&
      !party &&
      !agreement &&
      !reference &&
      !classification
    ) {
      // Allow a registered bank/cash account, or a
      // selected but unused general ledger row, to
      // remain blank without creating a zero-value line.
      continue;
    }

    const accountId = parseId(account);
    const divisionId = optionalId(division);
    const branchId = optionalId(branch);

    const dr = parseMoney(debit || "0");
    const cr = parseMoney(credit || "0");

    if (
      accountId === null ||
      divisionId === undefined ||
      branchId === undefined ||
      (branchId !== null && divisionId === null) ||
      dr === null ||
      cr === null ||
      !(
        (dr > 0n && cr === 0n) ||
        (cr > 0n && dr === 0n)
      ) ||
      notes.length > 500
    ) {
      return null;
    }

    let funding: FundingDetail | null = null;

    if (party || agreement || reference || classification) {
      const partyId = parseId(party);
      const agreementId = parseId(agreement);

      const allowed: FundingClass[] = [
        "REPAYABLE_LIABILITY",
        "OTHER_EQUITY",
        "OTHER_OBLIGATION",
      ];

      if (
        partyId === null ||
        agreementId === null ||
        reference.length < 2 ||
        reference.length > 100 ||
        !allowed.includes(classification as FundingClass)
      ) {
        return null;
      }

      funding = {
        partyId,
        agreementId,
        reference,
        classification: classification as FundingClass,
      };
    }

    rows.push({
      accountId,
      divisionId,
      branchId,
      debit: dr,
      credit: cr,
      notes: notes || null,
      funding,
    });
  }

  return rows.length ? rows : null;
}

export async function saveOpeningBalancesAction(
  form: FormData
) {
  const user = await requireGroupOwner();
  const businessId = user.legal_business_id;

  const openingDate = get(form, "opening_date");
  const description = get(form, "description");
  const lines = parseLines(form);
  const investorBankBalances = parseInvestorBankBalances(form);

  if (
    !validDate(openingDate) ||
    description.length < 10 ||
    description.length > 500 ||
    !lines ||
    !investorBankBalances
  ) {
    redirect(`${PAGE}?result=invalid`);
  }

  const totalDebit = lines.reduce(
    (n, l) => n + l.debit, 0n
  );
  const totalCredit = lines.reduce(
    (n, l) => n + l.credit, 0n
  );

  if (
    totalDebit > MAX_PAISE ||
    totalCredit > MAX_PAISE
  ) {
    redirect(`${PAGE}?result=amount-too-large`);
  }

  const conn = await db.getConnection();
  let outcome = "failed";

  try {
    await conn.beginTransaction();

    const [business] = await conn.execute<RowDataPacket[]>(
      `SELECT id
       FROM acct_legal_businesses
       WHERE id = ?
       FOR UPDATE`,
      [businessId]
    );

    if (business.length !== 1) {
      outcome = "not-found";
    } else {
      const [batches] = await conn.execute<RowDataPacket[]>(
        `SELECT id, status
         FROM acct_opening_balance_batches
         WHERE legal_business_id = ?
         FOR UPDATE`,
        [businessId]
      );

      const existing = batches[0];

      const [investorBanks] = await conn.execute<RowDataPacket[]>(
        `SELECT id
         FROM acct_bank_accounts
         WHERE legal_business_id = ?
           AND ownership_type = 'INVESTOR'`,
        [businessId]
      );
      const submittedInvestorBanks = new Set(
        investorBankBalances.map((line) => line.bankAccountId)
      );
      const registeredInvestorBanks = new Set(
        investorBanks.map((bank) => Number(bank.id))
      );
      const investorBalancesValid =
        submittedInvestorBanks.size === investorBankBalances.length &&
        submittedInvestorBanks.size === registeredInvestorBanks.size &&
        [...registeredInvestorBanks].every((id) =>
          submittedInvestorBanks.has(id)
        );

      if (!investorBalancesValid) {
        outcome = "invalid-account";
      } else if (existing && existing.status !== "DRAFT") {
        outcome = "already-posted";
      } else {
        const [years] = await conn.execute<RowDataPacket[]>(
          `SELECT id,
             DATE_FORMAT(starts_on,'%Y-%m-%d') starts_on,
             DATE_FORMAT(ends_on,'%Y-%m-%d') ends_on
           FROM acct_financial_years
           WHERE legal_business_id = ?
             AND starts_on <= ?
             AND ends_on >= ?`,
          [businessId, openingDate, openingDate]
        );

        const [periods] = await conn.execute<RowDataPacket[]>(
          `SELECT id,
             DATE_FORMAT(start_date,'%Y-%m-%d') start_date,
             DATE_FORMAT(end_date,'%Y-%m-%d') end_date
           FROM acct_accounting_periods
           WHERE legal_business_id = ?
             AND start_date <= ?
             AND end_date >= ?`,
          [businessId, openingDate, openingDate]
        );

        const matches = years.flatMap((fy) =>
          periods
            .filter(
              (p) =>
                p.start_date >= fy.starts_on &&
                p.end_date <= fy.ends_on
            )
            .map((p) => ({ fy, period: p }))
        );

        if (matches.length !== 1) {
          outcome = "period-mismatch";
        } else {
          const accountIds = [
            ...new Set(lines.map((l) => l.accountId)),
          ];

          const [accounts] = await conn.query<AccountRow[]>(
            `SELECT
               id, account_type, account_subtype,
               status, is_posting_account,
               requires_division, requires_branch
             FROM acct_chart_of_accounts
             WHERE legal_business_id = ?
               AND id IN (
                 ${accountIds.map(() => "?").join(",")}
               )`,
            [businessId, ...accountIds]
          );

          const accountMap = new Map<number, AccountRow>(
            accounts.map((a) => [Number(a.id), a])
          );

          const [banks] = await conn.execute<RowDataPacket[]>(
            `SELECT gl_account_id
             FROM acct_bank_accounts
             WHERE legal_business_id = ?
               AND ownership_type = 'BUSINESS'
               AND status = 'ACTIVE'
               AND verification_status = 'VERIFIED'
               AND gl_account_id IS NOT NULL`,
            [businessId]
          );

          const bankIds = new Set(
            banks.map((b) => Number(b.gl_account_id))
          );

          const [cashAccounts] =
            await conn.execute<RowDataPacket[]>(
              `SELECT gl_account_id, division_id, branch_id
               FROM acct_cash_accounts
               WHERE legal_business_id = ?
                 AND status = 'ACTIVE'`,
              [businessId]
            );

          const cashMap = new Map(
            cashAccounts.map((c) => [
              Number(c.gl_account_id),
              {
                division: c.division_id === null
                  ? null : Number(c.division_id),
                branch: c.branch_id === null
                  ? null : Number(c.branch_id),
              },
            ])
          );

          const [parties] =
            await conn.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_funding_parties
               WHERE legal_business_id = ?`,
              [businessId]
            );

          const partyIds = new Set(
            parties.map((p) => Number(p.id))
          );

          const [agreements] =
            await conn.execute<RowDataPacket[]>(
              `SELECT
                 id,
                 party_id,
                 division_id,
                 branch_id,
                 agreement_no,
                 funding_type,
                 status,
                 DATE_FORMAT(effective_from, '%Y-%m-%d')
                   AS effective_from,
                 DATE_FORMAT(effective_to, '%Y-%m-%d')
                   AS effective_to
               FROM acct_funding_agreements
               WHERE legal_business_id = ?`,
              [businessId]
            );

          const agreementMap = new Map(
            agreements.map((agreement) => [
              Number(agreement.id),
              agreement,
            ])
          );

          const [divisions] =
            await conn.execute<RowDataPacket[]>(
              `SELECT id
               FROM acct_divisions
               WHERE legal_business_id = ?`,
              [businessId]
            );

          const divisionIds = new Set(
            divisions.map((d) => Number(d.id))
          );

          const [branches] =
            await conn.execute<RowDataPacket[]>(
              `SELECT id, division_id
               FROM acct_branches
               WHERE legal_business_id = ?
                 AND status = 'ACTIVE'`,
              [businessId]
            );

          const branchMap = new Map(
            branches.map((b) => [
              Number(b.id),
              Number(b.division_id),
            ])
          );

          let valid = true;
          const uniquePhysicalAccounts = new Set<number>();
          const uniqueFunding = new Set<string>();

          for (const line of lines) {
            const a = accountMap.get(line.accountId);

            if (
              !a ||
              a.status !== "ACTIVE" ||
              Number(a.is_posting_account) !== 1 ||
              !["ASSET", "LIABILITY", "EQUITY"].includes(
                a.account_type
              ) ||
              (
                Number(a.requires_division) === 1 &&
                line.divisionId === null
              ) ||
              (
                Number(a.requires_branch) === 1 &&
                line.branchId === null
              )
            ) {
              valid = false;
              break;
            }

            if (
              line.divisionId !== null &&
              !divisionIds.has(line.divisionId)
            ) {
              valid = false;
              break;
            }

            if (
              line.branchId !== null &&
              branchMap.get(line.branchId) !== line.divisionId
            ) {
              valid = false;
              break;
            }

            const isBank =
              a.account_subtype === "BANK" ||
              bankIds.has(line.accountId);

            const isCash =
              a.account_subtype === "CASH" ||
              cashMap.has(line.accountId);

            // All BANK and CASH lines must correspond
            // to registered business-controlled accounts.
            if (isBank || isCash) {
              if (
                uniquePhysicalAccounts.has(line.accountId) ||
                line.funding !== null
              ) {
                valid = false;
                break;
              }

              uniquePhysicalAccounts.add(line.accountId);

              if (isBank && !bankIds.has(line.accountId)) {
                valid = false;
                break;
              }

              if (isCash) {
                const location = cashMap.get(line.accountId);

                if (
                  !location ||
                  location.division !== line.divisionId ||
                  location.branch !== line.branchId
                ) {
                  valid = false;
                  break;
                }
              }
            }

            if (line.funding) {
              const f = line.funding;
              const agreement = agreementMap.get(
                f.agreementId
              );

              if (
                !partyIds.has(f.partyId) ||
                !agreement ||
                Number(agreement.party_id) !== f.partyId ||
                agreement.status !== "ACTIVE" ||
                agreement.effective_from > openingDate ||
                (
                  agreement.effective_to !== null &&
                  agreement.effective_to < openingDate
                ) ||
                (
                  agreement.division_id === null
                    ? null
                    : Number(agreement.division_id)
                ) !== line.divisionId ||
                (
                  agreement.branch_id === null
                    ? null
                    : Number(agreement.branch_id)
                ) !== line.branchId ||
                line.credit <= 0n ||
                !["LIABILITY", "EQUITY"].includes(
                  a.account_type
                ) ||
                (
                  f.classification === "OTHER_EQUITY" &&
                  a.account_type !== "EQUITY"
                ) ||
                (
                  f.classification !== "OTHER_EQUITY" &&
                  a.account_type !== "LIABILITY"
                )
              ) {
                valid = false;
                break;
              }

              if (
                agreement.funding_type === "LOAN" &&
                f.classification !== "REPAYABLE_LIABILITY"
              ) {
                valid = false;
                break;
              }

              if (agreement.funding_type === "PROFIT_LINKED") {
                valid = false;
                break;
              }

              // Prevent the same funding relationship
              // being entered twice in one worksheet.
              const key = JSON.stringify([
                f.agreementId,
                line.divisionId,
                line.branchId,
              ]);

              if (uniqueFunding.has(key)) {
                valid = false;
                break;
              }

              uniqueFunding.add(key);
            } else if (
              a.account_type === "LIABILITY" &&
              a.account_subtype
                ?.toUpperCase()
                .includes("INVESTOR")
            ) {
              // Do not lose investor attribution on
              // clearly designated investor ledgers.
              valid = false;
              break;
            }
          }

          if (!valid) {
            outcome = "invalid-account";
          } else {
            let batchId: number;

            if (existing) {
              batchId = Number(existing.id);

              // Delete child funding details BEFORE lines.
              await conn.execute(
                `DELETE fd
                 FROM acct_opening_funding_details fd
                 JOIN acct_opening_balance_lines l
                   ON l.id = fd.opening_line_id
                  AND l.legal_business_id =
                      fd.legal_business_id
                 WHERE l.legal_business_id = ?
                   AND l.batch_id = ?`,
                [businessId, batchId]
              );

              await conn.execute(
                `DELETE FROM acct_opening_balance_lines
                 WHERE legal_business_id = ?
                   AND batch_id = ?`,
                [businessId, batchId]
              );

              await conn.execute(
                `DELETE FROM acct_opening_investor_bank_balances
                 WHERE legal_business_id = ?
                   AND batch_id = ?`,
                [businessId, batchId]
              );

              await conn.execute(
                `UPDATE acct_opening_balance_batches
                 SET opening_date = ?,
                     financial_year_id = ?,
                     accounting_period_id = ?,
                     description = ?,
                     updated_by = ?
                 WHERE id = ?
                   AND legal_business_id = ?
                   AND status = 'DRAFT'`,
                [
                  openingDate,
                  matches[0].fy.id,
                  matches[0].period.id,
                  description,
                  user.id,
                  batchId,
                  businessId,
                ]
              );
            } else {
              const [created] =
                await conn.execute<ResultSetHeader>(
                  `INSERT INTO acct_opening_balance_batches
                   (
                     legal_business_id,
                     opening_date,
                     financial_year_id,
                     accounting_period_id,
                     status,
                     description,
                     created_by,
                     updated_by
                   )
                   VALUES (?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
                  [
                    businessId,
                    openingDate,
                    matches[0].fy.id,
                    matches[0].period.id,
                    description,
                    user.id,
                    user.id,
                  ]
                );

              batchId = created.insertId;
            }

            for (const [index, line] of lines.entries()) {
              const [created] =
                await conn.execute<ResultSetHeader>(
                  `INSERT INTO acct_opening_balance_lines
                   (
                     legal_business_id, batch_id, line_no,
                     account_id, division_id, branch_id,
                     debit, credit, notes
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                  [
                    businessId,
                    batchId,
                    index + 1,
                    line.accountId,
                    line.divisionId,
                    line.branchId,
                    money(line.debit),
                    money(line.credit),
                    line.notes,
                  ]
                );

              if (line.funding) {
                await conn.execute(
                  `INSERT INTO acct_opening_funding_details
                   (
                     legal_business_id,
                     opening_line_id,
                     funding_party_id,
                     agreement_id,
                     funding_reference,
                     classification,
                     opening_amount,
                     remarks
                   )
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
                  [
                    businessId,
                    created.insertId,
                    line.funding.partyId,
                    line.funding.agreementId,
                    line.funding.reference,
                    line.funding.classification,
                    money(line.credit),
                    line.notes,
                  ]
                );
              }
            }

            for (const line of investorBankBalances) {
              await conn.execute(
                `INSERT INTO acct_opening_investor_bank_balances
                 (
                   legal_business_id,
                   batch_id,
                   bank_account_id,
                   opening_amount
                 )
                 VALUES (?, ?, ?, ?)`,
                [
                  businessId,
                  batchId,
                  line.bankAccountId,
                  signedMoney(line.amount),
                ]
              );
            }

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
                existing
                  ? "OPENING_BALANCES_DRAFT_UPDATED"
                  : "OPENING_BALANCES_DRAFT_CREATED",
                "OPENING_BALANCE",
                batchId,
                JSON.stringify({
                  opening_date: openingDate,
                  line_count: lines.length,
                  investor_bank_balance_count:
                    investorBankBalances.length,
                  funding_line_count: lines.filter(
                    (l) => l.funding !== null
                  ).length,
                  total_debit: money(totalDebit),
                  total_credit: money(totalCredit),
                  balanced: totalDebit === totalCredit,
                }),
              ]
            );

            await conn.commit();
            outcome = "saved";
          }
        }
      }
    }

    if (outcome !== "saved") {
      await conn.rollback();
    }
  } catch (error) {
    await conn.rollback().catch(() => {});
    console.error("Opening balance save failed", error);
    outcome = "failed";
  } finally {
    conn.release();
  }

  if (outcome === "saved") {
    revalidatePath(PAGE);
  }

  redirect(`${PAGE}?result=${outcome}`);
}
