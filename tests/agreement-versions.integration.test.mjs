// Integration test: amended agreements must stay visible to receipts,
// participation and share-capacity checks.
//
// Needs a real MySQL/MariaDB test database and runs only when
// DB_DATABASE ends with "_test" (it writes, then deletes, its own rows).
//
//   DB_HOST=127.0.0.1 DB_PORT=3307 DB_USERNAME=apptest \
//   DB_PASSWORD=... DB_DATABASE=acct_test NODE_PATH=tests/stubs \
//   node --import tsx --test tests/agreement-versions.integration.test.mjs
//
// Background: version 1 of an agreement becomes SUPERSEDED once an
// amendment is approved. Several queries filtered on
// "version_no = 1 AND APPROVED", so an amended investor disappeared from
// the funding-receipt screen, and a second investor could be activated on
// top of the first (combined share above 100%).

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

const dbName = process.env.DB_DATABASE ?? "";
const enabled = /_test$/.test(dbName);

const BIZ = 900001;
const PARTY = 900010;
const AGREEMENT = 900020; // existing investor, amended: v1 SUPERSEDED, v2 APPROVED
const NEW_AGREEMENT = 900021; // candidate being activated
const V1 = 900030;
const V2 = 900031;

let db;
let getReceiptAgreements;
let getProfitParticipations;
let validateProfitShareCapacity;

async function cleanup(conn) {
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const [table, column, value] of [
    ["acct_agreement_funding_policies", "legal_business_id", BIZ],
    ["acct_agreement_versions", "legal_business_id", BIZ],
    ["acct_funding_agreements", "legal_business_id", BIZ],
    ["acct_funding_parties", "legal_business_id", BIZ],
  ]) {
    await conn.query(`DELETE FROM ${table} WHERE ${column} = ?`, [value]);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

before(async () => {
  if (!enabled) return;

  ({ db } = await import("../src/lib/db.ts"));
  ({ getReceiptAgreements } = await import("../src/lib/funding-transactions.ts"));
  ({ getProfitParticipations } = await import("../src/lib/profit-participation.ts"));
  ({ validateProfitShareCapacity } = await import("../src/lib/profit-share-validator.ts"));

  const conn = await db.getConnection();
  try {
    await cleanup(conn);
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    await conn.query(
      `INSERT INTO acct_funding_parties
         (id, legal_business_id, party_code, full_name)
       VALUES (?, ?, 'TEST-INV', 'Test Investor')`,
      [PARTY, BIZ]
    );

    await conn.query(
      `INSERT INTO acct_funding_agreements
         (id, legal_business_id, party_id, agreement_no, funding_type,
          effective_from, status, created_by)
       VALUES
         (?, ?, ?, 'TEST-ACTIVE', 'PROFIT_LINKED', '2026-10-01', 'ACTIVE', 1),
         (?, ?, ?, 'TEST-NEW',    'PROFIT_LINKED', '2026-11-01', 'DRAFT',  1)`,
      [AGREEMENT, BIZ, PARTY, NEW_AGREEMENT, BIZ, PARTY]
    );

    const terms = JSON.stringify({
      funding_scope: "GROUP",
      profit_share_percentage: "50",
    });

    await conn.query(
      `INSERT INTO acct_agreement_versions
         (id, legal_business_id, agreement_id, version_no, version_status,
          effective_from, terms_json, change_reason, created_by)
       VALUES
         (?, ?, ?, 1, 'SUPERSEDED', '2026-10-01', ?, 'initial', 1),
         (?, ?, ?, 2, 'APPROVED',   '2026-10-17', ?, 'amendment', 1)`,
      [V1, BIZ, AGREEMENT, terms, V2, BIZ, AGREEMENT, terms]
    );

    await conn.query(
      `INSERT INTO acct_agreement_funding_policies
         (legal_business_id, agreement_id, agreement_version_id,
          policy_status, funding_model, profit_entitlement_model,
          maximum_outstanding, additional_funding_allowed, created_by)
       VALUES (?, ?, ?, 'CONFIRMED', 'REVOLVING', 'FIXED_CONTRACTUAL',
               1000000.00, 1, 1)`,
      [BIZ, AGREEMENT, V2]
    );

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    conn.release();
  }
});

after(async () => {
  if (!enabled) return;
  const conn = await db.getConnection();
  try {
    await cleanup(conn);
  } finally {
    conn.release();
    await db.end();
  }
});

async function check(percentage, effectiveFrom = "2026-11-01") {
  const conn = await db.getConnection();
  try {
    return await validateProfitShareCapacity(conn, {
      businessId: BIZ,
      excludeAgreementId: NEW_AGREEMENT,
      pool: { divisionId: null, branchId: null },
      percentage,
      effectiveFrom,
      effectiveTo: null,
    });
  } finally {
    conn.release();
  }
}

test("amended agreement is offered on the funding receipts screen",
  { skip: !enabled && "needs a *_test database" },
  async () => {
    const rows = await getReceiptAgreements(BIZ);
    const found = rows.find((r) => r.id === AGREEMENT);
    assert.ok(found, "agreement with SUPERSEDED v1 / APPROVED v2 must be listed");
    assert.equal(found.funding_model, "REVOLVING");
  });

test("participation list shows the current approved share",
  { skip: !enabled && "needs a *_test database" },
  async () => {
    const rows = await getProfitParticipations(BIZ);
    const found = rows.find((r) => r.agreement_id === AGREEMENT);
    assert.ok(found, "amended agreement must appear");
    assert.equal(String(found.share_percentage), "50");
    assert.equal(found.effective_from, "2026-10-17");
  });

test("a second investor cannot push the pool above 100%",
  { skip: !enabled && "needs a *_test database" },
  async () => {
    const tooMuch = await check("60");
    assert.equal(tooMuch.valid, false);
    assert.equal(tooMuch.maximumAllocated, "110.0000");
    assert.equal(tooMuch.conflictDate, "2026-11-01");
  });

test("a second investor up to the remaining share is accepted",
  { skip: !enabled && "needs a *_test database" },
  async () => {
    const exact = await check("50");
    assert.equal(exact.valid, true);
    assert.equal(exact.maximumAllocated, "100.0000");

    const less = await check("40");
    assert.equal(less.valid, true);
    assert.equal(less.maximumAllocated, "90.0000");
  });
