
import nextEnv from "@next/env";
import mysql from "mysql2/promise";


const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

console.log("\nDATABASE CONFIGURATION CHECK");
console.log("-------------------------------");

console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_DATABASE:", process.env.DB_DATABASE);
console.log("DB_USERNAME:", process.env.DB_USERNAME);
console.log(
  "DB_PASSWORD:",
  process.env.DB_PASSWORD ? "Configured" : "Missing"
);

const apply = process.argv.includes("--apply");

const config = {
  legalName: process.env.ACCOUNTING_LEGAL_NAME?.trim(),
  tradingName: process.env.ACCOUNTING_TRADING_NAME?.trim(),
  divisionCode: process.env.ACCOUNTING_DIVISION_CODE?.trim(),
  divisionName: process.env.ACCOUNTING_DIVISION_NAME?.trim(),
};

async function main() {
  if (Object.values(config).some((value) => !value)) {
    throw new Error("Missing ACCOUNTING_* configuration.");
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    connectTimeout: 10000,
  });

  try {
    // Never overwrite existing accounting master data.
    const tables = [
      "acct_legal_businesses",
      "acct_divisions",
      "acct_financial_years",
    ];

    for (const table of tables) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS total FROM ${table}`
      );

      if (Number(rows[0].total) !== 0) {
        throw new Error(
          `${table} already contains records. ` +
          "Setup stopped to prevent duplication."
        );
      }
    }

    console.log("\nABHIRAM GROUP INITIAL SETUP");
    console.log("-----------------------------");
    console.log("Legal name:", config.legalName);
    console.log("Trading name:", config.tradingName);
    console.log("Division:", config.divisionName);
    console.log("Division code:", config.divisionCode);
    console.log("Financial year: 2026-27");
    console.log("Financial year starts: 2026-04-01");
    console.log("Financial year ends: 2027-03-31");

    if (!apply) {
      console.log("\nDRY RUN ONLY — NO DATA CHANGED");
      console.log("Run with --apply after reviewing.");
      return;
    }

    await connection.beginTransaction();

    try {
      const [business] = await connection.execute(
        `INSERT INTO acct_legal_businesses
         (legal_name, trading_name, legal_form, currency_code)
         VALUES (?, ?, 'PROPRIETORSHIP', 'INR')`,
        [config.legalName, config.tradingName]
      );

      const businessId = business.insertId;

      const [division] = await connection.execute(
        `INSERT INTO acct_divisions
         (legal_business_id, code, name, status)
         VALUES (?, ?, ?, 'ACTIVE')`,
        [
          businessId,
          config.divisionCode,
          config.divisionName,
        ]
      );

      const [financialYear] = await connection.execute(
        `INSERT INTO acct_financial_years
         (legal_business_id, label, starts_on, ends_on, status)
         VALUES (?, '2026-27', '2026-04-01',
                 '2027-03-31', 'OPEN')`,
        [businessId]
      );

      const auditEvents = [
        {
          action: "BUSINESS_CREATED",
          subjectType: "LEGAL_BUSINESS",
          subjectId: businessId,
        },
        {
          action: "DIVISION_CREATED",
          subjectType: "DIVISION",
          subjectId: division.insertId,
        },
        {
          action: "FINANCIAL_YEAR_CREATED",
          subjectType: "FINANCIAL_YEAR",
          subjectId: financialYear.insertId,
        },
      ];

      for (const event of auditEvents) {
        await connection.execute(
          `INSERT INTO acct_audit_events
           (legal_business_id, actor_user_id,
            action, subject_type, subject_id, details_json)
           VALUES (?, NULL, ?, ?, ?, ?)`,
          [
            businessId,
            event.action,
            event.subjectType,
            event.subjectId,
            JSON.stringify({
              source: "local_initial_setup",
              executedBy: "system_bootstrap",
            }),
          ]
        );
      }

      await connection.commit();

      console.log("\nSETUP COMPLETED SUCCESSFULLY");
      console.log("Business ID:", businessId);
      console.log("Division ID:", division.insertId);
      console.log("Financial Year ID:", financialYear.insertId);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("\nSETUP FAILED:", error.message);
  process.exitCode = 1;
});
