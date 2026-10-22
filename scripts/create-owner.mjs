
import nextEnv from "@next/env";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { password } from "@inquirer/prompts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

async function main() {
  const email = process.env.GROUP_OWNER_EMAIL?.trim().toLowerCase();
  const name = process.env.GROUP_OWNER_NAME?.trim();

  if (!email || !name) {
    throw new Error("Missing Group Owner name or email.");
  }

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

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_DATABASE,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  });

  try {
    const [businesses] = await connection.execute(
      `SELECT id FROM acct_legal_businesses
       WHERE id = ?`,
      [1]
    );

    if (businesses.length !== 1) {
      throw new Error("Abhiram Group business record not found.");
    }

    const [existing] = await connection.execute(
      `SELECT id FROM acct_app_users WHERE email = ?`,
      [email]
    );

    if (existing.length > 0) {
      throw new Error("User already exists. No changes made.");
    }

    console.log("Creating Abhiram Group Owner account");
    console.log("Email:", email);

    const newPassword = await password({
      message: "Enter a strong password:",
      mask: "*",
      validate(value) {
        if (value.length < 12) {
          return "Use at least 12 characters.";
        }
        if (Buffer.byteLength(value, "utf8") > 72) {
          return "Password is too long for bcrypt.";
        }
        return true;
      },
    });

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await connection.beginTransaction();

    try {
      const [userResult] = await connection.execute(
        `INSERT INTO acct_app_users
         (full_name, email, password_hash, status)
         VALUES (?, ?, ?, 'ACTIVE')`,
        [name, email, passwordHash]
      );

      const userId = userResult.insertId;

      await connection.execute(
        `INSERT INTO acct_user_access
         (user_id, legal_business_id, division_id, role)
         VALUES (?, ?, NULL, 'GROUP_OWNER')`,
        [userId, 1]
      );

      await connection.execute(
        `INSERT INTO acct_audit_events
         (legal_business_id, actor_user_id,
          action, subject_type, subject_id, details_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          1,
          userId,
          "USER_CREATED",
          "APP_USER",
          userId,
          JSON.stringify({
            role: "GROUP_OWNER",
            source: "local_bootstrap",
          }),
        ]
      );

      await connection.commit();

      console.log("\nOWNER ACCOUNT CREATED");
      console.log("User ID:", userId);
      console.log("Role: GROUP_OWNER");
      console.log("Business ID: 1");
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Setup failed:", error.message);
  process.exitCode = 1;
});
