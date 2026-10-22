
import nextEnv from "@next/env";
import mysql from "mysql2/promise";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const required = [
  "DB_HOST",
  "DB_DATABASE",
  "DB_USERNAME",
  "DB_PASSWORD",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing configuration: ${key}`);
  }
}

const expected = [
  "acct_funding_parties",
  "acct_funding_agreements",
  "acct_funding_transactions",
  "acct_profit_allocations",
];

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const [tables] = await connection.query(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (?, ?, ?, ?)`,
      expected
    );

    const found = new Set(
      tables.map((row) => row.TABLE_NAME)
    );

    const results = expected.map((table) => ({
      table,
      status: found.has(table) ? "OK" : "MISSING",
    }));

    console.table(results);

    const [constraints] = await connection.query(
      `SELECT
         TABLE_NAME,
         CONSTRAINT_NAME,
         CONSTRAINT_TYPE
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (?, ?, ?, ?)
       ORDER BY TABLE_NAME, CONSTRAINT_NAME`,
      expected
    );

    console.log("\nDatabase constraints:");
    console.table(constraints);

    const missing = expected.filter(
      (table) => !found.has(table)
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing funding tables: ${missing.join(", ")}`
      );
    }

    console.log(
      "\nFunding schema verification completed."
    );
    console.log("No business data was modified.");
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
});
