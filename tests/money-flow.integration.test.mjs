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
//   5. Purchase of 10,000 goods, 2,000 sent back (1,500 credit agreed), 5,000 paid from bank.
//   4. Sale with a partial return and an exchange: revenue, discounts, cost of goods, stock,
//      customer balance and cash all end where they should.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const enabled = /_test$/.test(process.env.DB_DATABASE ?? "");
const BIZ = 900002;
const DIV = 900020;
const BRANCH = 900030;
const CASH = 900040;
const BANK = 900050;
const CH = { cash: 900101, bank: 900102, accrued: 900103, capital: 900104, transport: 900105,
  payables: 900114, supplierLoss: 900115, receivables: 900106, inventory: 900107, sales: 900108, discounts: 900109, returns: 900110, cogs: 900111, damaged: 900112, delivery: 900113 };

let conn;
let build;

const TABLES = [
  "acct_supplier_returns", "acct_purchase_payments", "acct_purchase_lines", "acct_purchase_headers",
  "acct_sales_refunds", "acct_sales_return_lines", "acct_sales_returns", "acct_sales_payments", "acct_sales_lines", "acct_sales_headers",
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
    [CH.payables, "2000", "Payables", "LIABILITY", "CURRENT_LIABILITY", "CREDIT"],
    [CH.supplierLoss, "5160", "Supplier return loss", "EXPENSE", "COST_OF_SALES", "DEBIT"],
    [CH.receivables, "1100", "Receivables", "ASSET", "CURRENT_ASSET", "DEBIT"],
    [CH.inventory, "1200", "Inventory", "ASSET", "CURRENT_ASSET", "DEBIT"],
    [CH.sales, "4000", "Sales", "REVENUE", "SALES", "CREDIT"],
    [CH.discounts, "4200", "Sales discounts", "REVENUE", "CONTRA_REVENUE", "DEBIT"],
    [CH.returns, "4210", "Sales returns", "REVENUE", "CONTRA_REVENUE", "DEBIT"],
    [CH.delivery, "4300", "Delivery income", "REVENUE", "OTHER_INCOME", "CREDIT"],
    [CH.cogs, "5000", "Cost of goods sold", "EXPENSE", "COST_OF_SALES", "DEBIT"],
    [CH.damaged, "5150", "Damaged stock", "EXPENSE", "COST_OF_SALES", "DEBIT"],
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

  // Sale S1: 5,000 less 500 discount = 4,500, cost 3,000, paid in cash.
  // Return R1: 1,000 selling value, 900 refunded (after its discount share), goods worth 600 back in stock, refund paid in cash.
  // Exchange: new sale S2 of 1,200 (cost 700) paid in cash.
  const sale = (id, no, subtotal, discount, total, cost) => conn.query(
    `INSERT INTO acct_sales_headers (id, legal_business_id, division_id, branch_id, location_id, invoice_no, invoice_date, subtotal, discount_amount, grand_total, shipping_charge, status, created_by)
     VALUES (?, ?, ?, ?, 1, ?, '2026-11-10', ?, ?, ?, 0, 'POSTED', 1)`, [id, BIZ, DIV, BRANCH, no, subtotal, discount, total])
    .then(() => conn.query(
      `INSERT INTO acct_sales_lines (legal_business_id, division_id, sale_id, variant_id, quantity, unit_price, line_total, total_cost)
       VALUES (?, ?, ?, 1, 1, ?, ?, ?)`, [BIZ, DIV, id, subtotal, subtotal, cost]));
  const spay = (id, saleId, amount) => conn.query(
    `INSERT INTO acct_sales_payments (id, legal_business_id, division_id, sale_id, payment_date, payment_method, cash_account_id, amount, status, created_by)
     VALUES (?, ?, ?, ?, '2026-11-10', 'CASH', ?, ?, 'RECORDED', 1)`, [id, BIZ, DIV, saleId, CASH, amount]);
  await sale(900401, "T-S1", "5000.00", "500.00", "4500.00", "3000.00");
  await spay(900411, 900401, "4500.00");
  await conn.query(
    `INSERT INTO acct_sales_returns (id, legal_business_id, division_id, branch_id, location_id, sale_id, return_no, return_date, reason, gross_value, refund_value, status, created_by)
     VALUES (900421, ?, ?, ?, 1, 900401, 'T-R1', '2026-11-10', 'WRONG_SIZE', 1000.00, 900.00, 'POSTED', 1)`, [BIZ, DIV, BRANCH]);
  await conn.query(
    `INSERT INTO acct_sales_return_lines (legal_business_id, return_id, sale_line_id, variant_id, quantity, gross_value, refund_value, unit_cost, total_cost, item_condition)
     VALUES (?, 900421, 1, 1, 1, 1000.00, 900.00, 600.00, 600.00, 'RESELLABLE')`, [BIZ]);
  await conn.query(
    `INSERT INTO acct_sales_refunds (id, legal_business_id, division_id, return_id, refund_date, amount, payment_method, cash_account_id, status, created_by)
     VALUES (900431, ?, ?, 900421, '2026-11-10', 900.00, 'CASH', ?, 'RECORDED', 1)`, [BIZ, DIV, CASH]);
  await sale(900402, "T-S2", "1200.00", "0.00", "1200.00", "700.00");
  await spay(900412, 900402, "1200.00");

  // Purchase P1: goods 10,000 received. 2,000 of it sent back, supplier agrees to credit 1,500. 5,000 paid from the bank.
  await conn.query(
    `INSERT INTO acct_purchase_headers (id, legal_business_id, division_id, purchase_no, supplier_id, invoice_date, receiving_location_id, status, created_by)
     VALUES (900501, ?, ?, 'T-P1', 1, '2026-11-10', 1, 'POSTED', 1)`, [BIZ, DIV]);
  await conn.query(
    `INSERT INTO acct_purchase_lines (legal_business_id, division_id, purchase_id, line_no, variant_id, quantity, unit_cost, line_amount)
     VALUES (?, ?, 900501, 1, 1, 100, 100.00, 10000.00)`, [BIZ, DIV]);
  await conn.query(
    `INSERT INTO acct_purchase_payments (id, legal_business_id, division_id, purchase_id, payment_no, payment_date, amount, payment_method, payment_source, source_bank_account_id, status, created_by)
     VALUES (900511, ?, ?, 900501, 'T-PAY1', '2026-11-10', 5000.00, 'BANK_TRANSFER', 'BUSINESS_BANK', ?, 'VERIFIED', 1)`, [BIZ, DIV, BANK]);
  await conn.query(
    `INSERT INTO acct_supplier_returns (id, legal_business_id, division_id, supplier_id, location_id, return_no, return_date, reason, cost_value, agreed_value, status, created_by)
     VALUES (900521, ?, ?, 1, 1, 'T-SR1', '2026-11-10', 'DAMAGED', 2000.00, 1500.00, 'POSTED', 1)`, [BIZ, DIV]);
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

test("sale, partial return and exchange: revenue, stock, customer balance and cash end right", { skip: !enabled }, async () => {
  const built = await build(conn, BIZ);
  assert.deepEqual(built.problems, []);
  const mine = built.drafts.filter((d) => /T-S1|T-S2|T-R1|return T-R1/.test(d.description));
  const m = net(mine);
  assert.equal(m.get("4000"), -620000n);          // sales 5,000 + 1,200
  assert.equal(m.get("4200"), 40000n);            // discounts 500 given, 100 given back on the return
  assert.equal(m.get("4210"), 100000n);           // returns 1,000
  assert.equal(m.get("5000"), 310000n);           // cost of goods 3,700 less 600 restocked
  assert.equal(m.get("1200"), -310000n);          // stock down by the same 3,100
  assert.equal(m.get("1100") ?? 0n, 0n);          // the customer owes nothing
  assert.equal(m.get("1001"), 480000n);           // cash: +4,500 - 900 + 1,200
  // Net revenue (sales - discounts - returns) is 4,800 and equals the cash taken in.
  assert.equal(-(m.get("4000") ?? 0n) - (m.get("4200") ?? 0n) - (m.get("4210") ?? 0n), 480000n);
});

test("purchase with a return and a part payment: stock, supplier balance, loss and bank end right", { skip: !enabled }, async () => {
  const built = await build(conn, BIZ);
  assert.deepEqual(built.problems, []);
  const mine = built.drafts.filter((d) => /T-P1|T-PAY1|T-SR1/.test(d.description));
  const m = net(mine);
  assert.equal(m.get("1200"), 800000n);     // stock: +10,000 - 2,000
  assert.equal(m.get("5160"), 50000n);      // loss on the return: 2,000 cost - 1,500 agreed
  assert.equal(m.get("2000"), -350000n);    // still owed to the supplier: 10,000 - 1,500 - 5,000
  assert.equal(m.get("1010"), -500000n);    // bank paid 5,000
  // Everything in this scenario balances on its own.
  let total = 0n;
  for (const v of m.values()) total += v;
  assert.equal(total, 0n);
});
