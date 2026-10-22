/**
 * Posts existing sales, purchase, expense, payment and deposit records into
 * the ledger as permanent journals.
 *
 *   Preview (writes nothing):
 *     npx tsx scripts/ledger-post.ts --user-email=you@example.com
 *   Post for real:
 *     npx tsx scripts/ledger-post.ts --user-email=you@example.com --confirm="POST 40 ENTRIES"
 *
 * - Opening balances are NOT posted here: they go through the app's own
 *   approval screen (Accounting > Opening Balances).
 * - The accounting period must be OPEN.
 * - All entries are written in one transaction; if the posted ledger does
 *   not match the preview exactly, everything is rolled back.
 * - Records that already have a journal are skipped, so it is safe to re-run.
 * - Posted journals cannot be edited or deleted (database triggers); mistakes
 *   are fixed with reversal entries.
 */
import * as nextEnvModule from "@next/env";
import mysql from "mysql2/promise";

import { postDrafts } from "../src/lib/ledger/post-drafts.ts";
import { buildLedgerDrafts } from "../src/lib/ledger/source-events.ts";
import { formatMoney, trialBalance } from "../src/lib/ledger/posting-rules.ts";

const nextEnv =
  (nextEnvModule as unknown as { default?: typeof nextEnvModule }).default ?? nextEnvModule;
nextEnv.loadEnvConfig(process.cwd());

const arg = (name: string, fallback = "") =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

async function main() {
  for (const key of ["DB_DATABASE", "DB_USERNAME", "DB_PASSWORD"]) {
    if (!process.env[key]) throw new Error(`Missing ${key} (put it in .env.local).`);
  }
  if (!process.env.DB_HOST && !process.env.DB_SOCKET) throw new Error("Missing DB_HOST.");
  const email = arg("user-email");
  if (!email) throw new Error("Pass --user-email=<the owner's login email>.");

  const businessId = Number(arg("business", "1"));
  const confirm = arg("confirm");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    socketPath: process.env.DB_SOCKET || undefined,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const [users] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id, status FROM acct_app_users WHERE email = ?",
      [email]
    );
    if (users.length !== 1 || String(users[0].status) !== "ACTIVE") {
      throw new Error(`No single active user with email ${email}.`);
    }
    const userId = Number(users[0].id);

    const built = await buildLedgerDrafts(conn, businessId);
    if (built.problems.length) {
      console.log("Cannot post. Fix these records first:");
      built.problems.forEach((p) => console.log(`  - ${p}`));
      process.exitCode = 1;
      return;
    }

    const drafts = built.drafts.filter((d) => d.sourceType !== "OPENING_BALANCE");
    const phrase = `POST ${drafts.length} ENTRIES`;

    const tb = trialBalance(drafts);
    console.log(`${drafts.length} entries ready (${drafts[0]?.entryDate} to ${drafts.at(-1)?.entryDate}).`);
    for (const r of tb) {
      console.log(
        `  ${r.accountCode} ${(built.chart.get(r.accountCode)?.name ?? "?").padEnd(34)}` +
          `${formatMoney(r.debit).padStart(14)}${formatMoney(r.credit).padStart(14)}`
      );
    }

    if (confirm !== phrase) {
      console.log(`\nPREVIEW ONLY - nothing written. To post, re-run with:\n  --confirm="${phrase}"`);
      return;
    }

    await conn.beginTransaction();
    try {
      const result = await postDrafts(conn, {
        businessId,
        userId,
        drafts,
        chart: built.chart,
        auditAction: "LEDGER_BACKFILL_POSTED",
      });

      // Independent check: read the posted journals back and compare with the preview.
      const postedKeys = result.posted.map((p) => p.draft);
      const expected = new Map(trialBalance(postedKeys).map((r) => [r.accountCode, r]));
      const [rows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT a.account_code, SUM(l.debit) AS d, SUM(l.credit) AS c
         FROM acct_journal_lines l
         JOIN acct_journal_entries j ON j.id = l.journal_entry_id AND j.legal_business_id = l.legal_business_id
         JOIN acct_chart_of_accounts a ON a.id = l.account_id AND a.legal_business_id = l.legal_business_id
         WHERE j.legal_business_id = ? AND j.status = 'POSTED'
           AND j.id IN (${result.posted.map(() => "?").join(",") || "NULL"})
         GROUP BY a.account_code`,
        [businessId, ...result.posted.map((p) => p.journalId)]
      );
      const got = new Map(rows.map((r) => [String(r.account_code), r]));
      for (const [code, want] of expected) {
        const g = got.get(code);
        if (!g || String(g.d) !== formatMoney(want.debit) || String(g.c) !== formatMoney(want.credit)) {
          throw new Error(`Posted ledger differs from preview for account ${code}`);
        }
      }

      await conn.commit();
      console.log(`\nPOSTED ${result.posted.length} entries; ${result.skipped.length} already posted and skipped.`);
    } catch (error) {
      await conn.rollback();
      console.log("\nNothing was posted (rolled back).");
      throw error;
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
