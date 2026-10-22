/**
 * Ledger dry run. READ-ONLY: runs SELECT statements and prints what the
 * ledger would contain if every existing record were posted, then checks
 * the result against totals computed straight from the source tables.
 *
 *   npx tsx scripts/ledger-dry-run.ts [--business=1] [--opening-date=2026-10-12]
 *
 * Reads DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD (or
 * DB_SOCKET) from the environment. Exits 1 if any check fails or any
 * record could not be turned into a valid entry.
 */
import * as nextEnvModule from "@next/env";
import mysql from "mysql2/promise";

import { buildLedgerDrafts } from "../src/lib/ledger/source-events.ts";
import {
  formatMoney,
  parseMoney,
  trialBalance,
} from "../src/lib/ledger/posting-rules.ts";

// @next/env is CommonJS; the loader exposes it differently under tsx and node.
const nextEnv = (nextEnvModule as unknown as { default?: typeof nextEnvModule }).default ?? nextEnvModule;
nextEnv.loadEnvConfig(process.cwd());

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const businessId = Number(arg("business", "1"));
const openingDate = arg("opening-date", "");

const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);
const inr = (v: bigint) => formatMoney(v);

async function main() {
  for (const key of ["DB_HOST", "DB_DATABASE", "DB_USERNAME", "DB_PASSWORD"]) {
    if (!process.env[key] && !(key === "DB_HOST" && process.env.DB_SOCKET)) {
      throw new Error(
        `Missing ${key}. Put it in .env.local (same values the app uses) or set it in the shell.`
      );
    }
  }
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    socketPath: process.env.DB_SOCKET || undefined,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    await conn.query("SET SESSION TRANSACTION READ ONLY");

    const { drafts, chart, warnings, problems } = await buildLedgerDrafts(
      conn,
      businessId,
      openingDate ? { openingDate } : {}
    );

    // ----------------------------------------------------- entries listing
    console.log(`\nPROPOSED JOURNAL ENTRIES (${drafts.length})`);
    console.log("-".repeat(78));
    for (const d of drafts) {
      console.log(`${d.entryDate}  ${pad(d.sourceType, 17)} #${d.sourceId}  ${d.description}`);
      for (const l of d.lines) {
        const name = chart.get(l.accountCode)?.name ?? "?";
        console.log(
          `      ${l.accountCode} ${pad(name, 32)} ` +
            `${rpad(l.debit ? inr(l.debit) : "", 12)} ${rpad(l.credit ? inr(l.credit) : "", 12)}`
        );
      }
    }

    // --------------------------------------------------------- trial balance
    const tb = trialBalance(drafts);
    console.log("\nTRIAL BALANCE");
    console.log("-".repeat(78));
    let td = 0n;
    let tc = 0n;
    const net = new Map<string, bigint>();
    for (const r of tb) {
      td += r.debit;
      tc += r.credit;
      net.set(r.accountCode, r.debit - r.credit);
      console.log(
        `${r.accountCode} ${pad(chart.get(r.accountCode)?.name ?? "?", 34)} ` +
          `${rpad(inr(r.debit), 14)} ${rpad(inr(r.credit), 14)}`
      );
    }
    console.log(`${pad("TOTAL", 39)} ${rpad(inr(td), 14)} ${rpad(inr(tc), 14)}`);

    const bal = (code: string) => net.get(code) ?? 0n;
    const sumPrefix = (p: string) =>
      [...net.entries()].filter(([c]) => c.startsWith(p)).reduce((s, [, v]) => s + v, 0n);

    // ------------------------------------------------------ profit levels
    const gross = -(sumPrefix("4") + sumPrefix("5"));
    const setup = bal("6900");
    const operating = gross - (sumPrefix("6") - setup);
    console.log("\nPROFIT");
    console.log("-".repeat(78));
    console.log(`${pad("Gross profit (sales after discounts - cost of goods)", 60)} ${rpad(inr(gross), 14)}`);
    console.log(`${pad("Operating profit (after running expenses)", 60)} ${rpad(inr(operating), 14)}`);
    console.log(`${pad("Net profit (after set-up costs)", 60)} ${rpad(inr(operating - setup), 14)}`);

    // ---------------------------------------- independent tie-outs (raw SQL)
    const one = async (sql: string): Promise<bigint> => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(sql, [businessId]);
      return parseMoney(String(Object.values(rows[0])[0] ?? "0"));
    };
    // Signed values can be negative; parseMoney refuses those, so split.
    const signed = async (sql: string): Promise<bigint> => {
      const [rows] = await conn.query<mysql.RowDataPacket[]>(sql, [businessId]);
      const v = String(Object.values(rows[0])[0] ?? "0");
      return v.startsWith("-") ? -parseMoney(v.slice(1)) : parseMoney(v);
    };

    const salesTotal = await one(
      `SELECT COALESCE(SUM(grand_total),0) FROM acct_sales_headers WHERE legal_business_id=? AND status='POSTED'`
    );
    const salesPaid = await one(
      `SELECT COALESCE(SUM(p.amount),0) FROM acct_sales_payments p
         JOIN acct_sales_headers s ON s.id=p.sale_id AND s.legal_business_id=p.legal_business_id
        WHERE p.legal_business_id=? AND p.status='RECORDED' AND s.status='POSTED'`
    );
    const purchasesTotal = await one(
      `SELECT COALESCE(SUM(l.line_amount),0) FROM acct_purchase_lines l
         JOIN acct_purchase_headers h ON h.id=l.purchase_id AND h.legal_business_id=l.legal_business_id
        WHERE l.legal_business_id=? AND h.status='POSTED'`
    );
    const purchasesPaid = await one(
      `SELECT COALESCE(SUM(p.amount),0) FROM acct_purchase_payments p
         JOIN acct_purchase_headers h ON h.id=p.purchase_id AND h.legal_business_id=p.legal_business_id
        WHERE p.legal_business_id=? AND p.status='VERIFIED' AND h.status='POSTED'`
    );
    const expensesTotal = await one(
      `SELECT COALESCE(SUM(amount),0) FROM acct_expenses WHERE legal_business_id=? AND status='CONFIRMED'`
    );
    const expensesPaid = await one(
      `SELECT COALESCE(SUM(p.amount),0) FROM acct_expense_payments p
         JOIN acct_expenses e ON e.id=p.expense_id AND e.legal_business_id=p.legal_business_id
        WHERE p.legal_business_id=? AND p.status='RECORDED' AND e.status='CONFIRMED'`
    );
    const cogs = await one(
      `SELECT COALESCE(SUM(l.total_cost),0) FROM acct_sales_lines l
         JOIN acct_sales_headers s ON s.id=l.sale_id AND s.legal_business_id=l.legal_business_id
        WHERE l.legal_business_id=? AND s.status='POSTED'`
    );
    const returnsValue = await one(
      `SELECT COALESCE(SUM(refund_value),0) FROM acct_sales_returns WHERE legal_business_id=? AND status='POSTED'`
    );
    const returnedCost = await one(
      `SELECT COALESCE(SUM(l.total_cost),0) FROM acct_sales_return_lines l
         JOIN acct_sales_returns r ON r.id=l.return_id AND r.legal_business_id=l.legal_business_id
        WHERE l.legal_business_id=? AND r.status='POSTED'`
    );
    const damagedReturnCost = await one(
      `SELECT COALESCE(SUM(l.total_cost),0) FROM acct_sales_return_lines l
         JOIN acct_sales_returns r ON r.id=l.return_id AND r.legal_business_id=l.legal_business_id
        WHERE l.legal_business_id=? AND r.status='POSTED' AND l.item_condition='DAMAGED'`
    );
    const refundsPaid = await one(
      `SELECT COALESCE(SUM(f.amount),0) FROM acct_sales_refunds f
         JOIN acct_sales_returns r ON r.id=f.return_id AND r.legal_business_id=f.legal_business_id
        WHERE f.legal_business_id=? AND f.status='RECORDED' AND r.status='POSTED'`
    );
    const damagesCost = await one(
      `SELECT COALESCE(SUM(total_cost),0) FROM acct_stock_damages WHERE legal_business_id=? AND status='POSTED'`
    );
    // Stock value straight from the stock ledger (units moved x cost).
    const stockValue = await signed(
      `SELECT COALESCE(SUM(CASE WHEN quantity_change < 0 THEN -total_cost ELSE total_cost END),0)
         FROM acct_stock_movements
        WHERE legal_business_id=? AND movement_type NOT IN ('TRANSFER_OUT','TRANSFER_IN')`
    );

    const openingInventory = 0n; // stock was entered through purchases, not opening balances
    const checks: [string, bigint, bigint][] = [
      ["Trial balance: debits = credits", td, tc],
      ["Receivables (1100) = invoiced - received - returns + refunds", bal("1100"), salesTotal - salesPaid - returnsValue + refundsPaid],
      ["Payables (2000) = bought - paid", -bal("2000"), purchasesTotal - purchasesPaid],
      ["Accrued expenses (2200) = expenses - paid", -bal("2200"), expensesTotal - expensesPaid],
      ["Inventory (1200) = stock ledger value", bal("1200"), stockValue + openingInventory],
      ["COGS (5000) = cost on invoice lines - returned cost", bal("5000"), cogs - returnedCost],
      ["Damaged stock (5150) = damaged returns + shop damages", bal("5150"), damagedReturnCost + damagesCost],
      [
        "Net profit = (sales - discounts) - COGS - expenses",
        -(sumPrefix("4") + sumPrefix("5") + sumPrefix("6")),
        (salesTotal - returnsValue) - (cogs - returnedCost) - (damagedReturnCost + damagesCost) - expensesTotal,
      ],
      [
        "Assets = liabilities + capital + profit",
        sumPrefix("1"),
        -sumPrefix("2") - sumPrefix("3") - (sumPrefix("4") + sumPrefix("5") + sumPrefix("6")),
      ],
    ];

    console.log("\nTIE-OUT CHECKS (ledger vs. figures computed from the source tables)");
    console.log("-".repeat(78));
    let failed = 0;
    for (const [label, got, want] of checks) {
      const ok = got === want;
      if (!ok) failed++;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${pad(label, 52)} ledger ${rpad(inr(got), 12)}  source ${rpad(inr(want), 12)}`
      );
    }

    if (warnings.length) {
      console.log("\nWARNINGS");
      for (const w of warnings) console.log(`  - ${w}`);
    }
    if (problems.length) {
      console.log("\nPROBLEMS (records that could not be posted as they stand)");
      for (const p of problems) console.log(`  - ${p}`);
    }

    console.log(
      `\n${failed === 0 && problems.length === 0 ? "RESULT: OK" : "RESULT: NOT OK"}` +
        ` - nothing was written to the database.`
    );
    process.exitCode = failed === 0 && problems.length === 0 ? 0 : 1;
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
