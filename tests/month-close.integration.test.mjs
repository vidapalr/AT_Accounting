// Integration test: a month cannot be closed while records are unfinished or not in the books.
//
// Needs a real MySQL/MariaDB test database and runs only when DB_DATABASE ends with "_test"
// (it writes, then deletes, its own rows under businesses 900003 and 900004).
//
//   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USERNAME=root DB_PASSWORD=... DB_DATABASE=acct_ci_test \
//   NODE_PATH=tests/stubs node --import tsx --test tests/month-close.integration.test.mjs

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const enabled = /_test$/.test(process.env.DB_DATABASE ?? "");
const DIRTY = 900003; // has an unfinished bill and a posted sale that is not in the books
const CLEAN = 900004; // has nothing at all
const DIV = 900060;

let pool;
let monthCloseChecks;

const TABLES = ["acct_sales_lines", "acct_sales_headers", "acct_divisions"];

async function cleanup() {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const biz of [DIRTY, CLEAN]) {
    for (const t of TABLES) await pool.query(`DELETE FROM ${t} WHERE legal_business_id = ?`, [biz]);
    await pool.query("DELETE FROM acct_legal_businesses WHERE id = ?", [biz]);
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}

before(async () => {
  if (!enabled) return;
  const mysql = (await import("mysql2/promise")).default;
  pool = mysql.createPool({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
    connectionLimit: 4,
  });
  ({ monthCloseChecks } = await import("../src/lib/month-close.ts"));
  await cleanup();
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const biz of [DIRTY, CLEAN]) {
    await pool.query("INSERT INTO acct_legal_businesses (id, legal_name) VALUES (?, 'Month close test')", [biz]);
  }
  await pool.query("INSERT INTO acct_divisions (id, legal_business_id, code, name) VALUES (?, ?, 'T', 'Test division')", [DIV, DIRTY]);
  await pool.query(
    `INSERT INTO acct_sales_headers (id, legal_business_id, division_id, branch_id, location_id, invoice_no, invoice_date, subtotal, discount_amount, grand_total, shipping_charge, status, created_by)
     VALUES (900601, ?, ?, 1, 1, 'T-DRAFT', '2026-11-12', 500, 0, 500, 0, 'DRAFT', 1),
            (900602, ?, ?, 1, 1, 'T-POSTED', '2026-11-12', 800, 0, 800, 0, 'POSTED', 1)`, [DIRTY, DIV, DIRTY, DIV]);
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
});

after(async () => {
  if (!enabled) return;
  await cleanup();
  await pool.end();
});

const byKey = (checks, key) => checks.find((c) => c.key === key);

test("an unfinished bill and a sale not yet in the books hold the month back", { skip: !enabled }, async () => {
  const checks = await monthCloseChecks(pool, DIRTY, "2026-11");
  const drafts = byKey(checks, "drafts");
  const ledger = byKey(checks, "ledger");
  assert.ok(drafts, "drafts check exists");
  assert.ok(ledger, "ledger check exists");
  assert.equal(drafts.ok, false, drafts.detail);
  assert.equal(ledger.ok, false, ledger.detail);
});

test("a business with nothing unfinished passes those two checks", { skip: !enabled }, async () => {
  const checks = await monthCloseChecks(pool, CLEAN, "2026-11");
  assert.equal(byKey(checks, "drafts").ok, true, byKey(checks, "drafts").detail);
  assert.equal(byKey(checks, "ledger").ok, true, byKey(checks, "ledger").detail);
});
