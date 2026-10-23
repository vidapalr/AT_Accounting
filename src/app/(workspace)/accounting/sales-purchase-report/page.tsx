import { Suspense } from "react";
import Link from "next/link";
import type { RowDataPacket } from "mysql2";

import { db } from "@/lib/db";
import { requireAccess } from "@/lib/auth";
import styles from "./sales-purchase-report.module.css";

type SearchParams = {
  year?: string;
  month?: string;
  division?: string;
  branch?: string;
  type?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

type FinancialYear = RowDataPacket & {
  id: number;
  starts_on: string;
  ends_on: string;
};

type Period = RowDataPacket & {
  id: number;
  period_name: string;
  start_date: string;
  end_date: string;
};

type Division = RowDataPacket & {
  id: number;
  name: string;
};

type Branch = RowDataPacket & {
  id: number;
  division_id: number;
  branch_name: string;
};

type DailyRow = RowDataPacket & {
  financial_year_id: number;
  period_id: number;
  event_date: string;
  sales_amount: string;
  purchase_amount: string;
  profit_amount: string;
  incomplete_sales: number;
  pending_amount: string;
  invoice_count: number;
};

type DetailRow = RowDataPacket & {
  id: number;
  event_date: string;
  invoice_no: string;
  transaction_type: "SALES" | "PURCHASE";
  sales_amount: string;
  purchase_amount: string;
  cogs_amount: string | null;
  pending_amount: string;
};

type OpeningRow = RowDataPacket & {
  category: "GROUP_BANK" | "CASH" | "INVESTOR_BANK";
  amount: string;
};

type MovementRow = RowDataPacket & {
  movement_date: string;
  category:
    | "GROUP_BANK"
    | "CASH"
    | "INVESTOR_BANK"
    | "INCOMPLETE"
    | "EXTERNAL";
  amount: string;
};

type FinancialSummary = {
  sales: number;
  purchases: number;
  profit: number;
  hasIncompleteProfit: boolean;
  pending: number;
  invoices: number;
};

type BalanceSnapshot = {
  groupBank: bigint;
  cash: bigint;
  investorBank: bigint;
  groupBankComplete: boolean;
  cashComplete: boolean;
  investorBankComplete: boolean;
};

const MONEY_FORMAT = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value: number): string {
  return `₹${MONEY_FORMAT.format(value)}`;
}

function paise(value: string | number): bigint {
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Invalid monetary amount: ${text}`);

  const sign = match[1] === "-" ? -1n : 1n;
  return sign * (
    BigInt(match[2]) * 100n +
    BigInt((match[3] ?? "").padEnd(2, "0"))
  );
}

function moneyFromPaise(value: bigint): string {
  const negative = value < 0n;
  const amount = negative ? -value : value;
  return `${negative ? "-" : ""}₹${(amount / 100n).toLocaleString(
    "en-IN"
  )}.${String(amount % 100n).padStart(2, "0")}`;
}

function positiveId(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function yearLabel(year: FinancialYear): string {
  const start = Number(year.starts_on.slice(0, 4));
  const end = Number(year.ends_on.slice(0, 4));
  return start === end
    ? String(start)
    : `${start}–${String(end).slice(-2)}`;
}

function periodBelongsToYear(
  period: Period,
  year: FinancialYear
): boolean {
  return (
    period.start_date >= year.starts_on &&
    period.end_date <= year.ends_on
  );
}

function emptySummary(): FinancialSummary {
  return {
    sales: 0,
    purchases: 0,
    profit: 0,
    hasIncompleteProfit: false,
    pending: 0,
    invoices: 0,
  };
}

function addSummary(
  summary: FinancialSummary,
  row: DailyRow
): FinancialSummary {
  return {
    sales: summary.sales + Number(row.sales_amount),
    purchases: summary.purchases + Number(row.purchase_amount),
    profit: summary.profit + Number(row.profit_amount),
    hasIncompleteProfit:
      summary.hasIncompleteProfit ||
      Number(row.incomplete_sales) > 0,
    pending: summary.pending + Number(row.pending_amount),
    invoices: summary.invoices + Number(row.invoice_count),
  };
}

function queryHref(
  current: SearchParams,
  changes: Partial<SearchParams>
): string {
  const values = { ...current, ...changes };
  const params = new URLSearchParams();

  for (const key of [
    "year",
    "month",
    "division",
    "branch",
    "type",
  ] as const) {
    const value = values[key];
    if (value) params.set(key, value);
  }

  const query = params.toString();
  return `/accounting/sales-purchase-report${query ? `?${query}` : ""}`;
}

function profitPercent(summary: FinancialSummary): string {
  if (summary.hasIncompleteProfit || summary.sales === 0) return "—";
  return `${((summary.profit / summary.sales) * 100).toFixed(2)}%`;
}

function profitAmount(summary: FinancialSummary): string {
  if (summary.sales === 0) return "—";
  return summary.hasIncompleteProfit
    ? "Incomplete"
    : money(summary.profit);
}

function closingBalance(
  snapshot: BalanceSnapshot | undefined,
  category: "groupBank" | "cash" | "investorBank"
): string {
  const completenessKey = {
    groupBank: "groupBankComplete",
    cash: "cashComplete",
    investorBank: "investorBankComplete",
  } as const;
  if (!snapshot || !snapshot[completenessKey[category]]) {
    return "Incomplete";
  }
  return moneyFromPaise(snapshot[category]);
}

function transactionSql(
  businessId: number,
  divisionId: number | null,
  branchId: number | null,
  type: string,
  year: FinancialYear | undefined,
  period: Period | undefined
) {
  const includeSales = type !== "PURCHASE";
  const includePurchases = type !== "SALES";

  const dateConditions: string[] = [];
  const params: Array<string | number> = [];

  if (period) {
    dateConditions.push("event_date BETWEEN ? AND ?");
    params.push(period.start_date, period.end_date);
  } else if (year) {
    dateConditions.push("event_date BETWEEN ? AND ?");
    params.push(year.starts_on, year.ends_on);
  }

  const salesConditions = [
    "s.legal_business_id = ?",
    "s.status = 'POSTED'",
  ];
  const salesParams: Array<string | number> = [businessId];
  if (divisionId !== null) {
    salesConditions.push("s.division_id = ?");
    salesParams.push(divisionId);
  }
  if (branchId !== null) {
    salesConditions.push("s.branch_id = ?");
    salesParams.push(branchId);
  }

  const purchaseConditions = [
    "h.legal_business_id = ?",
    "h.status = 'POSTED'",
  ];
  const purchaseParams: Array<string | number> = [businessId];
  if (divisionId !== null) {
    purchaseConditions.push("h.division_id = ?");
    purchaseParams.push(divisionId);
  }
  if (branchId !== null) {
    purchaseConditions.push("1 = 0");
  }

  const salesCte = includeSales
    ? `SELECT
         s.id,
         s.invoice_date AS event_date,
         s.invoice_no,
         'SALES' AS transaction_type,
         s.grand_total AS sales_amount,
         CAST(0 AS DECIMAL(18, 2)) AS purchase_amount,
         CASE
           WHEN COUNT(sl.id) = COUNT(sl.total_cost)
             THEN COALESCE(SUM(sl.total_cost), 0)
           ELSE NULL
         END AS cogs_amount,
         GREATEST(
           s.grand_total - COALESCE(pay.paid_amount, 0), 0
         ) AS pending_amount
       FROM acct_sales_headers s
       LEFT JOIN acct_sales_lines sl
         ON sl.legal_business_id = s.legal_business_id
        AND sl.division_id = s.division_id
        AND sl.sale_id = s.id
       LEFT JOIN (
         SELECT
           legal_business_id,
           division_id,
           sale_id,
           SUM(amount) AS paid_amount
         FROM acct_sales_payments
         WHERE status = 'RECORDED'
         GROUP BY legal_business_id, division_id, sale_id
       ) pay
         ON pay.legal_business_id = s.legal_business_id
        AND pay.division_id = s.division_id
        AND pay.sale_id = s.id
       WHERE ${salesConditions.join(" AND ")}
       GROUP BY
         s.id, s.invoice_date, s.invoice_no, s.grand_total,
         pay.paid_amount`
    : "";

  const purchaseCte = includePurchases
    ? `SELECT
         h.id,
         h.invoice_date AS event_date,
         COALESCE(
           NULLIF(h.supplier_invoice_no, ''),
           h.purchase_no
         ) AS invoice_no,
         'PURCHASE' AS transaction_type,
         CAST(0 AS DECIMAL(18, 2)) AS sales_amount,
         COALESCE(SUM(pl.line_amount), 0) AS purchase_amount,
         NULL AS cogs_amount,
         GREATEST(
           COALESCE(SUM(pl.line_amount), 0) -
             COALESCE(pay.paid_amount, 0),
           0
         ) AS pending_amount
       FROM acct_purchase_headers h
       LEFT JOIN acct_purchase_lines pl
         ON pl.legal_business_id = h.legal_business_id
        AND pl.division_id = h.division_id
        AND pl.purchase_id = h.id
       LEFT JOIN (
         SELECT
           legal_business_id,
           division_id,
           purchase_id,
           SUM(amount) AS paid_amount
         FROM acct_purchase_payments
         WHERE status = 'VERIFIED'
         GROUP BY legal_business_id, division_id, purchase_id
       ) pay
         ON pay.legal_business_id = h.legal_business_id
        AND pay.division_id = h.division_id
        AND pay.purchase_id = h.id
       WHERE ${purchaseConditions.join(" AND ")}
       GROUP BY
         h.id, h.invoice_date, h.supplier_invoice_no,
         h.purchase_no, pay.paid_amount`
    : "";

  const parts = [
    `WITH transaction_rows AS (
       ${[salesCte, purchaseCte].filter(Boolean).join("\nUNION ALL\n")}
     )`,
  ];

  return {
    cte: parts.join("\n"),
    where: dateConditions.length
      ? `WHERE ${dateConditions.join(" AND ")}`
      : "",
    params: [
      ...(includeSales ? salesParams : []),
      ...(includePurchases ? purchaseParams : []),
      ...params,
    ],
  };
}

async function getAccountSnapshots(
  businessId: number,
  maxDate: string,
  reportDates: string[]
): Promise<Map<string, BalanceSnapshot>> {
  const snapshots = new Map<string, BalanceSnapshot>();
  if (reportDates.length === 0) return snapshots;

  const [openingRows] = await db.execute<OpeningRow[]>(
    `SELECT category, CAST(SUM(amount) AS CHAR) AS amount
     FROM (
       SELECT
         CASE
           WHEN b.ownership_type = 'INVESTOR'
             THEN 'INVESTOR_BANK'
           ELSE 'GROUP_BANK'
         END AS category,
         (l.debit - l.credit) AS amount
       FROM acct_journal_entries j
       JOIN acct_journal_lines l
         ON l.legal_business_id = j.legal_business_id
        AND l.journal_entry_id = j.id
       JOIN acct_bank_accounts b
         ON b.legal_business_id = l.legal_business_id
        AND b.gl_account_id = l.account_id
       WHERE j.legal_business_id = ?
         AND j.source_type = 'OPENING_BALANCE'
         AND j.status = 'POSTED'
         AND j.entry_date <= ?

       UNION ALL

       SELECT
         'CASH' AS category,
         (l.debit - l.credit) AS amount
       FROM acct_journal_entries j
       JOIN acct_journal_lines l
         ON l.legal_business_id = j.legal_business_id
        AND l.journal_entry_id = j.id
       JOIN acct_cash_accounts c
         ON c.legal_business_id = l.legal_business_id
        AND c.gl_account_id = l.account_id
       WHERE j.legal_business_id = ?
         AND j.source_type = 'OPENING_BALANCE'
         AND j.status = 'POSTED'
         AND j.entry_date <= ?

       UNION ALL

       SELECT
         'INVESTOR_BANK' AS category,
         x.opening_amount AS amount
       FROM acct_opening_investor_bank_balances x
       JOIN acct_opening_balance_batches ob
         ON ob.legal_business_id = x.legal_business_id
        AND ob.id = x.batch_id
       JOIN acct_journal_entries j
         ON j.legal_business_id = ob.legal_business_id
        AND j.source_type = 'OPENING_BALANCE'
        AND j.source_id = ob.id
        AND j.status = 'POSTED'
       JOIN acct_bank_accounts b
         ON b.legal_business_id = x.legal_business_id
        AND b.id = x.bank_account_id
        AND b.ownership_type = 'INVESTOR'
       WHERE x.legal_business_id = ?
         AND ob.status = 'POSTED'
         AND ob.opening_date <= ?
     ) opening
     GROUP BY category`,
    [
      businessId, maxDate,
      businessId, maxDate,
      businessId, maxDate,
    ]
  );

  const [openingDates] = await db.execute<RowDataPacket[]>(
    `SELECT DATE_FORMAT(
              MIN(entry_date), '%Y-%m-%d'
            ) AS opening_date
     FROM acct_journal_entries
     WHERE legal_business_id = ?
       AND source_type = 'OPENING_BALANCE'
       AND status = 'POSTED'
       AND entry_date <= ?`,
    [businessId, maxDate]
  );
  const openingDate = openingDates[0]?.opening_date as
    string | null | undefined;
  const [investorBankRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       COUNT(b.id) AS total,
       COUNT(x.bank_account_id) AS captured
     FROM acct_bank_accounts b
     LEFT JOIN acct_opening_balance_batches ob
       ON ob.legal_business_id = b.legal_business_id
      AND ob.status = 'POSTED'
      AND ob.opening_date <= ?
     LEFT JOIN acct_journal_entries j
       ON j.legal_business_id = ob.legal_business_id
      AND j.source_type = 'OPENING_BALANCE'
      AND j.source_id = ob.id
      AND j.status = 'POSTED'
     LEFT JOIN acct_opening_investor_bank_balances x
       ON x.legal_business_id = b.legal_business_id
      AND x.batch_id = ob.id
      AND x.bank_account_id = b.id
      AND j.id IS NOT NULL
     WHERE b.legal_business_id = ?
       AND b.ownership_type = 'INVESTOR'`,
    [maxDate, businessId]
  );
  const investorBankOpeningUnknown =
    Number(investorBankRows[0]?.total ?? 0) >
    Number(investorBankRows[0]?.captured ?? 0);
  const [unmappedAccountRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       (
         SELECT COUNT(*)
         FROM acct_bank_accounts
         WHERE legal_business_id = ?
           AND ownership_type = 'BUSINESS'
           AND gl_account_id IS NULL
       ) AS unmapped_group_banks,
       (
         SELECT COUNT(*)
         FROM acct_cash_accounts
         WHERE legal_business_id = ?
           AND gl_account_id IS NULL
       ) AS unmapped_cash_accounts`,
    [businessId, businessId]
  );
  const groupBankOpeningUnknown =
    Number(unmappedAccountRows[0]?.unmapped_group_banks ?? 0) > 0;
  const cashOpeningUnknown =
    Number(unmappedAccountRows[0]?.unmapped_cash_accounts ?? 0) > 0;

  const balances = {
    GROUP_BANK: 0n,
    CASH: 0n,
    INVESTOR_BANK: 0n,
  };
  for (const row of openingRows) {
    balances[row.category] += paise(row.amount);
  }

  const [movementRows] = openingDate
    ? await db.execute<MovementRow[]>(
        `SELECT
           movement_date,
           category,
           CAST(SUM(amount) AS CHAR) AS amount
         FROM (
           SELECT
             sp.payment_date AS movement_date,
             CASE
               WHEN ba.id IS NOT NULL
                 AND sp.cash_account_id IS NULL
                 AND ba.ownership_type = 'INVESTOR'
                 THEN 'INVESTOR_BANK'
               WHEN ba.id IS NOT NULL
                 AND sp.cash_account_id IS NULL
                 THEN 'GROUP_BANK'
               WHEN ca.id IS NOT NULL
                 AND sp.bank_account_id IS NULL
                 THEN 'CASH'
               ELSE 'INCOMPLETE'
             END AS category,
             sp.amount AS amount
           FROM acct_sales_payments sp
           JOIN acct_sales_headers sh
             ON sh.legal_business_id = sp.legal_business_id
            AND sh.division_id = sp.division_id
            AND sh.id = sp.sale_id
           LEFT JOIN acct_bank_accounts ba
             ON ba.legal_business_id = sp.legal_business_id
            AND ba.id = sp.bank_account_id
           LEFT JOIN acct_cash_accounts ca
             ON ca.legal_business_id = sp.legal_business_id
            AND ca.id = sp.cash_account_id
           WHERE sp.legal_business_id = ?
             AND sp.status = 'RECORDED'
             AND sh.status = 'POSTED'
             AND sp.payment_date > ?
             AND sp.payment_date <= ?

           UNION ALL

           SELECT
             pp.payment_date,
             CASE
               WHEN pp.payment_source = 'INVESTOR_BANK'
                 AND ba.id IS NOT NULL
                 THEN 'INVESTOR_BANK'
               WHEN pp.payment_source = 'BUSINESS_BANK'
                 AND ba.id IS NOT NULL
                 THEN 'GROUP_BANK'
               WHEN pp.payment_source = 'BUSINESS_CASH'
                 AND ca.id IS NOT NULL
                 THEN 'CASH'
               WHEN pp.payment_source IN (
                 'BUSINESS_BANK', 'INVESTOR_BANK',
                 'BUSINESS_CASH'
               )
                 THEN 'INCOMPLETE'
               WHEN pp.payment_source IN (
                 'INVESTOR_CASH', 'OWNER_PERSONAL'
               )
                 THEN 'EXTERNAL'
               ELSE 'INCOMPLETE'
             END,
             -pp.amount
           FROM acct_purchase_payments pp
           JOIN acct_purchase_headers ph
             ON ph.legal_business_id = pp.legal_business_id
            AND ph.division_id = pp.division_id
            AND ph.id = pp.purchase_id
           LEFT JOIN acct_bank_accounts ba
             ON ba.legal_business_id = pp.legal_business_id
            AND ba.id = pp.source_bank_account_id
           LEFT JOIN acct_cash_accounts ca
             ON ca.legal_business_id = pp.legal_business_id
            AND ca.id = pp.source_cash_account_id
           WHERE pp.legal_business_id = ?
             AND pp.status = 'VERIFIED'
             AND ph.status = 'POSTED'
             AND pp.payment_date > ?
             AND pp.payment_date <= ?

           UNION ALL

           SELECT
             ep.payment_date,
             CASE
               WHEN ep.payment_source = 'INVESTOR_BANK'
                 AND ba.id IS NOT NULL
                 THEN 'INVESTOR_BANK'
               WHEN ep.payment_source = 'BUSINESS_BANK'
                 AND ba.id IS NOT NULL
                 THEN 'GROUP_BANK'
               WHEN ep.payment_source = 'BUSINESS_CASH'
                 AND ca.id IS NOT NULL
                 THEN 'CASH'
               WHEN ep.payment_source IN (
                 'BUSINESS_BANK', 'INVESTOR_BANK',
                 'BUSINESS_CASH'
               )
                 THEN 'INCOMPLETE'
               WHEN ep.payment_source IN (
                 'INVESTOR_CASH', 'OWNER_PERSONAL'
               )
                 THEN 'EXTERNAL'
               ELSE 'INCOMPLETE'
             END,
             -ep.amount
           FROM acct_expense_payments ep
           JOIN acct_expenses e
             ON e.legal_business_id = ep.legal_business_id
            AND e.id = ep.expense_id
           LEFT JOIN acct_bank_accounts ba
             ON ba.legal_business_id = ep.legal_business_id
            AND ba.id = ep.bank_account_id
           LEFT JOIN acct_cash_accounts ca
             ON ca.legal_business_id = ep.legal_business_id
            AND ca.id = ep.cash_account_id
           WHERE ep.legal_business_id = ?
             AND ep.status = 'RECORDED'
             AND e.status = 'CONFIRMED'
             AND ep.payment_date > ?
             AND ep.payment_date <= ?

           UNION ALL

           SELECT
             t.transaction_date,
             CASE
               WHEN t.payment_source = 'INVESTOR_BANK'
                 AND ba.id IS NOT NULL
                 THEN 'INVESTOR_BANK'
               WHEN t.payment_source = 'BUSINESS_BANK'
                 AND ba.id IS NOT NULL
                 THEN 'GROUP_BANK'
               WHEN t.payment_source = 'BUSINESS_CASH'
                 AND ca.id IS NOT NULL
                 THEN 'CASH'
               WHEN t.payment_source IN (
                 'BUSINESS_BANK', 'INVESTOR_BANK',
                 'BUSINESS_CASH'
               )
                 THEN 'INCOMPLETE'
               WHEN t.payment_source IN (
                 'INVESTOR_CASH', 'OWNER_PERSONAL'
               )
                 THEN 'EXTERNAL'
               ELSE 'INCOMPLETE'
             END,
             CASE
               WHEN t.transaction_type = 'ADVANCE_PAID'
                 THEN -t.amount
               ELSE t.amount
             END
           FROM acct_advance_transactions t
           LEFT JOIN acct_bank_accounts ba
             ON ba.legal_business_id = t.legal_business_id
            AND ba.id = t.bank_account_id
           LEFT JOIN acct_cash_accounts ca
             ON ca.legal_business_id = t.legal_business_id
            AND ca.id = t.cash_account_id
           WHERE t.legal_business_id = ?
             AND t.status = 'CONFIRMED'
             AND t.transaction_type IN (
               'ADVANCE_PAID', 'REFUND_RECEIVED'
             )
             AND t.transaction_date > ?
             AND t.transaction_date <= ?

           UNION ALL

           SELECT
             ft.transaction_date,
             CASE
               WHEN ft.transaction_type = 'FUNDING_RECEIVED'
                 AND ba.id IS NOT NULL
                 AND ca.id IS NULL
                 THEN CASE
                   WHEN ba.ownership_type = 'INVESTOR'
                     THEN 'INVESTOR_BANK'
                   ELSE 'GROUP_BANK'
                 END
               WHEN ft.transaction_type = 'FUNDING_RECEIVED'
                 AND ca.id IS NOT NULL
                 AND ba.id IS NULL
                 THEN 'CASH'
               ELSE 'INCOMPLETE'
             END,
             CASE
               WHEN ft.transaction_type = 'FUNDING_RECEIVED'
                 THEN ft.amount
               ELSE -ft.amount
             END
           FROM acct_funding_transactions ft
           LEFT JOIN acct_bank_accounts ba
             ON ba.legal_business_id = ft.legal_business_id
            AND ba.id = ft.bank_account_id
           LEFT JOIN acct_cash_accounts ca
             ON ca.legal_business_id = ft.legal_business_id
            AND ca.id = ft.cash_account_id
           WHERE ft.legal_business_id = ?
             AND ft.status = 'VERIFIED'
             AND ft.transaction_date > ?
             AND ft.transaction_date <= ?
         ) account_movements
         GROUP BY movement_date, category
         ORDER BY movement_date`,
        [
          businessId, openingDate, maxDate,
          businessId, openingDate, maxDate,
          businessId, openingDate, maxDate,
          businessId, openingDate, maxDate,
          businessId, openingDate, maxDate,
        ]
      )
    : [[] as MovementRow[]];

  const movements = [...movementRows];
  let movementIndex = 0;
  let incomplete = false;
  const orderedDates = [...new Set(reportDates)].sort();

  for (const date of orderedDates) {
    if (!openingDate || date < openingDate) {
      snapshots.set(date, {
        groupBank: 0n,
        cash: 0n,
        investorBank: 0n,
        groupBankComplete: false,
        cashComplete: false,
        investorBankComplete: false,
      });
      continue;
    }

    while (
      movementIndex < movements.length &&
      movements[movementIndex].movement_date <= date
    ) {
      const movement = movements[movementIndex];
      if (movement.category === "INCOMPLETE") {
        incomplete = true;
      } else if (movement.category !== "EXTERNAL") {
        balances[movement.category] += paise(movement.amount);
      }
      movementIndex += 1;
    }

    snapshots.set(date, {
      groupBank: balances.GROUP_BANK,
      cash: balances.CASH,
      investorBank: balances.INVESTOR_BANK,
      groupBankComplete: !incomplete && !groupBankOpeningUnknown,
      cashComplete: !incomplete && !cashOpeningUnknown,
      investorBankComplete:
        !incomplete && !investorBankOpeningUnknown,
    });
  }

  return snapshots;
}

async function ReportContent({ searchParams }: Props) {
  const user = await requireAccess("reports");
  const businessId = user.legal_business_id;
  const query = await searchParams;

  const [
    [businessRows],
    [years],
    [periods],
    [divisions],
    [branches],
  ] = await Promise.all([
    db.execute<RowDataPacket[]>(
      `SELECT COALESCE(trading_name, legal_name) AS group_name
       FROM acct_legal_businesses
       WHERE id = ?`,
      [businessId]
    ),
    db.execute<FinancialYear[]>(
      `SELECT
         id,
         DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on,
         DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on
       FROM acct_financial_years
       WHERE legal_business_id = ?
       ORDER BY starts_on DESC`,
      [businessId]
    ),
    db.execute<Period[]>(
      `SELECT
         id,
         period_name,
         DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
         DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date
       FROM acct_accounting_periods
       WHERE legal_business_id = ?
       ORDER BY start_date`,
      [businessId]
    ),
    db.execute<Division[]>(
      `SELECT id, name
       FROM acct_divisions
       WHERE legal_business_id = ?
       ORDER BY name`,
      [businessId]
    ),
    db.execute<Branch[]>(
      `SELECT id, division_id, branch_name
       FROM acct_branches
       WHERE legal_business_id = ?
       ORDER BY branch_name`,
      [businessId]
    ),
  ]);

  const yearId = positiveId(query.year);
  const year = years.find((item) => Number(item.id) === yearId);
  const periodId = positiveId(query.month);
  const period = periods.find(
    (item) =>
      Number(item.id) === periodId &&
      year !== undefined &&
      periodBelongsToYear(item, year)
  );
  const divisionId = positiveId(query.division);
  const division = divisions.find(
    (item) => Number(item.id) === divisionId
  );
  const requestedBranchId = positiveId(query.branch);
  const branch = branches.find(
    (item) =>
      Number(item.id) === requestedBranchId &&
      (!division || Number(item.division_id) === Number(division.id))
  );
  const type = ["SALES", "PURCHASE"].includes(query.type ?? "")
    ? query.type!
    : "ALL";

  const reportPeriod = period ?? year;
  const sql = transactionSql(
    businessId,
    division ? Number(division.id) : null,
    branch ? Number(branch.id) : null,
    type,
    year,
    period
  );

  const [dailyRows] = await db.execute<DailyRow[]>(
    `${sql.cte}
     , event_periods AS (
       SELECT
         tr.*,
         fy.id AS financial_year_id,
         ap.id AS period_id
       FROM transaction_rows tr
       JOIN acct_financial_years fy
         ON tr.event_date BETWEEN fy.starts_on AND fy.ends_on
       JOIN acct_accounting_periods ap
         ON ap.legal_business_id = fy.legal_business_id
        AND tr.event_date BETWEEN ap.start_date AND ap.end_date
     )
     SELECT
       financial_year_id,
       period_id,
       DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
       CAST(SUM(sales_amount) AS CHAR) AS sales_amount,
       CAST(SUM(purchase_amount) AS CHAR) AS purchase_amount,
       CAST(SUM(
         CASE
           WHEN cogs_amount IS NULL THEN 0
           ELSE sales_amount - cogs_amount
         END
       ) AS CHAR) AS profit_amount,
       SUM(cogs_amount IS NULL AND transaction_type = 'SALES')
         AS incomplete_sales,
       CAST(SUM(pending_amount) AS CHAR) AS pending_amount,
       COUNT(*) AS invoice_count
     FROM event_periods
     ${sql.where}
     GROUP BY financial_year_id, period_id, event_date
     ORDER BY event_date`,
    sql.params
  );

  let detailRows: DetailRow[] = [];
  if (period) {
    const [details] = await db.execute<DetailRow[]>(
      `${sql.cte}
       SELECT
         id,
         DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
         invoice_no,
         transaction_type,
         CAST(sales_amount AS CHAR) AS sales_amount,
         CAST(purchase_amount AS CHAR) AS purchase_amount,
         CAST(cogs_amount AS CHAR) AS cogs_amount,
         CAST(pending_amount AS CHAR) AS pending_amount
       FROM transaction_rows
       ${sql.where}
       ORDER BY event_date, transaction_type, invoice_no`,
      sql.params
    );
    detailRows = details;
  }

  const latestYearEnd = years.reduce(
    (latest, item) =>
      item.ends_on > latest ? item.ends_on : latest,
    ""
  );
  const maxSnapshotDate =
    reportPeriod?.ends_on ?? latestYearEnd;
  const snapshotDates = [
    ...dailyRows.map((row) => row.event_date),
    ...periods
      .filter((item) =>
        period
          ? Number(item.id) === Number(period.id)
          : !year ||
              periodBelongsToYear(item, year)
      )
      .map((item) => item.end_date),
    ...years
      .filter((item) => !period && (!year || Number(item.id) === Number(year.id)))
      .map((item) => item.ends_on),
  ];
  const snapshots = maxSnapshotDate
    ? await getAccountSnapshots(
        businessId,
        maxSnapshotDate,
        snapshotDates
      )
    : new Map<string, BalanceSnapshot>();

  const yearSummaries = new Map<number, FinancialSummary>();
  const periodSummaries = new Map<number, FinancialSummary>();
  const dailySummaries = new Map<string, FinancialSummary>();
  for (const row of dailyRows) {
    const yearKey = Number(row.financial_year_id);
    const periodKey = Number(row.period_id);
    yearSummaries.set(
      yearKey,
      addSummary(yearSummaries.get(yearKey) ?? emptySummary(), row)
    );
    periodSummaries.set(
      periodKey,
      addSummary(periodSummaries.get(periodKey) ?? emptySummary(), row)
    );
    dailySummaries.set(row.event_date, addSummary(emptySummary(), row));
  }

  const detailsByDate = new Map<string, DetailRow[]>();
  for (const item of detailRows) {
    const entries = detailsByDate.get(item.event_date) ?? [];
    entries.push(item);
    detailsByDate.set(item.event_date, entries);
  }

  const snapshotForEndDate = (
    endDate: string
  ): BalanceSnapshot | undefined => {
    return snapshots.get(endDate);
  };

  const makeYearHref = (item: FinancialYear) =>
    queryHref(query, { year: String(item.id), month: undefined });
  const makePeriodHref = (item: Period, year: FinancialYear) =>
    queryHref(query, {
      year: String(year.id),
      month: String(item.id),
    });

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Accounting report</p>
          <h1>Sales, Purchase & Daily Profit</h1>
          <p>
            Review posted sales and purchases by financial year,
            accounting month, and transaction date.
          </p>
        </div>
        <Link className="btn-link" href="/accounting/account-balances">
          Account balances
        </Link>
      </header>

      <form className={styles.filters} method="get">
        <label>
          Financial year
          <select name="year" defaultValue={year ? String(year.id) : ""}>
            <option value="">All financial years</option>
            {years.map((item) => (
              <option key={item.id} value={item.id}>
                {yearLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Month
          <select
            name="month"
            defaultValue={period ? String(period.id) : ""}
            disabled={!year}
          >
            <option value="">All months</option>
            {periods
              .filter(
                (item) =>
                  year &&
                  periodBelongsToYear(item, year)
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.period_name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Group
          <select value={businessId} disabled aria-label="Current group">
            <option value={businessId}>
              {businessRows[0]?.group_name ?? "Current group"}
            </option>
          </select>
        </label>
        <label>
          Division
          <select name="division" defaultValue={division?.id ?? ""}>
            <option value="">All divisions</option>
            {divisions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Branch
          <select name="branch" defaultValue={branch?.id ?? ""}>
            <option value="">All branches</option>
            {branches
              .filter(
                (item) =>
                  !division ||
                  Number(item.division_id) === Number(division.id)
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.branch_name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Transactions
          <select name="type" defaultValue={type}>
            <option value="ALL">Sales & purchase</option>
            <option value="SALES">Sales only</option>
            <option value="PURCHASE">Purchase only</option>
          </select>
        </label>
        <button type="submit">Apply filters</button>
        <Link href="/accounting/sales-purchase-report">
          Clear
        </Link>
      </form>

      <div className={styles.reportNotes}>
        <p>
          <strong>Profit</strong> = sales less recorded cost of goods sold.
          Profit % is profit divided by sales. It is left blank when a
          posted sales invoice has incomplete inventory valuation.
        </p>
        <p>
          <strong>Pending</strong> combines unpaid posted sales invoices
          and unpaid posted purchase invoices. Balance columns are
          group-wide closing balances; division and branch filters do
          not change them.
        </p>
        <p>
          Closing balances use the posted opening-balance journal,
          investor-bank activity opening positions, and account-assigned
          recorded or verified movements after the opening date. A
          balance is marked incomplete before that date or when a later
          movement has no identifiable account or a bank/cash account
          has no ledger mapping.
        </p>
        {branch && (
          <p>
            Purchases are received at the central warehouse and do not
            have a branch dimension, so purchase rows are excluded while
            a branch filter is selected.
          </p>
        )}
      </div>

      {!year && (
        <section className={styles.card}>
          <h2>Financial years</h2>
          <ReportTable>
            {years.map((item) => {
              const summary =
                yearSummaries.get(Number(item.id)) ?? emptySummary();
              const balance = snapshotForEndDate(item.ends_on);
              return (
                <ReportRow
                  key={item.id}
                  date={
                    <Link href={makeYearHref(item)}>
                      {yearLabel(item)}
                    </Link>
                  }
                  invoice="View months"
                  summary={summary}
                  balance={balance}
                />
              );
            })}
            {years.length === 0 && <EmptyRow />}
          </ReportTable>
        </section>
      )}

      {year && !period && (
        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <h2>{yearLabel(year)} · Months</h2>
            <Link href={queryHref(query, { year: undefined, month: undefined })}>
              All years
            </Link>
          </div>
          <ReportTable>
            {periods
              .filter(
                (item) =>
                  periodBelongsToYear(item, year)
              )
              .map((item) => {
                const summary =
                  periodSummaries.get(Number(item.id)) ?? emptySummary();
                const balance = snapshotForEndDate(item.end_date);
                return (
                  <ReportRow
                    key={item.id}
                    date={
                      <Link href={makePeriodHref(item, year)}>
                        {item.period_name}
                      </Link>
                    }
                    invoice="View days"
                    summary={summary}
                    balance={balance}
                  />
                );
              })}
          </ReportTable>
        </section>
      )}

      {year && period && (
        <section className={styles.card}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>{yearLabel(year)} · {period.period_name} · Days</h2>
              <Link href={queryHref(query, { month: undefined })}>
                Back to months
              </Link>
            </div>
          </div>
          <div className={styles.tableScroll}>
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Inv No</th>
                  <th>Total Purchase Amt</th>
                  <th>Total Sales Amt</th>
                  <th>Profit</th>
                  <th>Profit %</th>
                  <th>Group Acc Bal</th>
                  <th>Cash</th>
                  <th>Investor Bank Bal</th>
                  <th>Pending Amount</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => {
                  const summary =
                    dailySummaries.get(row.event_date) ?? emptySummary();
                  return (
                    <DailyReportRow
                      key={row.event_date}
                      date={row.event_date}
                      summary={summary}
                      balance={snapshots.get(row.event_date)}
                      details={detailsByDate.get(row.event_date) ?? []}
                    />
                  );
                })}
                {dailyRows.length === 0 && <EmptyRow />}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

function ReportTable({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.reportTable}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Inv No</th>
            <th>Total Purchase Amt</th>
            <th>Total Sales Amt</th>
            <th>Profit</th>
            <th>Profit %</th>
            <th>Group Acc Bal</th>
            <th>Cash</th>
            <th>Investor Bank Bal</th>
            <th>Pending Amount</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ReportRow({
  date,
  invoice,
  summary,
  balance,
}: {
  date: React.ReactNode;
  invoice: string;
  summary: FinancialSummary;
  balance: BalanceSnapshot | undefined;
}) {
  return (
    <tr>
      <td>{date}</td>
      <td>{invoice}</td>
      <td>{money(summary.purchases)}</td>
      <td>{money(summary.sales)}</td>
      <td>{profitAmount(summary)}</td>
      <td>{profitPercent(summary)}</td>
      <td>{closingBalance(balance, "groupBank")}</td>
      <td>{closingBalance(balance, "cash")}</td>
      <td>{closingBalance(balance, "investorBank")}</td>
      <td>{money(summary.pending)}</td>
    </tr>
  );
}

function DailyReportRow({
  date,
  summary,
  balance,
  details,
}: {
  date: string;
  summary: FinancialSummary;
  balance: BalanceSnapshot | undefined;
  details: DetailRow[];
}) {
  return (
    <>
      <tr className={styles.dayTotal}>
        <td>{date}</td>
        <td>
          <details>
            <summary>{details.length} invoice(s)</summary>
            <div className={styles.invoiceDetails}>
              <table>
                <thead>
                  <tr>
                    <th>Inv No</th>
                    <th>Type</th>
                    <th>Purchase Amt</th>
                    <th>Sales Amt</th>
                    <th>Profit</th>
                    <th>Profit %</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {details.map((item) => {
                    const profit =
                      item.cogs_amount === null
                        ? null
                        : Number(item.sales_amount) -
                          Number(item.cogs_amount);
                    return (
                      <tr key={`${item.transaction_type}:${item.id}`}>
                        <td>{item.invoice_no}</td>
                        <td>{item.transaction_type}</td>
                        <td>{money(Number(item.purchase_amount))}</td>
                        <td>{money(Number(item.sales_amount))}</td>
                        <td>
                          {item.transaction_type === "PURCHASE"
                            ? "—"
                            : profit === null
                              ? "Incomplete"
                              : money(profit)}
                        </td>
                        <td>
                          {item.transaction_type === "PURCHASE" ||
                            profit === null ||
                            Number(item.sales_amount) === 0
                            ? "—"
                            : `${((profit / Number(item.sales_amount)) * 100).toFixed(2)}%`}
                        </td>
                        <td>{money(Number(item.pending_amount))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </td>
        <td>{money(summary.purchases)}</td>
        <td>{money(summary.sales)}</td>
        <td>{profitAmount(summary)}</td>
        <td>{profitPercent(summary)}</td>
        <td>{closingBalance(balance, "groupBank")}</td>
        <td>{closingBalance(balance, "cash")}</td>
        <td>{closingBalance(balance, "investorBank")}</td>
        <td>{money(summary.pending)}</td>
      </tr>
    </>
  );
}

function EmptyRow() {
  return (
    <tr>
      <td className={styles.empty} colSpan={10}>
        No posted sales or purchases match these filters.
      </td>
    </tr>
  );
}

export default function SalesPurchaseReportPage(props: Props) {
  return (
    <Suspense fallback={<main className={styles.page}>Loading report…</main>}>
      <ReportContent {...props} />
    </Suspense>
  );
}
