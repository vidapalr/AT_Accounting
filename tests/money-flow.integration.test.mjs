// Integration test: expense money flows through the ledger builder on a real database.
//
// Needs a real MySQL/MariaDB test database and runs only when DB_DATABASE ends with "_test"
// (it writes, then deletes, its own rows under business 900002).
//
//   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USERNAME=root DB_PASSWORD=... DB_DATABASE=acct_ci_test \
//   node --experimental-strip-types --test tests/money-flow.integration.test.mjs
//
// Scenarios (from the outside review's acceptance list):
//   1. Owner-paid expense: expense and owner capital move; cash and bank stay unchanged.
//   2. Partial payment: Rs 1,000 expense, Rs 400 bank + Rs 250 cash -> Rs 350 still owed.
//   3. Every entry the builder produces balances, and nothing is reported as a problem.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const enabled = /_test$/.test(process.env.DB_DATABASE ?? "");
const BIZ = 900002;
const DIV = 900020;
const BRANCH = 900030;
const CASH = 900040;
const BANK = 900050;
const CH = { cash: 900101, bank: 900102, accrued: 900103, capital: 900104, transport: 900105 };

let conn;
let build;

const TABLES = [
  "acct_expense_payments", "acct_expenses", "acct_cash_accounts", "acct_bank_accounts",
  "acct_chart_of_accounts", "acct_branches", "acct_divisions",
];

async function cleanup() {
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of TABLES) await conn.query(`DELETE FROM ${t} WHERE legal_business_id = ?`, [BIZ]);
  await conn.query("DELETE FROM acct_legal_businesses WHERE id = ?", [BIZ]);
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

/** Net movement per ledger account, in paise: debit minus credit. */
function net(drafts) {
  const m = new Map();
  for (const d of drafts) for (const l of d.lines) {
    const v = (l.debit ?? 0n) - (l.credit ?? 0n);
    m.set(l.accountCode, (m.get(l.accountCode) ?? 0n) + v);
  }
  return m;
}

before(async () => {
  if (!enabled) return;
  const mysql = (await import("mysql2/promise")).default;
  conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  });
  ({ buildLedgerDrafts: build } = await import("../src/lib/ledger/source-events.ts"));
  await cleanup();
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  await conn.query("INSERT INTO acct_legal_businesses (id, legal_name) VALUES (?, 'Money flow test')", [BIZ]);
  await conn.query("INSERT INTO acct_divisions (id, legal_business_id, code, name) VALUES (?, ?, 'T', 'Test division')", [DIV, BIZ]);
  await conn.query("INSERT INTO acct_branches (id, legal_business_id, division_id, branch_code, branch_name) VALUES (?, ?, ?, 'TB', 'Test branch')", [BRANCH, BIZ, DIV]);
  const chart = [
    [CH.cash, "1001", "Cash", "ASSET", "CURRENT_ASSET", "DEBIT"],
    [CH.bank, "1010", "Bank", "ASSET", "CURRENT_ASSET", "DEBIT"],
    [CH.accrued, "2200", "Accrued expenses", "LIABILITY", "CURRENT_LIABILITY", "CREDIT"],
    [CH.capital, "3000", "Proprietor capital", "EQUITY", "CAPITAL", "CREDIT"],
    [CH.transport, "6030", "Transport", "EXPENSE", "OPERATING_EXPENSE", "DEBIT"],
  ];
  for (const [id, code, name, type, sub, bal] of chart) {
    await conn.query(
      `INSERT INTO acct_chart_of_accounts (id, legal_business_id, account_code, account_name, account_type, account_subtype, normal_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, BIZ, code, name, type, sub, bal]);
  }
  await conn.query(
    `INSERT INTO acct_cash_accounts (id, legal_business_id, cash_code, cash_name, cash_type, custodian_name, gl_account_id, division_id, branch_id, created_by)
     VALUES (?, ?, 'TC', 'Test drawer', 'SHOP_CASH', 'Tester', ?, ?, ?, 1)`, [CASH, BIZ, CH.cash, DIV, BRANCH]);
  await conn.query(
    `INSERT INTO acct_bank_accounts (id, legal_business_id, ownership_type, account_label, account_holder_name, bank_name, ifsc_code, account_type,
        account_number_encrypted, account_number_iv, account_number_auth_tag, account_number_last4, account_number_fingerprint, gl_account_id, created_by)
     VALUES (?, ?, 'BUSINESS', 'Test bank', 'Test', 'Test bank', 'TEST0000001', 'CURRENT', 'x', 'x', 'x', '0000', 'fp-money-flow-test', ?, 1)`, [BANK, BIZ, CH.bank]);

  const exp = (id, no, amount) => conn.query(
    `INSERT INTO acct_expenses (id, legal_business_id, division_id, branch_id, expense_no, expense_date, category, description, amount, status, created_by)
     VALUES (?, ?, ?, ?, ?, '2026-11-10', 'TRANSPORT', 'Test expense', ?, 'CONFIRMED', 1)`, [id, BIZ, DIV, BRANCH, no, amount]);
  const pay = (id, expense, method, source, amount, bank, cash) => conn.query(
    `INSERT INTO acct_expense_payments (id, legal_business_id, expense_id, payment_date, payment_method, payment_source, bank_account_id, cash_account_id, amount, status, created_by)
     VALUES (?, ?, ?, '2026-11-10', ?, ?, ?, ?, ?, 'RECORDED', 1)`, [id, BIZ, expense, method, source, bank, cash, amount]);

  await exp(900201, "T-OWNER", "10000.00");
  await pay(900301, 900201, "OTHER", "OWNER_PERSONAL", "10000.00", null, null);
  await exp(900202, "T-PART", "1000.00");
  await pay(900302, 900202, "BANK_TRANSFER", "BUSINESS_BANK", "400.00", BANK, null);
  await pay(900303, 900202, "CASH", "BUSINESS_CASH", "250.00", null, CASH);
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
});

after(async () => {
  if (!enabled) return;
  await cleanup();
  await conn.end();
});

test("no problems and every entry balances", { skip: !enabled }, async () => {
  const built = await build(conn, BIZ);
  assert.deepEqual(built.problems, []);
  assert.ok(built.drafts.length >= 4);
  for (const d of built.drafts) {
    const dr = d.lines.reduce((a, l) => a + (l.debit ?? 0n), 0n);
    const cr = d.lines.reduce((a, l) => a + (l.credit ?? 0n), 0n);
    assert.equal(dr, cr, `${d.description} does not balance`);
  }
});

test("owner-paid expense: owner capital rises, cash and bank do not move", { skip: !enabled }, async () => {
  const built = await build(conn, BIZ);
  const mine = built.drafts.filter((d) => /T-OWNER/.test(d.description));
  const m = net(mine);
  assert.equal(m.get("6030"), 1000000n);
  assert.equal(m.get("3000"), -1000000n);
  assert.equal(m.get("2200") ?? 0n, 0n);
  assert.equal(m.get("1001") ?? 0n, 0n);
  assert.equal(m.get("1010") ?? 0n, 0n);
});

test("partial payment: bank down 400, cash down 250, 350 still owed", { skip: !enabled }, async () => {
  const built = await build(conn, BIZ);
  const mine = built.drafts.filter((d) => /T-PART/.test(d.description));
  const m = net(mine);
  assert.equal(m.get("6030"), 100000n);
  assert.equal(m.get("1010"), -40000n);
  assert.equal(m.get("1001"), -25000n);
  assert.equal(m.get("2200"), -35000n); // credit balance = still owed
});
