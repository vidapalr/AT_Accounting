
import nextEnv from "@next/env";
import mysql from "mysql2/promise";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  try {
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'acct_agreement_funding_policies'`
    );

    if (tables.length !== 1) {
      throw new Error("Funding policy table not found.");
    }

    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'acct_agreement_funding_policies'
       ORDER BY ORDINAL_POSITION`
    );

    console.table(columns);

    const [existing] = await connection.execute(
      `SELECT
         a.agreement_no,
         a.status AS agreement_status,
         v.version_no,
         v.version_status,
         p.policy_status,
         p.funding_model
       FROM acct_funding_agreements a
       JOIN acct_agreement_versions v
         ON v.agreement_id = a.id
        AND v.legal_business_id = a.legal_business_id
       LEFT JOIN acct_agreement_funding_policies p
         ON p.agreement_version_id = v.id
        AND p.agreement_id = a.id
        AND p.legal_business_id = a.legal_business_id
       ORDER BY a.id, v.version_no`
    );

    console.log("\nAgreement policy coverage:");
    console.table(existing);

    console.log(
      "\nFunding policy schema verified."
    );
    console.log(
      "No business transactions were modified."
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
